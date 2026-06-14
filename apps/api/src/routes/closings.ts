/**
 * Closings API — daily closing workflow. Week 3, Track A.
 *
 * Tenant-scoped (mount at /v1/tenants):
 *   GET  /me                                                    caller's tenant + partnerships + skus
 *   GET  /:tenantId/partnerships/:partnershipId/today           today's closing state + sisaSistem per SKU
 *   POST /:tenantId/partnerships/:partnershipId/closings        create/return draft closing (idempotent)
 *   GET  /:tenantId/partnerships/:partnershipId/closings/:date  closing detail + lines + photos
 *   POST /:tenantId/partnerships/:partnershipId/closings/:date/terjual    upsert terjual per SKU
 *   POST /:tenantId/partnerships/:partnershipId/closings/:date/sisa-fisik upsert sisaFisik + preview selisih
 *   POST /:tenantId/partnerships/:partnershipId/closings/:date/photos     add closing photo (dedupe)
 *   POST /:tenantId/partnerships/:partnershipId/closings/:date/submit     OPEN → SUBMITTED
 *
 * Brand-scoped (mount at /v1/brands):
 *   GET  /:brandId/closings             list closings for brand's partnerships
 *   GET  /:brandId/closings/:id         closing detail + lines + photos
 *   POST /:brandId/closings/:id/dispute brand raises dispute on a line
 */
import { Hono } from "hono";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  getDb,
  dailyClosings,
  dailyClosingLines,
  closingPhotos,
  partnerships,
  partnershipSkus,
  skus,
  stockMovements,
  brands,
  tenants,
  tenantMemberships,
  auditLog,
  disputes,
} from "@kongsian/db";
import { authMiddleware, type AuthContext } from "../lib/auth";
import { computeSisaSistem, computeSisaSistemBatch } from "../lib/stock";
import type { Bindings } from "../index";

type Vars = { auth: AuthContext };
type RouteEnv = { Bindings: Bindings; Variables: Vars };

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

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

  const [brand] = await db.select().from(brands).where(eq(brands.id, p.brandId)).limit(1);
  if (brand && brand.userId === userId) return { ok: true, role: "BRAND", partnership: p };

  const [mem] = await db
    .select()
    .from(tenantMemberships)
    .where(and(eq(tenantMemberships.userId, userId), eq(tenantMemberships.tenantId, p.tenantId)))
    .limit(1);
  if (mem) return { ok: true, role: "TENANT", partnership: p };

  return { ok: false, code: 403, error: "FORBIDDEN" };
}

/** Allow today + past 30 days; reject future dates. Widened from 7 days for the
 *  single-actor trial so Ervina can backfill a whole week at a time. */
function isValidClosingDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const today = new Date().toISOString().slice(0, 10);
  const pastWindow = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return date >= pastWindow && date <= today;
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const CreateClosingSchema = z.object({
  closingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const TerjualSchema = z.object({
  lines: z.array(z.object({ skuId: z.string().min(1), terjual: z.number().int().min(0) })).min(1),
});

const SisaFisikSchema = z.object({
  lines: z.array(z.object({ skuId: z.string().min(1), sisaFisik: z.number().int().min(0) })).min(1),
});

const PhotoSchema = z.object({
  r2Key: z.string().min(1).max(256),
});

const BrandDisputeSchema = z.object({
  closingLineId: z.string().min(1),
  reason: z.string().min(1).max(280),
  photoR2Key: z.string().max(256).optional(),
});

// ---------------------------------------------------------------------------
// Tenant-scoped router
// ---------------------------------------------------------------------------

const tenantClosings = new Hono<RouteEnv>();
tenantClosings.use("*", authMiddleware);

/** GET /me — caller's tenant(s) + active partnerships + skus. */
tenantClosings.get("/me", async (c) => {
  const { userId } = c.get("auth");
  const db = getDb(c.env.kongsian_db);

  const memberRows = await db
    .select({ tenantId: tenantMemberships.tenantId })
    .from(tenantMemberships)
    .where(eq(tenantMemberships.userId, userId));

  if (memberRows.length === 0) return c.json({ ok: true, data: { memberships: [] } });

  const tenantIds = memberRows.map((r) => r.tenantId);

  const [tenantRows, partnershipRows] = await Promise.all([
    db.select().from(tenants).where(inArray(tenants.id, tenantIds)),
    db
      .select({ partnership: partnerships, brand: brands })
      .from(partnerships)
      .innerJoin(brands, eq(brands.id, partnerships.brandId))
      .where(and(inArray(partnerships.tenantId, tenantIds), eq(partnerships.status, "ACTIVE"))),
  ]);

  const partnershipIds = partnershipRows.map((r) => r.partnership.id);
  const skuRows =
    partnershipIds.length > 0
      ? await db
          .select({ ps: partnershipSkus, sku: skus })
          .from(partnershipSkus)
          .innerJoin(skus, eq(skus.id, partnershipSkus.skuId))
          .where(inArray(partnershipSkus.partnershipId, partnershipIds))
      : [];

  const memberships = tenantRows.map((tenant) => {
    const ps = partnershipRows
      .filter((r) => r.partnership.tenantId === tenant.id)
      .map((r) => ({
        ...r.partnership,
        brand: r.brand,
        skus: skuRows
          .filter((s) => s.ps.partnershipId === r.partnership.id)
          .map((s) => ({ ...s.sku, partnershipSkuId: s.ps.id })),
      }));
    return { tenant, partnerships: ps };
  });

  return c.json({ ok: true, data: { memberships } });
});

/** GET /:tenantId/partnerships/:partnershipId/today — today's closing state + sku sisaSistem. */
tenantClosings.get("/:tenantId/partnerships/:partnershipId/today", async (c) => {
  const { userId } = c.get("auth");
  const { partnershipId } = c.req.param();

  const access = await assertPartnershipAccess(c.env, userId, partnershipId);
  if (!access.ok) return c.json({ ok: false, error: { code: access.error } }, access.code as 403 | 404);

  const today = new Date().toISOString().slice(0, 10);
  const db = getDb(c.env.kongsian_db);

  const [[closing], skuRows, sisaSistemMap] = await Promise.all([
    db
      .select()
      .from(dailyClosings)
      .where(and(eq(dailyClosings.partnershipId, partnershipId), eq(dailyClosings.closingDate, today)))
      .limit(1),
    db
      .select({ ps: partnershipSkus, sku: skus })
      .from(partnershipSkus)
      .innerJoin(skus, eq(skus.id, partnershipSkus.skuId))
      .where(eq(partnershipSkus.partnershipId, partnershipId)),
    computeSisaSistemBatch(getDb(c.env.kongsian_db), partnershipId, today),
  ]);

  const skuList = skuRows.map((r) => ({
    ...r.sku,
    partnershipSkuId: r.ps.id,
    sisaSistem: sisaSistemMap.get(r.sku.id) ?? 0,
  }));

  return c.json({ ok: true, data: { closing: closing ?? null, date: today, skus: skuList } });
});

/** POST /:tenantId/partnerships/:partnershipId/closings — create draft, idempotent on (partnershipId, closingDate). */
tenantClosings.post("/:tenantId/partnerships/:partnershipId/closings", async (c) => {
  const { userId } = c.get("auth");
  const { partnershipId } = c.req.param();

  const access = await assertPartnershipAccess(c.env, userId, partnershipId);
  if (!access.ok) return c.json({ ok: false, error: { code: access.error } }, access.code as 403 | 404);
  if (access.role !== "TENANT" && access.role !== "BRAND") return c.json({ ok: false, error: { code: "FORBIDDEN" } }, 403);

  const body = await c.req.json().catch(() => ({}));
  const parsed = CreateClosingSchema.safeParse(body);
  if (!parsed.success)
    return c.json({ ok: false, error: { code: "INVALID_INPUT", issues: parsed.error.flatten() } }, 400);

  const { closingDate } = parsed.data;
  if (!isValidClosingDate(closingDate))
    return c.json(
      { ok: false, error: { code: "INVALID_DATE", message: "Date must be today or within the past 7 days." } },
      400
    );

  const db = getDb(c.env.kongsian_db);

  const [existing] = await db
    .select()
    .from(dailyClosings)
    .where(and(eq(dailyClosings.partnershipId, partnershipId), eq(dailyClosings.closingDate, closingDate)))
    .limit(1);

  if (existing) return c.json({ ok: true, data: { closing: existing, alreadyExists: true } });

  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  await db.insert(dailyClosings).values({ id, partnershipId, closingDate, status: "OPEN", createdAt: now });

  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    userId,
    action: "CLOSING_CREATED",
    entityType: "daily_closing",
    entityId: id,
    beforeJson: null,
    afterJson: JSON.stringify({ partnershipId, closingDate }),
    ip: c.req.header("cf-connecting-ip") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    createdAt: now,
  });

  const [closing] = await db.select().from(dailyClosings).where(eq(dailyClosings.id, id)).limit(1);
  return c.json({ ok: true, data: { closing } });
});

