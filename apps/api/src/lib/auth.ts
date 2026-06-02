/**
 * Bearer-token auth middleware.
 * Extracts the session token from `Authorization: Bearer <token>`, looks up
 * the session by hash, and attaches the user id + session id to context.
 */
import type { Context, MiddlewareHandler } from "hono";
import { eq } from "drizzle-orm";
import { getDb, sessions, users } from "@kongsian/db";
import { hashOtpCode } from "./crypto";
import type { Bindings } from "../index";

export interface AuthContext {
  userId: string;
  sessionId: string;
}

export const authMiddleware: MiddlewareHandler<{
  Bindings: Bindings;
  Variables: { auth: AuthContext };
}> = async (c, next) => {
  const auth = c.req.header("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    return c.json(
      { ok: false, error: { code: "UNAUTHENTICATED", message: "Missing Bearer token." } },
      401
    );
  }
  const token = m[1].trim();
  const tokenHash = await hashOtpCode(token, c.env.OTP_HMAC_KEY);

  const db = getDb(c.env.kongsian_db);
  const rows = await db
    .select({ id: sessions.id, userId: sessions.userId, expiresAt: sessions.expiresAt })
    .from(sessions)
    .where(eq(sessions.sessionTokenHash, tokenHash))
    .limit(1);

  const session = rows[0];
  if (!session) {
    return c.json(
      { ok: false, error: { code: "INVALID_SESSION", message: "Session not found." } },
      401
    );
  }
  if (session.expiresAt < Math.floor(Date.now() / 1000)) {
    return c.json(
      { ok: false, error: { code: "SESSION_EXPIRED", message: "Session has expired." } },
      401
    );
  }
  c.set("auth", { userId: session.userId, sessionId: session.id });
  await next();
};

/** Optional auth — populates context when Bearer is present, otherwise no-op. */
export const optionalAuth: MiddlewareHandler<{
  Bindings: Bindings;
  Variables: { auth?: AuthContext };
}> = async (c, next) => {
  const auth = c.req.header("authorization");
  if (!auth) return next();
  return authMiddleware(c as Context, next);
};

/** Light user lookup helper for routes that want a user object. */
export async function getUser(c: { env: Bindings; get: (k: "auth") => AuthContext }) {
  const { userId } = c.get("auth");
  const db = getDb(c.env.kongsian_db);
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return rows[0];
}
