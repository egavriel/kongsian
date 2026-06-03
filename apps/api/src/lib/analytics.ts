/**
 * Analytics queries — Week 4, F3.
 *
 * Source of truth: `daily_closing_lines` joined through `daily_closings`
 * (status IN ('SUBMITTED','LOCKED')) and `partnerships`. This is the
 * tenant-reported sell-through, not brand titip/tarik (which lives in
 * `stock_movements` — that would mix in stock that never reached a
 * customer).
 *
 * Effective price per (partnership, sku) is `partnershipSkus.priceOverrideIdr
 * ?? skus.priceIdr`. We coalesce at query time.
 *
 * Date filter: `daily_closings.closing_date` (text YYYY-MM-DD, TZ-agnostic).
 * All "now" bounds are computed in Asia/Jakarta via `toLocaleDateString`.
 *
 * Returns plain numbers (integer IDR) — the frontend formats with
 * Intl.NumberFormat("id-ID"). No decimals (IDR is integer-only in this app).
 */
import { and, eq, gte, inArray, lte, sql, sum, count, countDistinct } from "drizzle-orm";
import {
  getDb,
  dailyClosings,
  dailyClosingLines,
  partnerships,
  partnershipSkus,
  skus,
  tenants,
} from "@kongsian/db";

// D1Database is a global type from @cloudflare/workers-types. We declare
// a local alias so we don't have to add that dep here.
type D1Database = any; // eslint-disable-line @typescript-eslint/no-explicit-any

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type Range = "7d" | "30d";

export interface AnalyticsRange {
  start: string; // YYYY-MM-DD inclusive, in Asia/Jakarta
  end: string; // YYYY-MM-DD inclusive, in Asia/Jakarta
}

export interface TopProduct {
  skuId: string;
  skuCode: string;
  skuName: string;
  qtySold: number;
  revenueIdr: number;
}

export interface TenantBreakdown {
  tenantId: string;
  tenantName: string;
  qtySold: number;
  revenueIdr: number;
  closingCount: number;
  settleCount: number; // # settlements whose weekStart falls in range (paid out)
}

export interface DailyPoint {
  date: string; // YYYY-MM-DD
  revenueIdr: number;
  units: number;
}

