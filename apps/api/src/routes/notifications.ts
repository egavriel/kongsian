/**
 * Notifications API — Week 3, Track D.
 *
 *   GET  /v1/notifications?unread=true     list for caller
 *   POST /v1/notifications/:id/read        mark read
 *   POST /v1/notifications/read-all        mark all read
 *   POST /v1/notifications/test            admin-only smoke test (insert + send)
 */
import { Hono } from "hono";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, notifications, auditLog } from "@kongsian/db";
import { authMiddleware, getUser, type AuthContext } from "../lib/auth";
import type { Bindings } from "../index";

type Vars = { auth: AuthContext };
type RouteEnv = { Bindings: Bindings; Variables: Vars };

const router = new Hono<RouteEnv>();
router.use("*", authMiddleware);

const ListQuerySchema = z.object({
  unread: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => v === "true"),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const TestNotificationSchema = z.object({
  userId: z.string().min(1),
  kind: z.enum([
    "CLOSING_REMINDER",
    "CLOSING_SUBMITTED",
    "DISPUTE_OPENED",
    "DISPUTE_MESSAGE",
    "DISPUTE_RESOLVED",
    "SETTLEMENT_READY",
    "SETTLEMENT_APPROVED",
    "SETTLEMENT_PAID",
    "OTP",
  ]),
  title: z.string().min(1).max(200),
  body: z.string().max(2000).optional(),
});

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

// ---------------------------------------------------------------------------
// GET /v1/notifications
// ---------------------------------------------------------------------------
router.get("/", async (c) => {
  const q = ListQuerySchema.safeParse(c.req.query());
  if (!q.success) {
    return c.json({ ok: false, error: { code: "INVALID_INPUT", issues: q.error.issues } }, 400);
  }
  const { userId } = c.get("auth");
  const db = getDb(c.env.kongsian_db);

  const filters = [eq(notifications.userId, userId)];
  if (q.data.unread) filters.push(isNull(notifications.readAt));
  const where = and(...filters);

  const rows = await db
    .select()
    .from(notifications)
    .where(where)
    .orderBy(desc(notifications.createdAt))
    .limit(q.data.limit)
    .offset(q.data.offset);

  const [{ unreadCount }] = await db
    .select({ unreadCount: sql<number>`COUNT(*)` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));

  return c.json({
    ok: true,
    data: { notifications: rows, unreadCount: Number(unreadCount ?? 0) },
  });
});

// ---------------------------------------------------------------------------
// POST /v1/notifications/:id/read
// ---------------------------------------------------------------------------
router.post("/:id/read", async (c) => {
  const id = c.req.param("id");
  const { userId } = c.get("auth");
  const db = getDb(c.env.kongsian_db);
  const now = nowSec();

  // Conditional: only if not already read (idempotent)
  const updated = await db
    .update(notifications)
    .set({ readAt: now })
    .where(
      and(
        eq(notifications.id, id),
        eq(notifications.userId, userId),
        isNull(notifications.readAt)
      )
    )
    .returning();

  if (updated.length === 0) {
    // Either not found / not owned / already read. Return 200 idempotently.
    const [existing] = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
      .limit(1);
    if (!existing) return c.json({ ok: false, error: { code: "NOT_FOUND" } }, 404);
    return c.json({ ok: true, data: { notification: existing, alreadyRead: true } });
  }

  return c.json({ ok: true, data: { notification: updated[0] } });
});

// ---------------------------------------------------------------------------
// POST /v1/notifications/read-all
// ---------------------------------------------------------------------------
router.post("/read-all", async (c) => {
  const { userId } = c.get("auth");
  const db = getDb(c.env.kongsian_db);
  const now = nowSec();

  const updated = await db
    .update(notifications)
    .set({ readAt: now })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .returning({ id: notifications.id });

  return c.json({ ok: true, data: { marked: updated.length } });
});

// ---------------------------------------------------------------------------
// POST /v1/notifications/test  (admin only — smoke test for the WA dispatcher)
// ---------------------------------------------------------------------------
router.post("/test", async (c) => {
  const body = TestNotificationSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    return c.json({ ok: false, error: { code: "INVALID_INPUT", issues: body.error.issues } }, 400);
  }
  const user = await getUser(c);
  if (!user || user.globalRole !== "PLATFORM_ADMIN") {
    return c.json({ ok: false, error: { code: "FORBIDDEN" } }, 403);
  }
  const db = getDb(c.env.kongsian_db);
  const now = nowSec();
  const id = crypto.randomUUID();
  await db.insert(notifications).values({
    id,
    userId: body.data.userId,
    kind: body.data.kind,
    title: body.data.title,
    body: body.data.body ?? null,
    entityType: null,
    entityId: null,
    readAt: null,
    waSent: 0,
    createdAt: now,
  });
  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    userId: user.id,
    action: "NOTIFICATION_TEST",
    entityType: "notification",
    entityId: id,
    beforeJson: null,
    afterJson: JSON.stringify({ kind: body.data.kind }),
    ip: c.req.header("cf-connecting-ip") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    createdAt: now,
  });
  return c.json({ ok: true, data: { notificationId: id } }, 201);
});

export { router as notifications };
