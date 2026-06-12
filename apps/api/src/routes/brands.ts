/**
 * Brand + role lookup.
 * The current user's role is derived from which tables they have rows in:
 *   - brands row owned by userId  → BRAND
 *   - tenant_memberships row for userId  → TENANT
 *   - both  → BOTH (UI splits)
 *   - neither → VISITOR (must complete onboarding)
 */
import { and, eq, desc, inArray, sql } from "drizzle-orm";
import { getDb, brands, skus, partnerships, tenants, tenantMemberships, users, auditLog, type DbClient } from "@kongsian/db";
import { BrandCreateSchema } from "@kongsian/shared/validators";
import {
  DEFAULT_SPLIT_BRAND_BPS,
  DEFAULT_SPLIT_TENANT_BPS,
} from "@kongsian/shared/constants";
import { Hono } from "hono";
import { authMiddleware, type AuthContext } from "../lib/auth";
import type { Bindings } from "../index";

type Vars = { auth: AuthContext };
const router = new Hono<{ Bindings: Bindings; Variables: Vars }>();

// ---------------------------------------------------------------------------
// PUBLIC route (no auth) — used by vanity URL landing page
// `kongsian.app/<slug>`. Returns brand name + logo + description + active
// tenant count. Throttled by Cloudflare's per-IP rate limit at the edge.
// ---------------------------------------------------------------------------
router.get("/by-slug/:slug", async (c) => {
  const slug = c.req.param("slug");
  // Validate: lowercase, dashes, 2..40 chars. Reject anything else to
  // avoid exposing internal brand names.
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(slug)) {
    return c.json({ ok: false, error: { code: "INVALID_SLUG" } }, 400);
  }
  const db = getDb(c.env.kongsian_db);
  const [brand] = await db
    .select({ id: brands.id, name: brands.name, slug: brands.slug, logoR2Key: brands.logoR2Key, description: brands.description })
    .from(brands)
    .where(eq(brands.slug, slug))
    .limit(1);
  if (!brand) return c.json({ ok: false, error: { code: "BRAND_NOT_FOUND" } }, 404);

  // Count ACTIVE partnerships so the landing can say "5 cafe partners" etc.
  const [{ cnt }] = await db
    .select({ cnt: sql<number>`COUNT(*)` })
    .from(partnerships)
    .where(and(eq(partnerships.brandId, brand.id), eq(partnerships.status, "ACTIVE")));

  return c.json({
    ok: true,
    data: {
      brand: {
        id: brand.id,
        name: brand.name,
        slug: brand.slug,
        logoR2Key: brand.logoR2Key,
        description: brand.description,
      },
      activePartnershipCount: Number(cnt ?? 0),
    },
  });
});

router.use("*", authMiddleware);

/** Look up the current user's role across brand/tenant tables. */
export async function getRole(
  db: DbClient,
  userId: string
): Promise<{ role: "BRAND" | "TENANT" | "BOTH" | "VISITOR"; brandId?: string; tenantId?: string }> {
  const [brandRow] = await db.select().from(brands).where(eq(brands.userId, userId)).limit(1);
  const [tenantRow] = await db
    .select({ tenantId: tenantMemberships.tenantId })
    .from(tenantMemberships)
    .where(eq(tenantMemberships.userId, userId))
    .limit(1);

  if (brandRow && tenantRow) return { role: "BOTH", brandId: brandRow.id, tenantId: tenantRow.tenantId };
  if (brandRow) return { role: "BRAND", brandId: brandRow.id };
  if (tenantRow) return { role: "TENANT", tenantId: tenantRow.tenantId };
  return { role: "VISITOR" };
}

/** GET /v1/brands/me — role + (brandId) + (tenantId) for the current user.
 *  P0 #3: gate PENDING_VERIFICATION + REJECTED users with 403 so they
 *  cannot reach dashboards before admin approval (defense in depth — the
 *  Astro pages also enforce this client-side). */
router.get("/me", async (c) => {
  const { userId } = c.get("auth");
  const db = getDb(c.env.kongsian_db);
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return c.json({ ok: false, error: { code: "USER_NOT_FOUND" } }, 404);
  // Admin/ops bypass.
  const isAdmin = user.globalRole === "PLATFORM_ADMIN";
  if (!isAdmin && (user.verificationStatus === "PENDING_VERIFICATION" || user.verificationStatus === "REJECTED")) {
    return c.json(
      {
        ok: false,
        error: {
          code: "VERIFICATION_PENDING",
          message: "Akun kamu belum diverifikasi admin. Tunggu max 1x24 jam.",
        },
      },
      403
    );
  }
  const role = await getRole(db, userId);
  return c.json({
    ok: true,
    data: {
      user: {
        id: user.id,
        phoneE164: user.phoneE164,
        name: user.name,
        globalRole: user.globalRole,
        onboardingRole: user.onboardingRole,
        verificationStatus: user.verificationStatus,
      },
      ...role,
    },
  });
});

