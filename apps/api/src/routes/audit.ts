/**
 * Audit log read-only endpoints.
 * Filters: entityType, entityId, userId, action, since.
 */
import { Hono } from "hono";
import { and, desc, eq, gte } from "drizzle-orm";
import { getDb, auditLog } from "@kongsian/db";
import { authMiddleware, type AuthContext } from "../lib/auth";
import type { Bindings } from "../index";

const router = new Hono<{ Bindings: Bindings; Variables: { auth: AuthContext } }>();
router.use("*", authMiddleware);

router.get("/", async (c) => {
  const entityType = c.req.query("entityType");
  const entityId = c.req.query("entityId");
  const userId = c.req.query("userId");
  const action = c.req.query("action");
  const since = c.req.query("since"); // unix seconds
  const limit = Math.min(parseInt(c.req.query("limit") || "100", 10), 500);

  const conditions = [];
  if (entityType) conditions.push(eq(auditLog.entityType, entityType));
  if (entityId) conditions.push(eq(auditLog.entityId, entityId));
  if (userId) conditions.push(eq(auditLog.userId, userId));
  if (action) conditions.push(eq(auditLog.action, action as any));
  if (since) conditions.push(gte(auditLog.createdAt, parseInt(since, 10)));

  const db = getDb(c.env.kongsian_db);
  const baseQuery = db
    .select()
    .from(auditLog)
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
  const rows = conditions.length ? await baseQuery.where(and(...conditions)) : await baseQuery;
  return c.json({ ok: true, data: rows });
});

export { router as audit };