/** GET /:tenantId/partnerships/:partnershipId/closings/:date — closing detail with lines + photos. */
tenantClosings.get("/:tenantId/partnerships/:partnershipId/closings/:date", async (c) => {
  const { userId } = c.get("auth");
  const { partnershipId, date } = c.req.param();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return c.json({ ok: false, error: { code: "INVALID_DATE_FORMAT" } }, 400);

  const access = await assertPartnershipAccess(c.env, userId, partnershipId);
  if (!access.ok) return c.json({ ok: false, error: { code: access.error } }, access.code as 403 | 404);

  const db = getDb(c.env.kongsian_db);

  const [closing] = await db
    .select()
    .from(dailyClosings)
    .where(and(eq(dailyClosings.partnershipId, partnershipId), eq(dailyClosings.closingDate, date)))
    .limit(1);

  if (!closing) return c.json({ ok: false, error: { code: "CLOSING_NOT_FOUND" } }, 404);

  const [allSkuRows, lineRows, photos, sisaSistemMap] = await Promise.all([
    db
      .select({ ps: partnershipSkus, sku: skus })
      .from(partnershipSkus)
      .innerJoin(skus, eq(skus.id, partnershipSkus.skuId))
      .where(eq(partnershipSkus.partnershipId, partnershipId)),
    db.select().from(dailyClosingLines).where(eq(dailyClosingLines.dailyClosingId, closing.id)),
    db.select().from(closingPhotos).where(eq(closingPhotos.dailyClosingId, closing.id)),
    computeSisaSistemBatch(db, partnershipId, date),
  ]);

  const lineMap = new Map(lineRows.map((l) => [l.skuId, l]));

  const lines = allSkuRows.map((r) => ({
    skuId: r.sku.id,
    skuCode: r.sku.code,
    skuName: r.sku.name,
    line: lineMap.get(r.sku.id) ?? null,
    liveSisaSistem: sisaSistemMap.get(r.sku.id) ?? 0,
  }));

  return c.json({ ok: true, data: { closing, lines, photos } });
});

