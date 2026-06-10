/**
 * Stock movement endpoints.
 *
 *   GET  /v1/movements                  list (with filters)
 *   GET  /v1/movements/sisa-sistem      computed SUM(qty) per SKU per partnership
 *   POST /v1/movements                  submit a single movement
 *   POST /v1/movements/batch            submit a batch (Titip form, multi-SKU same date)
 *
 * The atomic stock formula (Opus 4.7 review):
 *   Sisa Sistem(partner, sku, up_to_date) =
 *     SUM(qty WHERE kind IN ('TITIP'))           // positive
 *   - SUM(qty WHERE kind IN ('TARIK'))           // signed positive when TITIP, negative when TARIK
 *   - SUM(qty WHERE kind IN ('TERJUAL_OPENING', 'TERJUAL_CORRECTION'))
 *   + SUM(qty WHERE kind = 'ADJUSTMENT')         // signed
 *
 * We rely on the fact that we store signed qty per kind (TITIP: +qty, TARIK: -qty,
 * TERJUAL_*: -qty, ADJUSTMENT: +/- per reason). So in practice:
 *   Sisa = SUM(qty) over (partnership, sku, up_to_date)
 *
 * This is the unified formula the auto-recalc uses.
 */
import { Hono } from "hono";
import { and, desc, eq, gte, lte, sum, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  getDb,
  stockMovements,
  partnerships,
  brands,
  tenants,
  skus,
  partnershipSkus,
  auditLog,
  tenantMemberships,
} from "@kongsian/db";
import { authMiddleware, type AuthContext } from "../lib/auth";
import type { Bindings } from "../index";

const router = new Hono<{ Bindings: Bindings; Variables: { auth: AuthContext } }>();
router.use("*", authMiddleware);

const MovementSchema = z.object({
  partnershipId: z.string().min(1),
  skuId: z.string().min(1),
  movementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(["TITIP", "TARIK", "TERJUAL_OPENING", "TERJUAL_CORRECTION", "ADJUSTMENT"]),
  qty: z.number().int(),
  reason: z.string().max(280).optional(),
  fotoR2Key: z.string().max(256).optional(),
  idempotencyKey: z.string().min(8).max(64),
});

const BatchSchema = z.object({
  partnershipId: z.string().min(1),
  movementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  items: z
    .array(
      z.object({
        skuId: z.string().min(1),
        kind: z.enum(["TITIP", "TARIK", "TERJUAL_OPENING", "TERJUAL_CORRECTION", "ADJUSTMENT"]),
        qty: z.number().int(),
        reason: z.string().max(280).optional(),
        fotoR2Key: z.string().max(256).optional(),
      })
    )
    .min(1),
  batchIdempotencyKey: z.string().min(8).max(64),
});

/** Convert a raw qty + kind into the signed qty stored in the ledger. */
export function signQty(kind: string, rawQty: number): number {
  if (kind === "TITIP") return Math.abs(rawQty); // brand side
  if (kind === "TARIK") return -Math.abs(rawQty);
  if (kind === "TERJUAL_OPENING" || kind === "TERJUAL_CORRECTION") return -Math.abs(rawQty);
  if (kind === "ADJUSTMENT") return rawQty; // caller decides sign
  return rawQty;
}

async function assertPartnershipAccess(
  env: Bindings,
  userId: string,
  partnershipId: string
): Promise<
  | { ok: true; role: "BRAND" | "TENANT"; partnership: typeof partnerships.$inferSelect }
  | { ok: false; code: number; error: string }
> {
  const db = getDb(env.kongsian_db);
  const [p] = await db.select().from(partnerships).where(eq(partnerships.id, partnershipId)).limit(1);
  if (!p) return { ok: false, code: 404, error: "PARTNERSHIP_NOT_FOUND" };

  // Brand owner?
  const [brand] = await db.select().from(brands).where(eq(brands.id, p.brandId)).limit(1);
  if (brand && brand.userId === userId) return { ok: true, role: "BRAND", partnership: p };

  // Tenant member?
  const [mem] = await db
    .select()
    .from(tenantMemberships)
    .where(
      and(
        eq(tenantMemberships.userId, userId),
        eq(tenantMemberships.tenantId, p.tenantId)
      )
    )
    .limit(1);
  if (mem) return { ok: true, role: "TENANT", partnership: p };

  return { ok: false, code: 403, error: "FORBIDDEN" };
}

