import { Hono } from "hono";
import { eq, and, desc, gte } from "drizzle-orm";
import { getDb, otps, sessions, users, auditLog } from "@kongsian/db";
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
import { checkAndIncrementOtp, getOtpCountThisHour } from "../lib/rate-limit";
import { sendWa } from "../lib/wa-gateway";


const router = new Hono<{ Bindings: Bindings; Variables: { auth: AuthContext } }>();

/** Format the OTP message sent over WhatsApp. Bahasa Indonesia, friendly. */
function buildOtpMessage(code: string, ttlSeconds: number, purpose: string): string {
  const ttlMin = Math.round(ttlSeconds / 60);
  const purposeText =
    purpose === "INVITE"
      ? "untuk undangan partner Kongsian"
      : purpose === "RESET"
      ? "untuk reset akun Kongsian"
      : "untuk login Kongsian";
  return (
    `*[Kongsian]*\n\n` +
    `Kode OTP kamu ${purposeText}:\n\n` +
    `*${code}*\n\n` +
    `Berlaku ${ttlMin} menit. Jangan berikan kode ini ke siapa pun — termasuk tim Kongsian.`
  );
}

/**
 * POST /v1/auth/otp/request
 * Generate a 6-digit OTP, store its hash, send via WhatsApp (or return devCode
 * in stub mode).
 * P0 #1: rate-limited to 5/hour/phone via otp_rate_limits D1 counter.
 *
 * WA delivery: when WA_PROVIDER_URL is set, we send synchronously in this
 * request and mark wa_sent=1. The plaintext code is in memory at this point
 * (we just generated it, haven't hashed yet), so we can include it in the WA
 * payload. If WA fails, we return success anyway — the user can retry, and
 * we still return devCode as a fallback (the only practical alternative for
 * a User stuck without WA delivery would be a 500, which is worse UX).
 *
 * In stub mode (no WA configured, ENV=development): we return devCode in the
 * response so the developer can test without a real WA client. In production
 * with no WA configured, we log a warning and return devCode as well — this
 * is intentional for the trial period before a real WA provider is wired.
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

  // Rate limit check + increment.
  const rl = await checkAndIncrementOtp(c.env, phone);
  if (!rl.allowed) {
    c.header("Retry-After", String(rl.retryAfterSec));
    c.header("X-RateLimit-Limit", String(rl.limit));
    c.header("X-RateLimit-Remaining", "0");
    return c.json(
      {
        ok: false,
        error: {
          code: "OTP_RATE_LIMITED",
          message: `Max ${rl.limit} OTP requests per hour. Try again in ${Math.ceil(
            rl.retryAfterSec / 60
          )} minutes.`,
        },
      },
      429
    );
  }
  c.header("X-RateLimit-Limit", String(rl.limit));
  c.header("X-RateLimit-Remaining", String(Math.max(0, rl.limit - rl.count)));

  const db = getDb(c.env.kongsian_db);

  const code = generateOtpCode();
  const codeHash = await hashOtpCode(code, c.env.OTP_HMAC_KEY);
  const now = Math.floor(Date.now() / 1000);
  const ttl = parseInt(c.env.OTP_TTL_SECONDS || String(OTP_TTL_SECONDS), 10);
  const expiresAt = now + ttl;
  const otpId = crypto.randomUUID();

  await db.insert(otps).values({
    id: otpId,
    phoneE164: phone,
    codeHash,
    expiresAt,
    attempts: 0,
    purpose,
    waSent: 0,
    createdAt: now,
  });

  // ---- WhatsApp delivery (synchronous) ----
  // Stub mode = no WA_PROVIDER_URL configured → treat as dev; include devCode in response.
  // Real mode = WA configured → send via the relay; do NOT include devCode.
  const waConfigured = Boolean(c.env.WA_PROVIDER_URL);
  let waDelivered = false;
  if (waConfigured) {
    const message = buildOtpMessage(code, ttl, purpose);
    // Bridge expects a JID (`<digits>@s.whatsapp.net`), not E.164. The
    // earlier comment claimed the bridge handled the leading "+" — that was
    // wrong; jidDecode() throws on "+"-prefixed strings. Normalize here so
    // the relay can be a dumb passthrough.
    const chatId = `${phone.replace(/^\+/, "")}@s.whatsapp.net`;
    const result = await sendWa(c.env, chatId, message, { timeoutMs: 6000 });
    waDelivered = result.sent;
    if (result.sent) {
      await db.update(otps).set({ waSent: 1 }).where(eq(otps.id, otpId));
    } else {
      // WA failed — log but still return success with devCode so the user
      // isn't stuck. devCode is included in the response only when WA delivery
      // is unconfirmed; this is the same fallback as stub mode.
      // eslint-disable-next-line no-console
      console.warn(
        `[auth] WA send failed for ${phone} (purpose=${purpose}): ${result.reason}. ` +
          `Falling back to devCode in response.`
      );
    }
  }

  // Audit: OTP sent.
  // (We skip the audit row for OTP_SENT until a 'system' user exists. Week 3
  // will introduce a real SYSTEM actor and backfill. The otps row + rate limit
  // counter is the canonical record of the send itself.)

  return c.json({
    ok: true,
    data: {
      phone,
      purpose,
      expiresAt,
      // devCode is only returned when WA delivery is unconfirmed:
      //   - stub mode (no WA configured), OR
      //   - WA configured but the call failed
      // In successful real-WA delivery, devCode is NEVER returned.
      ...(waDelivered ? {} : { devCode: code }),
    },
  });
});

/**
 * POST /v1/auth/otp/verify
 * Check code, create or fetch user, mint a session token.
 * P0 #1: also rate-limited at the verify side (anti-bruteforce) — separate
 *   counter not needed because we already enforce max 5 attempts/OTP row.
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

  // Belt-and-braces: also rate-limit verifies so an attacker can't drain attempts
  // faster than the OTP TTL window without triggering the request-counter.
  // 20 verifies/hour is plenty for a human + retries, blocks script kiddies.
  const verifyRl = await checkAndIncrementOtp(c.env, `${phone}:verify` as unknown as string).catch(() => null);
  if (verifyRl && !verifyRl.allowed) {
    c.header("Retry-After", String(verifyRl.retryAfterSec));
    return c.json(
      {
        ok: false,
        error: {
          code: "VERIFY_RATE_LIMITED",
          message: "Too many verify attempts. Slow down.",
        },
      },
      429
    );
  }

  const db = getDb(c.env.kongsian_db);

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
  let isNewUser = false;
  if (!user) {
    // First-time registration: name + role are required.
    const newName = parsed.data.name?.trim();
    const newRole = parsed.data.role;
    if (!newName || !newRole) {
      return c.json(
        {
          ok: false,
          error: {
            code: "REGISTRATION_REQUIRED",
            message:
              "First-time sign-in requires `name` (>=2 chars) and `role` (BRAND|TENANT).",
          },
        },
        400
      );
    }
    const id = crypto.randomUUID();
    await db.insert(users).values({
      id,
      phoneE164: phone,
      name: newName,
      globalRole: "USER",
      onboardingRole: newRole,
      // W6 trial: auto-verify on first sign-in. The admin gate is still in
      // place for accounts that get flagged for review (see brands.ts:95);
      // we just default new self-registrations to VERIFIED so the trial
      // user can immediately use brand/tenant features. Revisit when the
      // admin onboarding flow ships.
      verificationStatus: "VERIFIED",
      createdAt: now,
      lastLoginAt: now,
    });
    isNewUser = true;
    userRows = await db.select().from(users).where(eq(users.id, id)).limit(1);
    user = userRows[0];
  } else {
    // Existing user login: do NOT silently overwrite name or role.
    await db.update(users).set({ lastLoginAt: now }).where(eq(users.id, user.id));
  }

  // Audit: OTP verified + user.
  if (!isNewUser) {
    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      userId: user.id,
      action: "OTP_VERIFIED",
      entityType: "user",
      entityId: user.id,
      beforeJson: null,
      afterJson: null,
      ip: c.req.header("cf-connecting-ip") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
      createdAt: now,
    });
  } else {
    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      userId: user.id,
      action: "USER_CREATED",
      entityType: "user",
      entityId: user.id,
      beforeJson: null,
      afterJson: JSON.stringify({
        phone,
        name: user.name,
        onboardingRole: user.onboardingRole,
        verificationStatus: user.verificationStatus,
      }),
      ip: c.req.header("cf-connecting-ip") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
      createdAt: now,
    });
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

  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    userId: user.id,
    action: "LOGIN_SUCCESS",
    entityType: "session",
    entityId: sessionId,
    beforeJson: null,
    afterJson: null,
    ip: c.req.header("cf-connecting-ip") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    createdAt: now,
  });

  return c.json({
    ok: true,
    data: {
      sessionToken,
      sessionId,
      expiresAt: now + ttl,
      isNewUser,
      user: {
        id: user.id,
        phoneE164: user.phoneE164,
        name: user.name,
        globalRole: user.globalRole,
        onboardingRole: user.onboardingRole,
        verificationStatus: user.verificationStatus,
      },
    },
  });
});

/**
 * POST /v1/auth/logout
 * Invalidate the current session. P0 #2 fix: verify the delete actually
 * happened — if no rows are affected, surface an error so we don't silently
 * leak "logged out but session still valid" cases.
 */