/** POST .../terjual — upsert terjual per SKU. Rejects if status ≠ OPEN. */
tenantClosings.post("/:tenantId/partnerships/:partnershipId/closings/:date/terjual", async (c) => {
  const { userId } = c.get("auth");
  const { partnershipId, date } = c.req.param();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return c.json({ ok: false, error: { code: "INVALID_DATE_FORMAT" } }, 400);

  const access = await assertPartnershipAccess(c.env, userId, partnershipId);
  if (!access.ok) return c.json({ ok: false, error: { code: access.error } }, access.code as 403 | 404);
  if (access.role !== "TENANT" && access.role !== "BRAND") return c.json({ ok: false, error: { code: "FORBIDDEN" } }, 403);

  const body = await c.req.json().catch(() => ({}));
  const parsed = TerjualSchema.safeParse(body);
  if (!parsed.success)
    return c.json({ ok: false, error: { code: "INVALID_INPUT", issues: parsed.error.flatten() } }, 400);

  const db = getDb(c.env.kongsian_db);

  const [closing] = await db
    .select()
    .from(dailyClosings)
    .where(and(eq(dailyClosings.partnershipId, partnershipId), eq(dailyClosings.closingDate, date)))
    .limit(1);

  if (!closing) return c.json({ ok: false, error: { code: "CLOSING_NOT_FOUND" } }, 404);
  if (closing.status !== "OPEN") return c.json({ ok: false, error: { code: "CLOSING_LOCKED" } }, 409);

  const now = Math.floor(Date.now() / 1000);

  // Upsert movement helper for daily closing terjual lines
  const upsertMovement = async (
    skuId: string,
    qty: number
  ) => {
    const idem = `terjual-${partnershipId}-${date}-${skuId}`;

    if (qty === 0) {
      await db.delete(stockMovements).where(eq(stockMovements.idempotencyKey, idem));
      return;
    }

    const signedQty = -Math.abs(qty); // TERJUAL_OPENING is always negative
    const [existing] = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.idempotencyKey, idem))
      .limit(1);

    if (existing) {
      if (existing.qty !== signedQty) {
        await db
          .update(stockMovements)
          .set({ qty: signedQty, submittedAt: now })
          .where(eq(stockMovements.id, existing.id));

        await db.insert(auditLog).values({
          id: crypto.randomUUID(),
          userId,
          action: "MOVEMENT_UPDATED",
          entityType: "stock_movement",
          entityId: existing.id,
          beforeJson: JSON.stringify(existing),
          afterJson: JSON.stringify({ ...existing, qty: signedQty, submittedAt: now }),
          ip: c.req.header("cf-connecting-ip") ?? null,
          userAgent: c.req.header("user-agent") ?? null,
          createdAt: now,
        });
      }
    } else {
      const id = crypto.randomUUID();
      await db.insert(stockMovements).values({
        id,
        partnershipId,
        skuId,
        movementDate: date,
        kind: "TERJUAL_OPENING",
        qty: signedQty,
        reason: `Closing terjual ${qty} cup`,
        submittedByUserId: userId,
        submittedAt: now,
        idempotencyKey: idem,
      });

      await db.insert(auditLog).values({
        id: crypto.randomUUID(),
        userId,
        action: "MOVEMENT_SUBMITTED",
        entityType: "stock_movement",
        entityId: id,
        beforeJson: null,
        afterJson: JSON.stringify({
          partnershipId,
          skuId,
          kind: "TERJUAL_OPENING",
          qty: signedQty,
          movementDate: date,
        }),
        ip: c.req.header("cf-connecting-ip") ?? null,
        userAgent: c.req.header("user-agent") ?? null,
        createdAt: now,
      });
    }
  };

  for (const line of parsed.data.lines) {
    const [existing] = await db
      .select()
      .from(dailyClosingLines)
      .where(
        and(eq(dailyClosingLines.dailyClosingId, closing.id), eq(dailyClosingLines.skuId, line.skuId))
      )
      .limit(1);

    if (existing) {
      await db
        .update(dailyClosingLines)
        .set({ terjual: line.terjual })
        .where(eq(dailyClosingLines.id, existing.id));
    } else {
      await db.insert(dailyClosingLines).values({
        id: crypto.randomUUID(),
        dailyClosingId: closing.id,
        skuId: line.skuId,
        terjual: line.terjual,
        sisaFisik: 0,
        sisaSistem: 0,
        selisih: 0,
      });
    }

    await upsertMovement(line.skuId, line.terjual);
  }

  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    userId,
    action: "CLOSING_TERJUAL_UPSERT",
    entityType: "daily_closing",
    entityId: closing.id,
    beforeJson: null,
    afterJson: JSON.stringify({ lines: parsed.data.lines }),
    ip: c.req.header("cf-connecting-ip") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    createdAt: now,
  });

  const updatedLines = await db
    .select()
    .from(dailyClosingLines)
    .where(eq(dailyClosingLines.dailyClosingId, closing.id));

  return c.json({ ok: true, data: { lines: updatedLines } });
});