export interface AnalyticsSummary {
  totalRevenueIdr: number;
  totalUnits: number;
  closingCount: number;
  disputeCount: number;
  avgDailyRevenueIdr: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get today in Asia/Jakarta as YYYY-MM-DD. */
export function todayInJakarta(now: Date = new Date()): string {
  // "en-CA" formats as YYYY-MM-DD reliably across runtimes.
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

/** Range end (inclusive) for "7d" or "30d" given today. */
export function computeRange(range: Range, now: Date = new Date()): AnalyticsRange {
  const end = todayInJakarta(now);
  const days = range === "7d" ? 6 : 29; // 7d window = today + 6 prior
  const endDate = new Date(end + "T00:00:00Z");
  endDate.setUTCDate(endDate.getUTCDate() - days);
  const start = endDate.toISOString().slice(0, 10);
  return { start, end };
}

/** Enumerate every YYYY-MM-DD from start to end inclusive, in WIB. */
export function enumerateDays(start: string, end: string): string[] {
  const out: string[] = [];
  const cur = new Date(start + "T00:00:00Z");
  const last = new Date(end + "T00:00:00Z");
  while (cur.getTime() <= last.getTime()) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

/**
 * Resolve the set of partnershipIds this caller is allowed to see.
 *
 * - `null` = no filter (ops_admin / brand_member with no tenantId — scope
 *   to all the brand's partnerships)
 * - `tenantId` = brand_member that brand, restricted to that tenant only
 *   (the route layer should have validated the tenantId is reachable
 *   from the caller's brand; this helper just narrows the scope).
 */
export interface AnalyticsScope {
  brandId: string;
  partnershipIds: string[]; // empty = no data for this brand in range
}

export async function resolvePartnershipsForBrand(
  d1: D1Database,
  brandId: string,
  partnershipIdFilter: string | null
): Promise<string[]> {
  const db = getDb(d1);
  if (partnershipIdFilter) {
    // Caller already validated this partnership belongs to brandId in
    // the route. Just verify status = ACTIVE.
    const [p] = await db
      .select({ id: partnerships.id })
      .from(partnerships)
      .where(
        and(
          eq(partnerships.id, partnershipIdFilter),
          eq(partnerships.brandId, brandId),
          eq(partnerships.status, "ACTIVE")
        )
      )
      .limit(1);
    return p ? [p.id] : [];
  }
  const rows = await db
    .select({ id: partnerships.id })
    .from(partnerships)
    .where(and(eq(partnerships.brandId, brandId), eq(partnerships.status, "ACTIVE")));
  return rows.map((r) => r.id);
}

// ---------------------------------------------------------------------------
// Query: Top products (top 5 by revenue within range, scoped to brand)
// ---------------------------------------------------------------------------
export async function topProducts(
  d1: D1Database,
  partnershipIds: string[],
  range: AnalyticsRange,
  limit = 5
): Promise<TopProduct[]> {
  if (partnershipIds.length === 0) return [];
  const db = getDb(d1);
  // effective_price = COALESCE(partnershipSkus.priceOverrideIdr, skus.priceIdr)
  const rows = await db
    .select({
      skuId: dailyClosingLines.skuId,
      skuCode: skus.code,
      skuName: skus.name,
      qtySold: sum(dailyClosingLines.terjual),
      revenueIdr: sql<number>`SUM(${dailyClosingLines.terjual} * COALESCE(${partnershipSkus.priceOverrideIdr}, ${skus.priceIdr}))`,
    })
    .from(dailyClosingLines)
    .innerJoin(dailyClosings, eq(dailyClosings.id, dailyClosingLines.dailyClosingId))
    .innerJoin(skus, eq(skus.id, dailyClosingLines.skuId))
    .leftJoin(
      partnershipSkus,
      and(
        eq(partnershipSkus.partnershipId, dailyClosings.partnershipId),
        eq(partnershipSkus.skuId, dailyClosingLines.skuId),
        eq(partnershipSkus.active, true)
      )
    )
    .where(
      and(
        inArray(dailyClosings.partnershipId, partnershipIds),
        inArray(dailyClosings.status, ["SUBMITTED", "LOCKED"]),
        gte(dailyClosings.closingDate, range.start),
        lte(dailyClosings.closingDate, range.end)
      )
    )
    .groupBy(dailyClosingLines.skuId, skus.code, skus.name)
    .orderBy(sql`SUM(${dailyClosingLines.terjual} * COALESCE(${partnershipSkus.priceOverrideIdr}, ${skus.priceIdr})) DESC`)
    .limit(limit);
  return rows.map((r) => ({
    skuId: r.skuId,
    skuCode: r.skuCode,
    skuName: r.skuName,
    qtySold: Number(r.qtySold ?? 0),
    revenueIdr: Number(r.revenueIdr ?? 0),
  }));
}

// ---------------------------------------------------------------------------
// Query: Per-tenant breakdown
// ---------------------------------------------------------------------------
export async function tenantBreakdown(
  d1: D1Database,
  partnershipIds: string[],
  range: AnalyticsRange
): Promise<TenantBreakdown[]> {
  if (partnershipIds.length === 0) return [];
  const db = getDb(d1);
  // One row per (tenantId, partnershipId) with aggregate sales. We then
  // join back to count closings per partnership and settlements per
  // partnership whose week_start_date falls in the range.
  const salesRows = await db
    .select({
      tenantId: partnerships.tenantId,
      partnershipId: partnerships.id,
      tenantName: tenants.name,
      qtySold: sum(dailyClosingLines.terjual),
      revenueIdr: sql<number>`SUM(${dailyClosingLines.terjual} * COALESCE(${partnershipSkus.priceOverrideIdr}, ${skus.priceIdr}))`,
    })
    .from(dailyClosingLines)
    .innerJoin(dailyClosings, eq(dailyClosings.id, dailyClosingLines.dailyClosingId))
    .innerJoin(partnerships, eq(partnerships.id, dailyClosings.partnershipId))
    .innerJoin(tenants, eq(tenants.id, partnerships.tenantId))
    .leftJoin(
      partnershipSkus,
      and(
        eq(partnershipSkus.partnershipId, dailyClosings.partnershipId),
        eq(partnershipSkus.skuId, dailyClosingLines.skuId),
        eq(partnershipSkus.active, true)
      )
    )
    .innerJoin(skus, eq(skus.id, dailyClosingLines.skuId))
    .where(
      and(
        inArray(dailyClosings.partnershipId, partnershipIds),
        inArray(dailyClosings.status, ["SUBMITTED", "LOCKED"]),
        gte(dailyClosings.closingDate, range.start),
        lte(dailyClosings.closingDate, range.end)
      )
    )
    .groupBy(partnerships.tenantId, partnerships.id, tenants.name);

  // Closing count per partnership
  const closingRows = await db
    .select({
      partnershipId: dailyClosings.partnershipId,
      cnt: count(dailyClosings.id),
    })
    .from(dailyClosings)
    .where(
      and(
        inArray(dailyClosings.partnershipId, partnershipIds),
        inArray(dailyClosings.status, ["SUBMITTED", "LOCKED"]),
        gte(dailyClosings.closingDate, range.start),
        lte(dailyClosings.closingDate, range.end)
      )
    )
    .groupBy(dailyClosings.partnershipId);
  const closingByPartnership = new Map(closingRows.map((r) => [r.partnershipId, Number(r.cnt)]));

  // Settlement count per partnership (settlements with week_start in range)
  // We import lazily to avoid a circular import with lib/settlement.ts.
  const { settlements } = await import("@kongsian/db");
  const settleRows = await db
    .select({
      partnershipId: settlements.partnershipId,
      cnt: count(settlements.id),
    })
    .from(settlements)
    .where(
      and(
        inArray(settlements.partnershipId, partnershipIds),
        gte(settlements.weekStartDate, range.start),
        lte(settlements.weekStartDate, range.end)
      )
    )
    .groupBy(settlements.partnershipId);
  const settleByPartnership = new Map(settleRows.map((r) => [r.partnershipId, Number(r.cnt)]));

  // Aggregate per tenant (a brand may have multiple partnerships with the
  // same tenant — unlikely but possible; we sum them).
  const byTenant = new Map<
    string,
    { tenantName: string; qtySold: number; revenueIdr: number; closingCount: number; settleCount: number }
  >();
  for (const r of salesRows) {
    const cur =
      byTenant.get(r.tenantId) ?? {
        tenantName: r.tenantName,
        qtySold: 0,
        revenueIdr: 0,
        closingCount: 0,
        settleCount: 0,
      };
    cur.qtySold += Number(r.qtySold ?? 0);
    cur.revenueIdr += Number(r.revenueIdr ?? 0);
    byTenant.set(r.tenantId, cur);
  }
  for (const r of closingRows) {
    // Map back to tenant — we need partnership.tenantId
    const sr = salesRows.find((s) => s.partnershipId === r.partnershipId);
    if (!sr) continue;
    const cur = byTenant.get(sr.tenantId);
    if (cur) cur.closingCount += Number(r.cnt);
  }
  for (const r of settleRows) {
    const sr = salesRows.find((s) => s.partnershipId === r.partnershipId);
    if (!sr) continue;
    const cur = byTenant.get(sr.tenantId);
    if (cur) cur.settleCount += Number(r.cnt);
  }

  return [...byTenant.entries()].map(([tenantId, v]) => ({
    tenantId,
    tenantName: v.tenantName,
    qtySold: v.qtySold,
    revenueIdr: v.revenueIdr,
    closingCount: v.closingCount,
    settleCount: v.settleCount,
  }));
}

// ---------------------------------------------------------------------------
// Query: Daily series (revenue + units per day). 0-fills missing days in TS.
// ---------------------------------------------------------------------------
export async function dailySeries(
  d1: D1Database,
  partnershipIds: string[],
  range: AnalyticsRange
): Promise<DailyPoint[]> {
  if (partnershipIds.length === 0) {
    return enumerateDays(range.start, range.end).map((d) => ({
      date: d,
      revenueIdr: 0,
      units: 0,
    }));
  }
  const db = getDb(d1);
  const rows = await db
    .select({
      date: dailyClosings.closingDate,
      units: sum(dailyClosingLines.terjual),
      revenueIdr: sql<number>`SUM(${dailyClosingLines.terjual} * COALESCE(${partnershipSkus.priceOverrideIdr}, ${skus.priceIdr}))`,
    })
    .from(dailyClosingLines)
    .innerJoin(dailyClosings, eq(dailyClosings.id, dailyClosingLines.dailyClosingId))
    .leftJoin(
      partnershipSkus,
      and(
        eq(partnershipSkus.partnershipId, dailyClosings.partnershipId),
        eq(partnershipSkus.skuId, dailyClosingLines.skuId),
        eq(partnershipSkus.active, true)
      )
    )
    .innerJoin(skus, eq(skus.id, dailyClosingLines.skuId))
    .where(
      and(
        inArray(dailyClosings.partnershipId, partnershipIds),
        inArray(dailyClosings.status, ["SUBMITTED", "LOCKED"]),
        gte(dailyClosings.closingDate, range.start),
        lte(dailyClosings.closingDate, range.end)
      )
    )
    .groupBy(dailyClosings.closingDate);

  const byDate = new Map<string, { units: number; revenueIdr: number }>();
  for (const r of rows) {
    byDate.set(r.date, {
      units: Number(r.units ?? 0),
      revenueIdr: Number(r.revenueIdr ?? 0),
    });
  }
  return enumerateDays(range.start, range.end).map((d) => {
    const v = byDate.get(d);
    return {
      date: d,
      revenueIdr: v?.revenueIdr ?? 0,
      units: v?.units ?? 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Query: Summary metrics
// ---------------------------------------------------------------------------
export async function summaryMetrics(
  d1: D1Database,
  partnershipIds: string[],
  range: AnalyticsRange
): Promise<AnalyticsSummary> {
  if (partnershipIds.length === 0) {
    return {
      totalRevenueIdr: 0,
      totalUnits: 0,
      closingCount: 0,
      disputeCount: 0,
      avgDailyRevenueIdr: 0,
    };
  }
  const db = getDb(d1);
  const salesRow = await db
    .select({
      units: sum(dailyClosingLines.terjual),
      revenueIdr: sql<number>`SUM(${dailyClosingLines.terjual} * COALESCE(${partnershipSkus.priceOverrideIdr}, ${skus.priceIdr}))`,
    })
    .from(dailyClosingLines)
    .innerJoin(dailyClosings, eq(dailyClosings.id, dailyClosingLines.dailyClosingId))
    .leftJoin(
      partnershipSkus,
      and(
        eq(partnershipSkus.partnershipId, dailyClosings.partnershipId),
        eq(partnershipSkus.skuId, dailyClosingLines.skuId),
        eq(partnershipSkus.active, true)
      )
    )
    .innerJoin(skus, eq(skus.id, dailyClosingLines.skuId))
    .where(
      and(
        inArray(dailyClosings.partnershipId, partnershipIds),
        inArray(dailyClosings.status, ["SUBMITTED", "LOCKED"]),
        gte(dailyClosings.closingDate, range.start),
        lte(dailyClosings.closingDate, range.end)
      )
    );
  const totalUnits = Number(salesRow[0]?.units ?? 0);
  const totalRevenueIdr = Number(salesRow[0]?.revenueIdr ?? 0);

  const closingRow = await db
    .select({ cnt: countDistinct(dailyClosings.id) })
    .from(dailyClosings)
    .where(
      and(
        inArray(dailyClosings.partnershipId, partnershipIds),
        inArray(dailyClosings.status, ["SUBMITTED", "LOCKED"]),
        gte(dailyClosings.closingDate, range.start),
        lte(dailyClosings.closingDate, range.end)
      )
    );
  const closingCount = Number(closingRow[0]?.cnt ?? 0);

  const { disputes } = await import("@kongsian/db");
  // Disputes link to daily_closing_lines, which link to daily_closings.
  // We count disputes whose underlying line's closing is in range + scope.
  const disputeRow = await db
    .select({ cnt: count(disputes.id) })
    .from(disputes)
    .innerJoin(dailyClosingLines, eq(dailyClosingLines.id, disputes.dailyClosingLineId))
    .innerJoin(dailyClosings, eq(dailyClosings.id, dailyClosingLines.dailyClosingId))
    .where(
      and(
        inArray(dailyClosings.partnershipId, partnershipIds),
        inArray(dailyClosings.status, ["SUBMITTED", "LOCKED"]),
        gte(dailyClosings.closingDate, range.start),
        lte(dailyClosings.closingDate, range.end)
      )
    );
  const disputeCount = Number(disputeRow[0]?.cnt ?? 0);

  const days = enumerateDays(range.start, range.end).length || 1;
  const avgDailyRevenueIdr = Math.round(totalRevenueIdr / days);

  return {
    totalRevenueIdr,
    totalUnits,
    closingCount,
    disputeCount,
    avgDailyRevenueIdr,
  };
}
