/**
 * SKU CRUD — brand-scoped.
 * All write ops validate the caller owns the parent brand.
 */
import { Hono } from "hono";
import { and, eq, desc } from "drizzle-orm";
import { z } from "zod";
import { getDb, brands, skus, partnershipSkus, partnerships, tenantMemberships, auditLog } from "@kongsian/db";
import { authMiddleware, type AuthContext } from "../lib/auth";
import type { Bindings } from "../index";

const router = new Hono<{ Bindings: Bindings; Variables: { auth: AuthContext } }>();
router.use("*", authMiddleware);

const SkuUpsertSchema = z.object({
  brandId: z.string().min(1),
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(80),
  priceIdr: z.number().int().positive().max(1_000_000_000),
  costIdr: z.number().int().nonnegative().optional(),
  masaSimpanHari: z.number().int().min(1).max(365).default(7),
});
const SkuPatchSchema = SkuUpsertSchema.partial().omit({ brandId: true });

async function assertBrandOwner(env: Bindings, userId: string, brandId: string) {
  const db = getDb(env.kongsian_db);
  const [brand] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (!brand) return { ok: false as const, code: 404, error: "BRAND_NOT_FOUND" };
  if (brand.userId !== userId) return { ok: false as const, code: 403, error: "FORBIDDEN" };
  return { ok: true as const, db, brand };
}

/** GET /v1/skus?brandId=... — list SKUs for a brand. IDOR fix (P0 #2):
 *  the caller must own the brand (or be an active partnership's tenant
 *  member, mirroring the brands.ts:67-94 ownership rule). */
router.get("/", async (c) => {
  const { userId } = c.get("auth");
  const brandId = c.req.query("brandId");
  if (!brandId) {
    return c.json({ ok: false, error: { code: "MISSING_BRAND_ID" } }, 400);
  }
  const owner = await assertBrandOwner(c.env, userId, brandId);
  if (!owner.ok) {
    // Owners always allowed. Tenants (active partnership member) also allowed,
    // so the cafe PIC can see what SKUs they're titip'd. Use the same path.
    const db = getDb(c.env.kongsian_db);
    const tenantAccess = await db
      .select({ id: partnerships.id })
      .from(partnerships)
      .innerJoin(
        tenantMemberships,
        and(
          eq(tenantMemberships.tenantId, partnerships.tenantId),
          eq(tenantMemberships.userId, userId)
        )
      )
      .where(
        and(
          eq(partnerships.brandId, brandId),
          eq(partnerships.status, "ACTIVE")
        )
      )
      .limit(1);
    if (tenantAccess.length === 0) {
      return c.json({ ok: false, error: { code: owner.error } }, owner.code as 403 | 404);
    }
    const rows = await db
      .select()
      .from(skus)
      .where(eq(skus.brandId, brandId))
      .orderBy(desc(skus.createdAt));
    return c.json({ ok: true, data: rows });
  }
  const rows = await owner.db
    .select()
    .from(skus)
    .where(eq(skus.brandId, brandId))
    .orderBy(desc(skus.createdAt));
  return c.json({ ok: true, data: rows });
});

/** POST /v1/skus — create a SKU. Brand owner only. */
router.post("/", async (c) => {
  const { userId } = c.get("auth");
  const body = await c.req.json().catch(() => ({}));
  const parsed = SkuUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: { code: "INVALID_INPUT", issues: parsed.error.flatten() } }, 400);
  }
  const { brandId, code, name, priceIdr, costIdr, masaSimpanHari } = parsed.data;
  const owner = await assertBrandOwner(c.env, userId, brandId);
  if (!owner.ok) return c.json({ ok: false, error: { code: owner.error } }, owner.code as 403 | 404);
  const { db, brand } = owner;
  const now = Math.floor(Date.now() / 1000);
  const id = crypto.randomUUID();

  // Upsert by (brandId, code) — return existing if duplicate.
  const [existing] = await db
    .select()
    .from(skus)
    .where(and(eq(skus.brandId, brandId), eq(skus.code, code)))
    .limit(1);
  if (existing) {
    return c.json({ ok: true, data: { sku: existing, alreadyExists: true } });
  }

  await db.insert(skus).values({
    id,
    brandId,
    code,
    name,
    priceIdr,
    costIdr: costIdr ?? null,
    masaSimpanHari,
    active: true,
    createdAt: now,
  });

  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    userId,
    action: "SKU_CREATED",
    entityType: "sku",
    entityId: id,
    beforeJson: null,
    afterJson: JSON.stringify({ brandId, code, name, priceIdr, masaSimpanHari }),
    ip: c.req.header("cf-connecting-ip") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    createdAt: now,
  });

  const [sku] = await db.select().from(skus).where(eq(skus.id, id)).limit(1);
  return c.json({ ok: true, data: { sku, brandSlug: brand.slug } });
});

