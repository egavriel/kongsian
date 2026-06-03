/**
 * Tenant (cafe) CRUD. Mostly used by admin/seed; brand uses the invite flow.
 * Tenant PICs are looked up by phone (no FK to users until they sign up).
 */
import { Hono } from "hono";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, tenants, tenantMemberships, auditLog } from "@kongsian/db";
import { authMiddleware, type AuthContext } from "../lib/auth";
import type { Bindings } from "../index";

const router = new Hono<{ Bindings: Bindings; Variables: { auth: AuthContext } }>();
router.use("*", authMiddleware);

const TenantUpsertSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z.string().min(2).max(40).regex(/^[a-z0-9-]+$/),
  address: z.string().max(200).optional(),
  picPhoneE164: z.string().regex(/^\+[1-9]\d{7,14}$/),
});

/** GET /v1/tenants — list (optional ?phone=). IDOR fix (P0 #2): always scope
 *  results to tenants where the authenticated user has a membership row, OR
 *  to the explicit ?phone= self-lookup. We never return the full tenants
 *  table to any caller. */
router.get("/", async (c) => {
  const { userId } = c.get("auth");
  const phone = c.req.query("phone");
  const db = getDb(c.env.kongsian_db);

  // Find every tenant this user is a member of.
  const memberRows = await db
    .select({ tenantId: tenantMemberships.tenantId })
    .from(tenantMemberships)
    .where(eq(tenantMemberships.userId, userId));
  const memberTenantIds = memberRows.map((r) => r.tenantId);

  if (phone) {
    // Self-lookup of own tenant by PIC phone — only allowed for tenants the
    // user is actually a member of (admin/seed uses POST /v1/tenants, not this).
    if (memberTenantIds.length === 0) return c.json({ ok: true, data: [] });
    const rows = await db
      .select()
      .from(tenants)
      .where(
        and(
          eq(tenants.picPhoneE164, phone),
          inArray(tenants.id, memberTenantIds)
        )
      );
    return c.json({ ok: true, data: rows });
  }
  if (memberTenantIds.length === 0) return c.json({ ok: true, data: [] });
  const rows = await db
    .select()
    .from(tenants)
    .where(inArray(tenants.id, memberTenantIds))
    .limit(50);
  return c.json({ ok: true, data: rows });
});

/** POST /v1/tenants — admin/seed only (used by seed script and `/invite`). */
router.post("/", async (c) => {
  const { userId } = c.get("auth");
  const body = await c.req.json().catch(() => ({}));
  const parsed = TenantUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: { code: "INVALID_INPUT", issues: parsed.error.flatten() } }, 400);
  }
  const { name, slug, address, picPhoneE164 } = parsed.data;
  const db = getDb(c.env.kongsian_db);
  const now = Math.floor(Date.now() / 1000);
  const id = crypto.randomUUID();

  // Idempotent by slug.
  const [existing] = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
  if (existing) {
    return c.json({ ok: true, data: { tenant: existing, alreadyExists: true } });
  }

  await db.insert(tenants).values({
    id,
    name,
    slug,
    address: address ?? null,
    picPhoneE164,
    createdAt: now,
  });
  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    userId,
    action: "TENANT_CREATED",
    entityType: "tenant",
    entityId: id,
    beforeJson: null,
    afterJson: JSON.stringify({ name, slug, picPhoneE164 }),
    ip: c.req.header("cf-connecting-ip") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    createdAt: now,
  });
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
  return c.json({ ok: true, data: { tenant } });
});

export { router as tenants };