/** GET /v1/brands/:id — full brand detail (SKUs + partnerships) for dashboards. */
router.get("/:id", async (c) => {
  const { userId } = c.get("auth");
  const id = c.req.param("id");
  const db = getDb(c.env.kongsian_db);

  const [brand] = await db.select().from(brands).where(eq(brands.id, id)).limit(1);
  if (!brand) return c.json({ ok: false, error: { code: "BRAND_NOT_FOUND" } }, 404);

  // Authorization: brand owner or any active partnership's tenant can view.
  if (brand.userId !== userId) {
    const [membership] = await db
      .select()
      .from(tenantMemberships)
      .innerJoin(partnerships, eq(partnerships.tenantId, tenantMemberships.tenantId))
      .where(
        and(
          eq(tenantMemberships.userId, userId),
          eq(partnerships.brandId, id)
        )
      )
      .limit(1);
    if (!membership) {
      return c.json(
        { ok: false, error: { code: "FORBIDDEN", message: "Not your brand." } },
        403
      );
    }
  }

  const skuRows = await db
    .select()
    .from(skus)
    .where(eq(skus.brandId, id))
    .orderBy(desc(skus.createdAt));

  const partnershipRows = await db
    .select({
      partnership: partnerships,
      tenant: tenants,
    })
    .from(partnerships)
    .innerJoin(tenants, eq(tenants.id, partnerships.tenantId))
    .where(eq(partnerships.brandId, id))
    .orderBy(desc(partnerships.createdAt));

  return c.json({
    ok: true,
    data: {
      brand,
      skus: skuRows,
      partnerships: partnershipRows.map((r) => ({ ...r.partnership, tenant: r.tenant })),
      isOwner: brand.userId === userId,
    },
  });
});

/** GET /v1/brands/:id/partnerships — active partnerships only (light, for dropdowns).
 *  Lightweight alternative to /v1/brands/:id which loads full SKU list + all partnerships.
 *  Used by the "Catat Hari Ini" partner picker, dashboard cards, etc. */
router.get("/:id/partnerships", async (c) => {
  const { userId } = c.get("auth");
  const id = c.req.param("id");
  const statusFilter = c.req.query("status"); // optional: ACTIVE | PENDING | ENDED | ...
  const db = getDb(c.env.kongsian_db);

  const [brand] = await db.select({ id: brands.id, userId: brands.userId }).from(brands).where(eq(brands.id, id)).limit(1);
  if (!brand) return c.json({ ok: false, error: { code: "BRAND_NOT_FOUND" } }, 404);

  if (brand.userId !== userId) {
    const [membership] = await db
      .select()
      .from(tenantMemberships)
      .innerJoin(partnerships, eq(partnerships.tenantId, tenantMemberships.tenantId))
      .where(
        and(
          eq(tenantMemberships.userId, userId),
          eq(partnerships.brandId, id)
        )
      )
      .limit(1);
    if (!membership) {
      return c.json(
        { ok: false, error: { code: "FORBIDDEN", message: "Not your brand." } },
        403
      );
    }
  }

  const conditions = [eq(partnerships.brandId, id)];
  if (statusFilter) conditions.push(eq(partnerships.status, statusFilter as "ACTIVE" | "PENDING" | "ENDED"));

  const partnershipRows = await db
    .select({
      partnership: partnerships,
      tenant: tenants,
    })
    .from(partnerships)
    .innerJoin(tenants, eq(tenants.id, partnerships.tenantId))
    .where(and(...conditions))
    .orderBy(desc(partnerships.createdAt));

  return c.json({
    ok: true,
    data: {
      partnerships: partnershipRows.map((r) => ({ ...r.partnership, tenant: r.tenant })),
      isOwner: brand.userId === userId,
    },
  });
});

/** POST /v1/brands — create a brand for the current user. */
router.post("/", async (c) => {
  const { userId } = c.get("auth");
  const body = await c.req.json().catch(() => ({}));
  const parsed = BrandCreateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { ok: false, error: { code: "INVALID_INPUT", issues: parsed.error.flatten() } },
      400
    );
  }
  const { name, slug, description } = parsed.data;
  const db = getDb(c.env.kongsian_db);
  const now = Math.floor(Date.now() / 1000);
  const id = crypto.randomUUID();

  // Idempotency: if user already owns a brand with same slug, return it.
  const [existing] = await db
    .select()
    .from(brands)
    .where(and(eq(brands.userId, userId), eq(brands.slug, slug)))
    .limit(1);
  if (existing) {
    return c.json({ ok: true, data: { brand: existing, alreadyExists: true } });
  }

  await db.insert(brands).values({
    id,
    userId,
    name,
    slug,
    description: description ?? null,
    createdAt: now,
  });

  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    userId,
    action: "BRAND_CREATED",
    entityType: "brand",
    entityId: id,
    beforeJson: null,
    afterJson: JSON.stringify({ name, slug }),
    ip: c.req.header("cf-connecting-ip") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    createdAt: now,
  });

  const [brand] = await db.select().from(brands).where(eq(brands.id, id)).limit(1);
  return c.json({ ok: true, data: { brand } });
});

/** PATCH /v1/brands/:id — owner only. */
router.patch("/:id", async (c) => {
  const { userId } = c.get("auth");
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const db = getDb(c.env.kongsian_db);

  const [brand] = await db.select().from(brands).where(eq(brands.id, id)).limit(1);
  if (!brand) return c.json({ ok: false, error: { code: "BRAND_NOT_FOUND" } }, 404);
  if (brand.userId !== userId) {
    return c.json({ ok: false, error: { code: "FORBIDDEN" } }, 403);
  }
  const now = Math.floor(Date.now() / 1000);
  const updates: Partial<typeof brands.$inferInsert> = {};
  if (typeof body.name === "string" && body.name.length >= 2) updates.name = body.name;
  if (typeof body.description === "string") updates.description = body.description;
  if (Object.keys(updates).length === 0) {
    return c.json({ ok: true, data: { brand } });
  }
  await db.update(brands).set(updates).where(eq(brands.id, id));
  const [after] = await db.select().from(brands).where(eq(brands.id, id)).limit(1);
  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    userId,
    action: "BRAND_UPDATED",
    entityType: "brand",
    entityId: id,
    beforeJson: JSON.stringify(brand),
    afterJson: JSON.stringify(after),
    ip: c.req.header("cf-connecting-ip") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    createdAt: now,
  });
  return c.json({ ok: true, data: { brand: after } });
});

export { router as brands };
