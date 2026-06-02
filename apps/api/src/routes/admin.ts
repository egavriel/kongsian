/**
 * Admin endpoints — gated behind PLATFORM_ADMIN.
 *
 * Currently:
 *   - GET  /v1/admin/users?status=PENDING_VERIFICATION  list users by verification status
 *   - POST /v1/admin/users/:id/verify                   { status: "VERIFIED" | "REJECTED" }
 *
 * All routes are protected by authMiddleware + a role check.
 */
import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import {
  getDb,
  users,
  auditLog,
  type DbClient,
} from "@kongsian/db";
import { AdminVerifyUserSchema } from "@kongsian/shared/validators";
import { authMiddleware, type AuthContext, getUser } from "../lib/auth";
import type { Bindings } from "../index";

const router = new Hono<{ Bindings: Bindings; Variables: { auth: AuthContext } }>();
router.use("*", authMiddleware);

/** Role guard — must be PLATFORM_ADMIN. */
async function requireAdmin(c: any, db: DbClient) {
  const user = await getUser(c);
  if (!user || user.globalRole !== "PLATFORM_ADMIN") {
    return {
      ok: false as const,
      response: c.json(
        {
          ok: false,
          error: {
            code: "FORBIDDEN",
            message: "Platform admin role required.",
          },
        },
        403
      ),
    };
  }
  return { ok: true as const, admin: user };
}

/**
 * GET /v1/admin/users
 *   ?status=PENDING_VERIFICATION | VERIFIED | REJECTED  (default PENDING_VERIFICATION)
 * Returns the most recent 200 users matching the status.
 */
router.get("/users", async (c) => {
  const db = getDb(c.env.kongsian_db);
  const guard = await requireAdmin(c, db);
  if (!guard.ok) return guard.response;

  const status = (c.req.query("status") ?? "PENDING_VERIFICATION") as
    | "PENDING_VERIFICATION"
    | "VERIFIED"
    | "REJECTED";
  if (!["PENDING_VERIFICATION", "VERIFIED", "REJECTED"].includes(status)) {
    return c.json(
      {
        ok: false,
        error: { code: "INVALID_INPUT", message: "status must be PENDING_VERIFICATION | VERIFIED | REJECTED" },
      },
      400
    );
  }

  const rows = await db
    .select({
      id: users.id,
      phoneE164: users.phoneE164,
      name: users.name,
      globalRole: users.globalRole,
      onboardingRole: users.onboardingRole,
      verificationStatus: users.verificationStatus,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .where(eq(users.verificationStatus, status))
    .orderBy(desc(users.createdAt))
    .limit(200);

  return c.json({ ok: true, data: { users: rows, count: rows.length } });
});

/**
 * POST /v1/admin/users/:id/verify
 *   body: { status: "VERIFIED" | "REJECTED", note?: string }
 * Approve or reject a pending user. Writes an audit log entry.
 */
router.post("/users/:id/verify", async (c) => {
  const db = getDb(c.env.kongsian_db);
  const guard = await requireAdmin(c, db);
  if (!guard.ok) return guard.response;

  const body = await c.req.json().catch(() => ({}));
  const parsed = AdminVerifyUserSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { ok: false, error: { code: "INVALID_INPUT", issues: parsed.error.flatten() } },
      400
    );
  }
  const { status, note } = parsed.data;
  const targetId = c.req.param("id");
  if (!targetId) {
    return c.json(
      { ok: false, error: { code: "INVALID_INPUT", message: "user id required" } },
      400
    );
  }

  const beforeRows = await db.select().from(users).where(eq(users.id, targetId)).limit(1);
  const before = beforeRows[0];
  if (!before) {
    return c.json(
      { ok: false, error: { code: "USER_NOT_FOUND", message: "User does not exist." } },
      404
    );
  }

  const now = Math.floor(Date.now() / 1000);
  await db
    .update(users)
    .set({ verificationStatus: status, lastLoginAt: before.lastLoginAt ?? now })
    .where(eq(users.id, targetId));

  const afterRows = await db.select().from(users).where(eq(users.id, targetId)).limit(1);
  const after = afterRows[0];

  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    userId: guard.admin.id,
    action:
      status === "VERIFIED" ? "USER_VERIFICATION_APPROVED" : "USER_VERIFICATION_REJECTED",
    entityType: "user",
    entityId: targetId,
    beforeJson: JSON.stringify({
      verificationStatus: before.verificationStatus,
      name: before.name,
      phoneE164: before.phoneE164,
    }),
    afterJson: JSON.stringify({
      verificationStatus: after.verificationStatus,
      note: note ?? null,
    }),
    ip: c.req.header("cf-connecting-ip") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    createdAt: now,
  });

  return c.json({
    ok: true,
    data: {
      user: {
        id: after.id,
        phoneE164: after.phoneE164,
        name: after.name,
        globalRole: after.globalRole,
        onboardingRole: after.onboardingRole,
        verificationStatus: after.verificationStatus,
        createdAt: after.createdAt,
      },
    },
  });
});

/** Health: pending count, for the admin header chip. */
router.get("/pending-count", async (c) => {
  const db = getDb(c.env.kongsian_db);
  const guard = await requireAdmin(c, db);
  if (!guard.ok) return guard.response;

  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.verificationStatus, "PENDING_VERIFICATION"));
  return c.json({ ok: true, data: { count: rows.length } });
});

export { router as admin };