/** GET /v1/movements — list with filters. */
router.get("/", async (c) => {
  const partnershipId = c.req.query("partnershipId");
  if (!partnershipId) return c.json({ ok: false, error: { code: "MISSING_PARTNERSHIP_ID" } }, 400);
  const { userId } = c.get("auth");
  const access = await assertPartnershipAccess(c.env, userId, partnershipId);
  if (!access.ok) return c.json({ ok: false, error: { code: access.error } }, access.code as 403 | 404);

  const from = c.req.query("from");
  const to = c.req.query("to");
  const db = getDb(c.env.kongsian_db);
  const conditions = [eq(stockMovements.partnershipId, partnershipId)];
  if (from) conditions.push(gte(stockMovements.movementDate, from));
  if (to) conditions.push(lte(stockMovements.movementDate, to));
  const rows = await db
    .select()
    .from(stockMovements)
    .where(and(...conditions))
    .orderBy(desc(stockMovements.movementDate), desc(stockMovements.submittedAt))
    .limit(500);
  return c.json({ ok: true, data: rows });
});

/** GET /v1/movements/sisa-sistem?partnershipId=...&upTo=YYYY-MM-DD */
router.get("/sisa-sistem", async (c) => {
  const partnershipId = c.req.query("partnershipId");
  const upTo = c.req.query("upTo") ?? new Date().toISOString().slice(0, 10);
  if (!partnershipId) return c.json({ ok: false, error: { code: "MISSING_PARTNERSHIP_ID" } }, 400);
  const { userId } = c.get("auth");
  const access = await assertPartnershipAccess(c.env, userId, partnershipId);
  if (!access.ok) return c.json({ ok: false, error: { code: access.error } }, access.code as 403 | 404);

  const db = getDb(c.env.kongsian_db);
  // SELECT sku_id, SUM(qty) FROM stock_movements WHERE partnershipId=? AND movementDate <= upTo GROUP BY sku_id
  const rows = await db
    .select({
      skuId: stockMovements.skuId,
      total: sum(stockMovements.qty),
    })
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.partnershipId, partnershipId),
        lte(stockMovements.movementDate, upTo)
      )
    )
    .groupBy(stockMovements.skuId);

  // Also pull SKU display info.
  const skuList = await db
    .select()
    .from(skus)
    .innerJoin(partnershipSkus, eq(partnershipSkus.skuId, skus.id))
    .where(eq(partnershipSkus.partnershipId, partnershipId));

  const result = skuList.map((s) => {
    const tot = rows.find((r) => r.skuId === s.skus.id);
    return {
      skuId: s.skus.id,
      code: s.skus.code,
      name: s.skus.name,
      priceIdr: s.skus.priceIdr,
      masaSimpanHari: s.skus.masaSimpanHari,
      sisa: Number(tot?.total ?? 0),
    };
  });

  return c.json({ ok: true, data: { upTo, partnershipId, bySku: result } });
});

/** POST /v1/movements — submit a single movement. Idempotent by idempotencyKey. */
router.post("/", async (c) => {
  const { userId } = c.get("auth");
  const body = await c.req.json().catch(() => ({}));
  const parsed = MovementSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: { code: "INVALID_INPUT", issues: parsed.error.flatten() } }, 400);
  }
  const v = parsed.data;
  const access = await assertPartnershipAccess(c.env, userId, v.partnershipId);
  if (!access.ok) return c.json({ ok: false, error: { code: access.error } }, access.code as 403 | 404);

  // Tenants can only post TERJUAL_*; brand posts TITIP/TARIK/ADJUSTMENT.
  if (access.role === "TENANT" && !v.kind.startsWith("TERJUAL") && v.kind !== "ADJUSTMENT") {
    return c.json(
      { ok: false, error: { code: "TENANT_FORBIDDEN", message: "Tenant may only submit TERJUAL_* or ADJUSTMENT." } },
      403
    );
  }

  const db = getDb(c.env.kongsian_db);
  // Idempotency check.
  const [dup] = await db
    .select()
    .from(stockMovements)
    .where(eq(stockMovements.idempotencyKey, v.idempotencyKey))
    .limit(1);
  if (dup) return c.json({ ok: true, data: { movement: dup, idempotent: true } });

  const signedQty = signQty(v.kind, v.qty);
  const now = Math.floor(Date.now() / 1000);
  const id = crypto.randomUUID();
  await db.insert(stockMovements).values({
    id,
    partnershipId: v.partnershipId,
    skuId: v.skuId,
    movementDate: v.movementDate,
    kind: v.kind,
    qty: signedQty,
    reason: v.reason ?? null,
    fotoR2Key: v.fotoR2Key ?? null,
    submittedByUserId: userId,
    correctsMovementId: null,
    submittedAt: now,
    idempotencyKey: v.idempotencyKey,
  });

  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    userId,
    action: "MOVEMENT_SUBMITTED",
    entityType: "stock_movement",
    entityId: id,
    beforeJson: null,
    afterJson: JSON.stringify({ ...v, qty: signedQty }),
    ip: c.req.header("cf-connecting-ip") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    createdAt: now,
  });

  const [mv] = await db.select().from(stockMovements).where(eq(stockMovements.id, id)).limit(1);
  return c.json({ ok: true, data: { movement: mv } });
});

