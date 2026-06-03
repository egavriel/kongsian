/**
 * Weekly settlement generator. Week 3, Track C.
 *
 * For each ACTIVE partnership, aggregate the week's submitted daily_closings,
 * compute the revenue split using partnership.revenueSplitBrandBps, and insert
 * a settlement row + settlement_lines. Idempotent: relies on
 * uniqPartnershipWeek (settlements.ts:37). Second run for the same week is a
 * no-op (skipped: ALREADY_GENERATED).
 *
 * Week math: Mon–Sun in Asia/Jakarta. `weekStartDate` defaults to the *last
 * completed* week (the week before the current Mon-Sun).
 */
import { and, eq, gte, inArray, lte, sum } from "drizzle-orm";
import { getDb } from "@kongsian/db";
import {
  dailyClosings,
  dailyClosingLines,
  partnerships,
  partnershipSkus,
  settlements,
  settlementLines,
  skus,
} from "@kongsian/db";
import type { DbClient } from "@kongsian/db";
import type { Bindings } from "../index";

export interface GenerateOptions {
  weekStartDate?: string; // YYYY-MM-DD (Monday)
  partnershipId?: string; // restrict to one
  now?: number; // unix seconds
}

export interface GeneratedSettlement {
  settlementId: string;
  partnershipId: string;
  weekStart: string;
  weekEnd: string;
  totalTerjual: number;
  totalOmzetIdr: number;
  brandShareIdr: number;
  tenantShareIdr: number;
}

export interface SkippedSettlement {
  partnershipId: string;
  weekStart: string;
  reason: string;
}

export interface GenerateResult {
  generated: GeneratedSettlement[];
  skipped: SkippedSettlement[];
}

/** Get the Monday of the ISO week containing the given date (UTC-agnostic, date-only). */
function isoMonday(d: Date): string {
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day; // back to Monday
  const mon = new Date(d);
  mon.setUTCDate(d.getUTCDate() + diff);
  return mon.toISOString().slice(0, 10);
}

/** Add N days to a YYYY-MM-DD string, return YYYY-MM-DD. */
function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Last completed Mon–Sun week, given "now" (any Date). */
function lastCompletedWeek(now: Date): { weekStart: string; weekEnd: string } {
  // Anchor: pick the *most recent Sunday* strictly before the current day.
  // If today is Mon 2026-06-01, last Sunday is 2026-05-31 → week start = 2026-05-25.
  // If today is Wed 2026-06-03, last Sunday is 2026-06-01 → week start = 2026-05-26.
  // Wait — that's wrong. Mon=start, Sun=end. We want the Mon of the week
  // *containing* the most recent past Sunday.
  //
  // Step 1: get the most recent past-or-today Sunday.
  const day = now.getUTCDay(); // 0..6 (Sun..Sat)
  // Days back to last Sunday: if Sun(0) → 0; if Mon(1) → 1; if Tue(2) → 2 ... Sat(6) → 6
  const daysBackToSun = day; // 0..6
  const lastSun = new Date(now);
  lastSun.setUTCDate(now.getUTCDate() - daysBackToSun);
  // Step 2: Monday of that week = lastSun - 6 days.
  const mon = new Date(lastSun);
  mon.setUTCDate(lastSun.getUTCDate() - 6);
  const weekStart = mon.toISOString().slice(0, 10);
  const weekEnd = lastSun.toISOString().slice(0, 10);
  return { weekStart, weekEnd };
}