/** POST .../sisa-fisik — upsert sisaFisik + compute preview sisaSistem/selisih per SKU. */
tenantClosings.post("/:tenantId/partnerships/:partnershipId/closings/:date/sisa-fisik", async (c) => {
  const { userId } = c.get("auth");
  const { partnershipId, date } = c.req.param();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return c.json({ ok: false, error: { code: "INVALID_DATE_FORMAT" } }, 400);

  const access = await assertPartnershipAccess(c.env, userId, partnershipId);
  if (!access.ok) return c.json({ ok: false, error: { code: access.error } }, access.code as 403 | 404);
  if (access.role !== "TENANT" && access.role !== "BRAND") return c.json({ ok: false, error: { code: "FORBIDDEN" } }, 403);

  const body = await c.req.json().catch(() => ({}));
  const parsed = SisaFisikSchema.safeParse(body);
  if (!parsed.success)
    return c.json({ ok: false, error: { code: "INVALID_INPUT", issues: parsed.error.flatten() } }, 400);

  const db = getDb(c.env.kongsian_db);

  const [closing] = await db
    .select()
    .from(dailyClosings)
    .where(and(eq(dailyClosings.partnershipId, partnershipId), eq(dailyClosings.closingDate, date)))
    .limit(1);

  if (!closing) return c.json({ ok: false, error: { code: "CLOSING_NOT_FOUND" } }, 404);
  if (closing.status !== "OPEN") return c.json({ ok: false, error: { code: "CLOSING_LOCKED" } }, 409);

  const now = Math.floor(Date.now() / 1000);

  for (const line of parsed.data.lines) {
    const sisaSistem = await computeSisaSistem(db, partnershipId, line.skuId, date);
    const selisih = sisaSistem - line.sisaFisik;

    const [existing] = await db
      .select()
      .from(dailyClosingLines)
      .where(
        and(eq(dailyClosingLines.dailyClosingId, closing.id), eq(dailyClosingLines.skuId, line.skuId))
      )
      .limit(1);

    if (existing) {
      await db
        .update(dailyClosingLines)
        .set({ sisaFisik: line.sisaFisik, sisaSistem, selisih })
        .where(eq(dailyClosingLines.id, existing.id));
    } else {
      await db.insert(dailyClosingLines).values({
        id: crypto.randomUUID(),
        dailyClosingId: closing.id,
        skuId: line.skuId,
        terjual: 0,
        sisaFisik: line.sisaFisik,
        sisaSistem,
        selisih,
      });
    }
  }

  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    userId,
    action: "CLOSING_SISA_FISIK_UPSERT",
    entityType: "daily_closing",
    entityId: closing.id,
    beforeJson: null,
    afterJson: JSON.stringify({ lines: parsed.data.lines }),
    ip: c.req.header("cf-connecting-ip") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    createdAt: now,
  });

  const updatedLines = await db
    .select()
    .from(dailyClosingLines)
    .where(eq(dailyClosingLines.dailyClosingId, closing.id));

  return c.json({ ok: true, data: { lines: updatedLines } });
});

/** POST .../photos — add closing photo, dedupe on (closingId, r2Key). */
tenantClosings.post("/:tenantId/partnerships/:partnershipId/closings/:date/photos", async (c) => {
  const { userId } = c.get("auth");
  const { partnershipId, date } = c.req.param();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return c.json({ ok: false, error: { code: "INVALID_DATE_FORMAT" } }, 400);

  const access = await assertPartnershipAccess(c.env, userId, partnershipId);
  if (!access.ok) return c.json({ ok: false, error: { code: access.error } }, access.code as 403 | 404);
  if (access.role !== "TENANT" && access.role !== "BRAND") return c.json({ ok: false, error: { code: "FORBIDDEN" } }, 403);

  const body = await c.req.json().catch(() => ({}));
  const parsed = PhotoSchema.safeParse(body);
  if (!parsed.success)
    return c.json({ ok: false, error: { code: "INVALID_INPUT", issues: parsed.error.flatten() } }, 400);

  const db = getDb(c.env.kongsian_db);

  const [closing] = await db
    .select()
    .from(dailyClosings)
    .where(and(eq(dailyClosings.partnershipId, partnershipId), eq(dailyClosings.closingDate, date)))
    .limit(1);

  if (!closing) return c.json({ ok: false, error: { code: "CLOSING_NOT_FOUND" } }, 404);
  if (closing.status !== "OPEN") return c.json({ ok: false, error: { code: "CLOSING_LOCKED" } }, 409);

  const { r2Key } = parsed.data;

  const [dup] = await db
    .select()
    .from(closingPhotos)
    .where(and(eq(closingPhotos.dailyClosingId, closing.id), eq(closingPhotos.r2Key, r2Key)))
    .limit(1);

  if (dup) return c.json({ ok: true, data: { photo: dup, idempotent: true } });

  const photoId = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  await db.insert(closingPhotos).values({
    id: photoId,
    dailyClosingId: closing.id,
    r2Key,
    uploadedByUserId: userId,
    createdAt: now,
  });

  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    userId,
    action: "CLOSING_PHOTO_ADDED",
    entityType: "daily_closing",
    entityId: closing.id,
    beforeJson: null,
    afterJson: JSON.stringify({ r2Key }),
    ip: c.req.header("cf-connecting-ip") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    createdAt: now,
  });

  const [photo] = await db.select().from(closingPhotos).where(eq(closingPhotos.id, photoId)).limit(1);
  return c.json({ ok: true, data: { photo } });
});

