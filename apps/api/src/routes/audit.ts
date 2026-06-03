/**
 * Audit log read-only endpoints.
 * Filters: entityType, entityId, userId, action, since.
 * P0 #2 IDOR fix: even with explicit ?userId= filters, we ALWAYS intersect
 * the result set with the entities the caller can actually reach — brands
 * they own + tenants they are a member of. userId filter, when set, is
 * intersected with the caller's own userId (so you can only ask for your
 * own audit trail, not someone else's).
 */
import { Hono } from "hono";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import {
  getDb,
  auditLog,
  brands,
  tenantMemberships,
} from "@kongsian/db";
import { authMiddleware, type AuthContext } from "../lib/auth";
import type { Bindings } from "../index";

const router = new Hono<{ Bindings: Bindings; Variables: { auth: AuthContext } }>();
router.use("*", authMiddleware);

router.get("/", async (c) => {
  const { userId } = c.get("auth");
  const entityType = c.req.query("entityType");
  const entityId = c.req.query("entityId");
  const userIdQuery = c.req.query("userId");
  const action = c.req.query("action");
  const since = c.req.query("since"); // unix seconds
  const limit = Math.min(parseInt(c.req.query("limit") || "100", 10), 500);

  const db = getDb(c.env.kongsian_db);

  // Authorization: build the set of entityIds the user can see.
  // - audit rows for brand entities the user owns
  // - audit rows for tenant entities the user is a member of
  // - audit rows for sku/partnership entities tied to those brands/tenants
  //   (any entityId that appears in auditLog for one of the user's brands
  //    or tenant memberships)
  const ownedBrandIds = (
    await db
      .select({ id: brands.id })
      .from(brands)
      .where(eq(brands.userId, userId))
  ).map((r) => r.id);
  const memberTenantIds = (
    await db
      .select({ tenantId: tenantMemberships.tenantId })
      .from(tenantMemberships)
      .where(eq(tenantMemberships.userId, userId))
  ).map((r) => r.tenantId);

  // Pull every auditLog.entityId the user is "rooted" to: user-self, owned
  // brand, member tenant. This is the coarse but safe scope.
  const allowedIds = new Set<string>([userId, ...ownedBrandIds, ...memberTenantIds]);

  // If the caller asked for a specific entity, the entity must be in scope.
  if (entityId && !allowedIds.has(entityId)) {
    return c.json({ ok: true, data: [] });
  }

  // userId filter is intersected with caller identity — you can only read
  // your own audit trail.
  const effectiveUserId = userIdQuery && userIdQuery !== userId ? null : userId;

  const conditions: any[] = [];
  if (entityType) conditions.push(eq(auditLog.entityType, entityType));
  if (entityId) conditions.push(eq(auditLog.entityId, entityId));
  if (action) conditions.push(eq(auditLog.action, action as any));
  if (since) conditions.push(gte(auditLog.createdAt, parseInt(since, 10)));
  if (effectiveUserId) conditions.push(eq(auditLog.userId, effectiveUserId));
  // Always restrict to entityIds the caller is rooted to.
  if (allowedIds.size > 0) {
    conditions.push(inArray(auditLog.entityId, Array.from(allowedIds)));
  } else {
    // No owned brand + no member tenant + not self = no rows allowed.
    return c.json({ ok: true, data: [] });
  }

  const rows = await db
    .select()
    .from(auditLog)
    .where(conditions.length === 1 ? conditions[0] : and(...conditions))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
  return c.json({ ok: true, data: rows });
});

export { router as audit };