/** POST /v1/movements/batch — Titip form submits N rows with one idempotency key prefix. */
router.post("/batch", async (c) => {
  const { userId } = c.get("auth");
  const body = await c.req.json().catch(() => ({}));
  const parsed = BatchSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: { code: "INVALID_INPUT", issues: parsed.error.flatten() } }, 400);
  }
  const v = parsed.data;
  const access = await assertPartnershipAccess(c.env, userId, v.partnershipId);
  if (!access.ok) return c.json({ ok: false, error: { code: access.error } }, access.code as 403 | 404);

  const db = getDb(c.env.kongsian_db);
  const now = Math.floor(Date.now() / 1000);
  const inserted: string[] = [];
  for (const item of v.items) {
    if (item.qty === 0) continue;
    const signedQty = signQty(item.kind, item.qty);
    const idem = `${v.batchIdempotencyKey}-${item.skuId}`;
    const [dup] = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.idempotencyKey, idem))
      .limit(1);
    if (dup) {
      inserted.push(dup.id);
      continue;
    }
    const id = crypto.randomUUID();
    await db.insert(stockMovements).values({
      id,
      partnershipId: v.partnershipId,
      skuId: item.skuId,
      movementDate: v.movementDate,
      kind: item.kind,
      qty: signedQty,
      reason: item.reason ?? null,
      fotoR2Key: item.fotoR2Key ?? null,
      submittedByUserId: userId,
      correctsMovementId: null,
      submittedAt: now,
      idempotencyKey: idem,
    });
    inserted.push(id);
    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      userId,
      action: "MOVEMENT_SUBMITTED",
      entityType: "stock_movement",
      entityId: id,
      beforeJson: null,
      afterJson: JSON.stringify({
        partnershipId: v.partnershipId,
        skuId: item.skuId,
        kind: item.kind,
        qty: signedQty,
        movementDate: v.movementDate,
      }),
      ip: c.req.header("cf-connecting-ip") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
      createdAt: now,
    });
  }
  return c.json({ ok: true, data: { movementIds: inserted, count: inserted.length } });
});

/**
 * DELETE /v1/movements — remove ADJUSTMENT rows for a partnership.
 * Brand-only. Used by the Catat Hari Ini "Reset Stok Awal" button.
 *
 * Body:
 *   { partnershipId: string, movementDate: 'YYYY-MM-DD', reason: string }
 *
 * Deletes every row matching (partnershipId, movementDate, kind='ADJUSTMENT',
 * reason). Tenant access is denied — brand-side bookkeeping only.
 * Each deletion is recorded in audit_log with the row's prior state.
 */
const DeleteSchema = z.object({
  partnershipId: z.string().min(1),
  movementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().min(1).max(280),
});

router.delete("/", async (c) => {
  const { userId } = c.get("auth");
  const body = await c.req.json().catch(() => ({}));
  const parsed = DeleteSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: { code: "INVALID_INPUT", issues: parsed.error.flatten() } }, 400);
  }
  const v = parsed.data;
  const access = await assertPartnershipAccess(c.env, userId, v.partnershipId);
  if (!access.ok) return c.json({ ok: false, error: { code: access.error } }, access.code as 403 | 404);
  if (access.role !== "BRAND") {
    return c.json(
      { ok: false, error: { code: "TENANT_FORBIDDEN", message: "Hanya brand yang boleh menghapus Stok Awal." } },
      403
    );
  }

  const db = getDb(c.env.kongsian_db);
  const now = Math.floor(Date.now() / 1000);
  const targets = await db
    .select()
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.partnershipId, v.partnershipId),
        eq(stockMovements.movementDate, v.movementDate),
        eq(stockMovements.kind, "ADJUSTMENT"),
        eq(stockMovements.reason, v.reason)
      )
    );

  if (targets.length === 0) {
    return c.json({ ok: true, data: { deletedIds: [], count: 0 } });
  }

  const deletedIds = targets.map((t) => t.id);
  await db.delete(stockMovements).where(inArray(stockMovements.id, deletedIds));

  for (const t of targets) {
    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      userId,
      action: "MOVEMENT_DELETED",
      entityType: "stock_movement",
      entityId: t.id,
      beforeJson: JSON.stringify(t),
      afterJson: null,
      ip: c.req.header("cf-connecting-ip") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
      createdAt: now,
    });
  }

  return c.json({ ok: true, data: { deletedIds, count: deletedIds.length } });
});

export { router as movements };