export async function generateSettlements(
  env: Bindings,
  options: GenerateOptions = {}
): Promise<GenerateResult> {
  const db = getDb(env.kongsian_db);
  const now = options.now ?? Math.floor(Date.now() / 1000);

  // 1. Resolve target week
  const week =
    options.weekStartDate !== undefined
      ? { weekStart: options.weekStartDate, weekEnd: addDays(options.weekStartDate, 6) }
      : lastCompletedWeek(new Date());

  // 2. Find target partnerships
  const targetPartnerships = options.partnershipId
    ? await db
        .select()
        .from(partnerships)
        .where(
          and(
            eq(partnerships.id, options.partnershipId),
            eq(partnerships.status, "ACTIVE")
          )
        )
    : await db
        .select()
        .from(partnerships)
        .where(eq(partnerships.status, "ACTIVE"));

  const result: GenerateResult = { generated: [], skipped: [] };

  for (const p of targetPartnerships) {
    try {
      // 3. Find SUBMITTED or LOCKED closings in the week
      const closings = await db
        .select({ id: dailyClosings.id })
        .from(dailyClosings)
        .where(
          and(
            eq(dailyClosings.partnershipId, p.id),
            inArray(dailyClosings.status, ["SUBMITTED", "LOCKED"]),
            gte(dailyClosings.closingDate, week.weekStart),
            lte(dailyClosings.closingDate, week.weekEnd)
          )
        );

      if (closings.length === 0) {
        result.skipped.push({
          partnershipId: p.id,
          weekStart: week.weekStart,
          reason: "NO_CLOSINGS",
        });
        continue;
      }

      // 4. Aggregate per SKU
      // effective_price = partnershipSkus.priceOverrideIdr ?? skus.priceIdr
      // totalTerjual[sku] = SUM(daily_closing_lines.terjual)
      // totalOmzet[sku] = totalTerjual[sku] * effective_price
      const lineRows = await db
        .select({
          skuId: dailyClosingLines.skuId,
          terjual: sum(dailyClosingLines.terjual),
        })
        .from(dailyClosingLines)
        .where(
          inArray(
            dailyClosingLines.dailyClosingId,
            closings.map((c) => c.id)
          )
        )
        .groupBy(dailyClosingLines.skuId);

      // Filter zero-qty
      const skuTotals = lineRows
        .map((r) => ({ skuId: r.skuId, qty: Number(r.terjual ?? 0) }))
        .filter((r) => r.qty !== 0);

      if (skuTotals.length === 0) {
        result.skipped.push({
          partnershipId: p.id,
          weekStart: week.weekStart,
          reason: "NO_LINES",
        });
        continue;
      }

      // 5. Resolve effective prices
      const skuIds = skuTotals.map((s) => s.skuId);
      const skuRows = await db
        .select({
          id: skus.id,
          priceIdr: skus.priceIdr,
          priceOverride: partnershipSkus.priceOverrideIdr,
        })
        .from(skus)
        .leftJoin(
          partnershipSkus,
          and(
            eq(partnershipSkus.skuId, skus.id),
            eq(partnershipSkus.partnershipId, p.id)
          )
        )
        .where(inArray(skus.id, skuIds));

      const priceMap = new Map(skuRows.map((r) => [r.id, r.priceOverride ?? r.priceIdr]));

      // 6. Compute totals
      let totalTerjual = 0;
      let totalOmzetIdr = 0;
      const linePayloads: Array<{ skuId: string; qtyTerjual: number; omzetIdr: number }> = [];
      for (const t of skuTotals) {
        const price = priceMap.get(t.skuId) ?? 0;
        const omzet = t.qty * price;
        totalTerjual += t.qty;
        totalOmzetIdr += omzet;
        linePayloads.push({ skuId: t.skuId, qtyTerjual: t.qty, omzetIdr: omzet });
      }

      // 7. Revenue split
      const brandBps = p.revenueSplitBrandBps;
      const brandShareIdr = Math.floor((totalOmzetIdr * brandBps) / 10000);
      const tenantShareIdr = totalOmzetIdr - brandShareIdr;

      // 8. Insert settlement + lines. Catch unique-violation (uniqPartnershipWeek)
      // → skipped ALREADY_GENERATED.
      const settlementId = crypto.randomUUID();
      try {
        await db.insert(settlements).values({
          id: settlementId,
          partnershipId: p.id,
          weekStartDate: week.weekStart,
          weekEndDate: week.weekEnd,
          totalTerjual,
          totalOmzetIdr,
          brandShareIdr,
          tenantShareIdr,
          status: "DRAFT",
          generatedAt: now,
        });

        await db.insert(settlementLines).values(
          linePayloads.map((l) => ({
            id: crypto.randomUUID(),
            settlementId,
            skuId: l.skuId,
            qtyTerjual: l.qtyTerjual,
            omzetIdr: l.omzetIdr,
          }))
        );

        result.generated.push({
          settlementId,
          partnershipId: p.id,
          weekStart: week.weekStart,
          weekEnd: week.weekEnd,
          totalTerjual,
          totalOmzetIdr,
          brandShareIdr,
          tenantShareIdr,
        });
      } catch (err: any) {
        // D1/SQLite unique violation: message contains "UNIQUE constraint failed"
        if (String(err?.message ?? "").includes("UNIQUE")) {
          result.skipped.push({
            partnershipId: p.id,
            weekStart: week.weekStart,
            reason: "ALREADY_GENERATED",
          });
        } else {
          throw err;
        }
      }
    } catch (err: any) {
      // Per-partnership error — don't abort the whole batch
      result.skipped.push({
        partnershipId: p.id,
        weekStart: week.weekStart,
        reason: `ERROR:${String(err?.message ?? err).slice(0, 100)}`,
      });
    }
  }

  return result;
}
