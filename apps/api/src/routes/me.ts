import { Hono } from "hono";
import { getDb, users } from "@kongsian/db";
import { eq } from "drizzle-orm";
import { authMiddleware, type AuthContext } from "../lib/auth";
import type { Bindings } from "../index";

const router = new Hono<{ Bindings: Bindings; Variables: { auth: AuthContext } }>();

/** GET /v1/me — current user from session. */
router.get("/me", authMiddleware, async (c) => {
  const { userId } = c.get("auth");
  const db = getDb(c.env.kongsian_db);
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = rows[0];
  if (!user) {
    return c.json(
      { ok: false, error: { code: "USER_NOT_FOUND", message: "Session references missing user." } },
      404
    );
  }
  return c.json({
    ok: true,
    data: {
      id: user.id,
      phoneE164: user.phoneE164,
      name: user.name,
      globalRole: user.globalRole,
      onboardingRole: user.onboardingRole,
      verificationStatus: user.verificationStatus,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    },
  });
});

export { router as me };
