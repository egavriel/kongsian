import { Hono } from "hono";
import { eq, and, desc, gte } from "drizzle-orm";
import { getDb, otps, sessions, users } from "@kongsian/db";
import {
  OtpRequestSchema,
  OtpVerifySchema,
} from "@kongsian/shared/validators";
import {
  OTP_TTL_SECONDS,
  OTP_MAX_ATTEMPTS,
  SESSION_TTL_SECONDS,
} from "@kongsian/shared/constants";
import type { Bindings } from "../index";
import { generateOtpCode, hashOtpCode, generateSessionToken } from "../lib/crypto";
import { authMiddleware, type AuthContext } from "../lib/auth";

const router = new Hono<{ Bindings: Bindings; Variables: { auth: AuthContext } }>();

/**
 * POST /v1/auth/otp/request
 * Generate a 6-digit OTP, store its hash, return the code in dev (no real WA yet).
 */
router.post("/otp/request", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = OtpRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { ok: false, error: { code: "INVALID_INPUT", issues: parsed.error.flatten() } },
      400
    );
  }
  const { phone, purpose } = parsed.data;
  const db = getDb(c.env.kongsian_db);

  const code = generateOtpCode();
  const codeHash = await hashOtpCode(code, c.env.OTP_HMAC_KEY);
  const now = Math.floor(Date.now() / 1000);
  const ttl = parseInt(c.env.OTP_TTL_SECONDS || String(OTP_TTL_SECONDS), 10);
  const expiresAt = now + ttl;

  await db.insert(otps).values({
    id: crypto.randomUUID(),
    phoneE164: phone,
    codeHash,
    expiresAt,
    attempts: 0,
    purpose,
    createdAt: now,
  });

  // TODO: send via WhatsApp Cloud API when WA_PHONE_ID + WA_TOKEN are set.
  // For Week 1, surface the code in the response in dev only.
  const isDev = c.env.ENV === "development";
  return c.json({
    ok: true,
    data: {
      phone,
      purpose,
      expiresAt,
      // dev only — never include in production
      ...(isDev ? { devCode: code } : {}),
    },
  });
});

/**
 * POST /v1/auth/otp/verify
 * Check code, create or fetch user, mint a session token.
 */
router.post("/otp/verify", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = OtpVerifySchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { ok: false, error: { code: "INVALID_INPUT", issues: parsed.error.flatten() } },
      400
    );
  }
  const { phone, code, purpose } = parsed.data;
  const db = getDb(c.env.kongsian_db);

  // Pull most-recent unconsumed OTP for this phone+purpose.
  const rows = await db
    .select()
    .from(otps)
    .where(and(eq(otps.phoneE164, phone), eq(otps.purpose, purpose)))
    .orderBy(desc(otps.createdAt))
    .limit(1);

  const row = rows[0];
  const now = Math.floor(Date.now() / 1000);

  if (!row) {
    return c.json(
      { ok: false, error: { code: "OTP_NOT_FOUND", message: "No OTP requested for this phone." } },
      400
    );
  }
  if (row.consumedAt) {
    return c.json(
      { ok: false, error: { code: "OTP_ALREADY_USED", message: "This OTP has already been used." } },
      400
    );
  }
  if (row.expiresAt < now) {
    return c.json(
      { ok: false, error: { code: "OTP_EXPIRED", message: "This OTP has expired." } },
      400
    );
  }

  const maxAttempts = parseInt(c.env.OTP_MAX_ATTEMPTS || String(OTP_MAX_ATTEMPTS), 10);
  if (row.attempts >= maxAttempts) {
    return c.json(
      { ok: false, error: { code: "OTP_TOO_MANY_ATTEMPTS", message: "Too many attempts." } },
      429
    );
  }

  const candidateHash = await hashOtpCode(code, c.env.OTP_HMAC_KEY);
  if (candidateHash !== row.codeHash) {
    // increment attempts (note: in prod, batch this with a separate write or accept the race)
    await db
      .update(otps)
      .set({ attempts: row.attempts + 1 })
      .where(eq(otps.id, row.id));
    return c.json(
      { ok: false, error: { code: "OTP_INVALID", message: "Incorrect code." } },
      400
    );
  }

  // Consume the OTP.
  await db.update(otps).set({ consumedAt: now }).where(eq(otps.id, row.id));

  // Find or create user.
  let userRows = await db.select().from(users).where(eq(users.phoneE164, phone)).limit(1);
  let user = userRows[0];
  if (!user) {
    const id = crypto.randomUUID();
    await db.insert(users).values({
      id,
      phoneE164: phone,
      name: phone, // placeholder; updated on profile completion
      globalRole: "USER",
      createdAt: now,
      lastLoginAt: now,
    });
    userRows = await db.select().from(users).where(eq(users.id, id)).limit(1);
    user = userRows[0];
  } else {
    await db.update(users).set({ lastLoginAt: now }).where(eq(users.id, user.id));
  }

  // Mint session.
  const sessionToken = await generateSessionToken();
  const sessionId = crypto.randomUUID();
  const ttl = parseInt(c.env.SESSION_TTL_SECONDS || String(SESSION_TTL_SECONDS), 10);
  await db.insert(sessions).values({
    id: sessionId,
    userId: user.id,
    sessionTokenHash: await hashOtpCode(sessionToken, c.env.OTP_HMAC_KEY),
    expiresAt: now + ttl,
    userAgent: c.req.header("user-agent") ?? null,
    ip: c.req.header("cf-connecting-ip") ?? null,
  });

  return c.json({
    ok: true,
    data: {
      sessionToken,
      sessionId,
      expiresAt: now + ttl,
      user: {
        id: user.id,
        phoneE164: user.phoneE164,
        name: user.name,
        globalRole: user.globalRole,
      },
    },
  });
});

/**
 * POST /v1/auth/logout
 * Invalidate the current session.
 */
router.post("/logout", authMiddleware, async (c) => {
  const { sessionId } = c.get("auth");
  const db = getDb(c.env.kongsian_db);
  await db.delete(sessions).where(eq(sessions.id, sessionId));
  return c.json({ ok: true });
});

/** Health sub-check for OTPs (used by the cron in Week 3). */
router.get("/otp/recent", async (c) => {
  const db = getDb(c.env.kongsian_db);
  const cutoff = Math.floor(Date.now() / 1000) - 3600;
  const recent = await db
    .select({ id: otps.id, phoneE164: otps.phoneE164, purpose: otps.purpose, createdAt: otps.createdAt })
    .from(otps)
    .where(gte(otps.createdAt, cutoff))
    .limit(20);
  return c.json({ ok: true, data: recent });
});

export { router as auth };