/** POST .../submit — flip OPEN→SUBMITTED, freeze sisaSistem/selisih, require ≥1 photo. */
tenantClosings.post("/:tenantId/partnerships/:partnershipId/closings/:date/submit", async (c) => {
  const { userId } = c.get("auth");
  const { partnershipId, date } = c.req.param();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return c.json({ ok: false, error: { code: "INVALID_DATE_FORMAT" } }, 400);

  const access = await assertPartnershipAccess(c.env, userId, partnershipId);
  if (!access.ok) return c.json({ ok: false, error: { code: access.error } }, access.code as 403 | 404);
  if (access.role !== "TENANT" && access.role !== "BRAND") return c.json({ ok: false, error: { code: "FORBIDDEN" } }, 403);

  const db = getDb(c.env.kongsian_db);

  const [closing] = await db
    .select()
    .from(dailyClosings)
    .where(and(eq(dailyClosings.partnershipId, partnershipId), eq(dailyClosings.closingDate, date)))
    .limit(1);

  if (!closing) return c.json({ ok: false, error: { code: "CLOSING_NOT_FOUND" } }, 404);

  const [lines, photos] = await Promise.all([
    db.select().from(dailyClosingLines).where(eq(dailyClosingLines.dailyClosingId, closing.id)),
    db.select().from(closingPhotos).where(eq(closingPhotos.dailyClosingId, closing.id)),
  ]);

  if (lines.length === 0)
    return c.json({ ok: false, error: { code: "NO_LINES", message: "At least one line is required." } }, 422);

  // TODO(trial): re-enable PHOTO_REQUIRED after real cafe partners onboard
  if (false && photos.length === 0)
    return c.json({ ok: false, error: { code: "PHOTO_REQUIRED", message: "At least one photo is required." } }, 422);

  const now = Math.floor(Date.now() / 1000);

  // Atomic: only succeeds if status is currently OPEN.
  const result = await db
    .update(dailyClosings)
    .set({ status: "SUBMITTED", submittedAt: now, submittedByUserId: userId })
    .where(and(eq(dailyClosings.id, closing.id), eq(dailyClosings.status, "OPEN")))
    .returning();

  if (result.length === 0) return c.json({ ok: false, error: { code: "CLOSING_LOCKED" } }, 409);

  // Freeze sisaSistem + selisih at submit time for every line.
  for (const line of lines) {
    const sisaSistem = await computeSisaSistem(db, partnershipId, line.skuId, date);
    const selisih = sisaSistem - line.sisaFisik;
    await db
      .update(dailyClosingLines)
      .set({ sisaSistem, selisih })
      .where(eq(dailyClosingLines.id, line.id));
  }

  // TODO: call enqueueAutoDisputes(db, closing.id, partnershipId, lines) from lib/closings.ts
  // to auto-open disputes for any line with selisih ≠ 0.

  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    userId,
    action: "CLOSING_SUBMITTED",
    entityType: "daily_closing",
    entityId: closing.id,
    beforeJson: JSON.stringify({ status: "OPEN" }),
    afterJson: JSON.stringify({ status: "SUBMITTED", submittedAt: now }),
    ip: c.req.header("cf-connecting-ip") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    createdAt: now,
  });

  const [submitted] = await db.select().from(dailyClosings).where(eq(dailyClosings.id, closing.id)).limit(1);
  return c.json({ ok: true, data: { closing: submitted } });
});

// ---------------------------------------------------------------------------
// Brand-scoped router
// ---------------------------------------------------------------------------

const brandClosings = new Hono<RouteEnv>();
brandClosings.use("*", authMiddleware);

/** GET /:brandId/closings — list closings for all partnerships of this brand. */
brandClosings.get("/:brandId/closings", async (c) => {
  const { userId } = c.get("auth");
  const brandId = c.req.param("brandId");
  const db = getDb(c.env.kongsian_db);

  const [brand] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (!brand) return c.json({ ok: false, error: { code: "BRAND_NOT_FOUND" } }, 404);
  if (brand.userId !== userId) return c.json({ ok: false, error: { code: "FORBIDDEN" } }, 403);

  const partnershipRows = await db
    .select()
    .from(partnerships)
    .where(eq(partnerships.brandId, brandId));

  if (partnershipRows.length === 0) return c.json({ ok: true, data: { closings: [] } });

  const partnershipIds = partnershipRows.map((p) => p.id);

  const closingRows = await db
    .select()
    .from(dailyClosings)
    .where(inArray(dailyClosings.partnershipId, partnershipIds))
    .orderBy(desc(dailyClosings.closingDate), desc(dailyClosings.createdAt))
    .limit(200);

  return c.json({ ok: true, data: { closings: closingRows } });
});