router.post("/logout", authMiddleware, async (c) => {
  const { sessionId, userId } = c.get("auth");
  const db = getDb(c.env.kongsian_db);
  const now = Math.floor(Date.now() / 1000);

  // Use a delete returning the row count. Drizzle doesn't expose .returning
  // for deletes uniformly, so we do a SELECT first to capture the row for audit.
  const before = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (before.length === 0) {
    // Already gone — idempotent logout.
    return c.json({ ok: true, data: { alreadyDeleted: true } });
  }

  await db.delete(sessions).where(eq(sessions.id, sessionId));

  // Verify (P0 #2): re-select to confirm. If anything weird happened, this
  // would still find the row.
  const after = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (after.length > 0) {
    return c.json(
      {
        ok: false,
        error: {
          code: "LOGOUT_FAILED",
          message: "Session row was not deleted. Please retry.",
        },
      },
      500
    );
  }

  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    userId,
    action: "LOGOUT",
    entityType: "session",
    entityId: sessionId,
    beforeJson: JSON.stringify(before[0]),
    afterJson: null,
    ip: c.req.header("cf-connecting-ip") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    createdAt: now,
  });

  return c.json({ ok: true, data: { sessionId } });
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

/** Test helper: how many OTP requests this phone has used in the last hour? */
router.get("/otp/rate-limit/:phone", async (c) => {
  const phone = c.req.param("phone");
  const count = await getOtpCountThisHour(c.env, phone);
  return c.json({ ok: true, data: { phone, count, limit: 5 } });
});

export { router as auth };