/** PATCH /v1/skus/:id — partial update. Brand owner only. */
router.patch("/:id", async (c) => {
  const { userId } = c.get("auth");
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const parsed = SkuPatchSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: { code: "INVALID_INPUT", issues: parsed.error.flatten() } }, 400);
  }
  const db = getDb(c.env.kongsian_db);
  const [existing] = await db.select().from(skus).where(eq(skus.id, id)).limit(1);
  if (!existing) return c.json({ ok: false, error: { code: "SKU_NOT_FOUND" } }, 404);
  const owner = await assertBrandOwner(c.env, userId, existing.brandId);
  if (!owner.ok) return c.json({ ok: false, error: { code: owner.error } }, owner.code as 403 | 404);

  const updates: Partial<typeof skus.$inferInsert> = {};
  if (parsed.data.name) updates.name = parsed.data.name;
  if (parsed.data.priceIdr) updates.priceIdr = parsed.data.priceIdr;
  if (parsed.data.costIdr !== undefined) updates.costIdr = parsed.data.costIdr;
  if (parsed.data.masaSimpanHari) updates.masaSimpanHari = parsed.data.masaSimpanHari;
  if (typeof parsed.data.code === "string" && parsed.data.code !== existing.code) {
    // Code change — ensure uniqueness.
    const [dup] = await db
      .select()
      .from(skus)
      .where(and(eq(skus.brandId, existing.brandId), eq(skus.code, parsed.data.code)))
      .limit(1);
    if (dup && dup.id !== id) {
      return c.json({ ok: false, error: { code: "SKU_CODE_TAKEN" } }, 409);
    }
    updates.code = parsed.data.code;
  }
  if (Object.keys(updates).length === 0) {
    return c.json({ ok: true, data: { sku: existing } });
  }
  const now = Math.floor(Date.now() / 1000);
  await db.update(skus).set(updates).where(eq(skus.id, id));
  const [after] = await db.select().from(skus).where(eq(skus.id, id)).limit(1);
  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    userId,
    action: "SKU_UPDATED",
    entityType: "sku",
    entityId: id,
    beforeJson: JSON.stringify(existing),
    afterJson: JSON.stringify(after),
    ip: c.req.header("cf-connecting-ip") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    createdAt: now,
  });
  return c.json({ ok: true, data: { sku: after } });
});

/** DELETE /v1/skus/:id — soft delete (active=false). Brand owner only. */
router.delete("/:id", async (c) => {
  const { userId } = c.get("auth");
  const id = c.req.param("id");
  const db = getDb(c.env.kongsian_db);
  const [existing] = await db.select().from(skus).where(eq(skus.id, id)).limit(1);
  if (!existing) return c.json({ ok: false, error: { code: "SKU_NOT_FOUND" } }, 404);
  const owner = await assertBrandOwner(c.env, userId, existing.brandId);
  if (!owner.ok) return c.json({ ok: false, error: { code: owner.error } }, owner.code as 403 | 404);

  const now = Math.floor(Date.now() / 1000);
  await db.update(skus).set({ active: false }).where(eq(skus.id, id));
  await db.update(partnershipSkus).set({ active: false }).where(eq(partnershipSkus.skuId, id));
  const [after] = await db.select().from(skus).where(eq(skus.id, id)).limit(1);
  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    userId,
    action: "SKU_UPDATED",
    entityType: "sku",
    entityId: id,
    beforeJson: JSON.stringify(existing),
    afterJson: JSON.stringify(after),
    ip: c.req.header("cf-connecting-ip") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    createdAt: now,
  });
  return c.json({ ok: true, data: { sku: after, deactivated: true } });
});

export { router as skus };