/** GET /:brandId/closings/:id — closing detail with lines + photos. */
brandClosings.get("/:brandId/closings/:id", async (c) => {
  const { userId } = c.get("auth");
  const { brandId, id } = c.req.param();
  const db = getDb(c.env.kongsian_db);

  const [brand] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (!brand) return c.json({ ok: false, error: { code: "BRAND_NOT_FOUND" } }, 404);
  if (brand.userId !== userId) return c.json({ ok: false, error: { code: "FORBIDDEN" } }, 403);

  const [closing] = await db.select().from(dailyClosings).where(eq(dailyClosings.id, id)).limit(1);
  if (!closing) return c.json({ ok: false, error: { code: "CLOSING_NOT_FOUND" } }, 404);

  // Verify the closing belongs to one of this brand's partnerships.
  const [partnership] = await db
    .select()
    .from(partnerships)
    .where(and(eq(partnerships.id, closing.partnershipId), eq(partnerships.brandId, brandId)))
    .limit(1);

  if (!partnership) return c.json({ ok: false, error: { code: "FORBIDDEN" } }, 403);

  const [lines, photos] = await Promise.all([
    db.select().from(dailyClosingLines).where(eq(dailyClosingLines.dailyClosingId, id)),
    db.select().from(closingPhotos).where(eq(closingPhotos.dailyClosingId, id)),
  ]);

  return c.json({ ok: true, data: { closing, lines, photos } });
});

/** POST /:brandId/closings/:id/dispute — brand raises dispute on a closing line. */
brandClosings.post("/:brandId/closings/:id/dispute", async (c) => {
  const { userId } = c.get("auth");
  const { brandId, id } = c.req.param();
  const db = getDb(c.env.kongsian_db);

  const [brand] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (!brand) return c.json({ ok: false, error: { code: "BRAND_NOT_FOUND" } }, 404);
  if (brand.userId !== userId) return c.json({ ok: false, error: { code: "FORBIDDEN" } }, 403);

  const [closing] = await db.select().from(dailyClosings).where(eq(dailyClosings.id, id)).limit(1);
  if (!closing) return c.json({ ok: false, error: { code: "CLOSING_NOT_FOUND" } }, 404);

  const [partnership] = await db
    .select()
    .from(partnerships)
    .where(and(eq(partnerships.id, closing.partnershipId), eq(partnerships.brandId, brandId)))
    .limit(1);

  if (!partnership) return c.json({ ok: false, error: { code: "FORBIDDEN" } }, 403);

  const body = await c.req.json().catch(() => ({}));
  const parsed = BrandDisputeSchema.safeParse(body);
  if (!parsed.success)
    return c.json({ ok: false, error: { code: "INVALID_INPUT", issues: parsed.error.flatten() } }, 400);

  const { closingLineId, reason, photoR2Key } = parsed.data;

  const [line] = await db
    .select()
    .from(dailyClosingLines)
    .where(
      and(eq(dailyClosingLines.id, closingLineId), eq(dailyClosingLines.dailyClosingId, id))
    )
    .limit(1);

  if (!line) return c.json({ ok: false, error: { code: "LINE_NOT_FOUND" } }, 404);

  if (line.disputeId) return c.json({ ok: false, error: { code: "ALREADY_DISPUTED" } }, 409);

  const now = Math.floor(Date.now() / 1000);
  const disputeId = crypto.randomUUID();

  await db.insert(disputes).values({
    id: disputeId,
    partnershipId: closing.partnershipId,
    dailyClosingLineId: closingLineId,
    selisihQty: line.selisih,
    status: "OPEN",
    raisedByUserId: userId,
    openedByRole: "BRAND",
    reason,
    photoR2Key: photoR2Key ?? null,
    createdAt: now,
  });

  await db
    .update(dailyClosingLines)
    .set({ disputeId })
    .where(eq(dailyClosingLines.id, closingLineId));

  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    userId,
    action: "DISPUTE_OPENED",
    entityType: "dispute",
    entityId: disputeId,
    beforeJson: null,
    afterJson: JSON.stringify({ closingLineId, reason, partnershipId: closing.partnershipId }),
    ip: c.req.header("cf-connecting-ip") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    createdAt: now,
  });

  const [dispute] = await db.select().from(disputes).where(eq(disputes.id, disputeId)).limit(1);
  return c.json({ ok: true, data: { dispute } });
});

export { tenantClosings, brandClosings };
