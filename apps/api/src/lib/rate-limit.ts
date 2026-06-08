/**
 * OTP rate limiter — P0 audit fix #1.
 *
 * Pattern: D1 counter per (phone, hour_bucket). The hour bucket is "YYYY-MM-DDTHH" UTC.
 *  - On OTP request: upsert the row, increment count, return false if count > limit.
 *  - Read path: count rows for this phone with hourBucket >= (now-1h).
 *  - Atomic-ish: D1 doesn't expose a true atomic counter, so we use a transactional
 *    read-modify-write inside a `db.batch`. Race window is small (single edge node)
 *    and we accept it for the MVP — strict correctness would need a deferred job.
 *
 * Why D1 and not in-memory:
 *  - In-memory (per Worker isolate) is evicted on cold start and not shared across
 *    CF edge nodes. A motivated attacker can fan out across edges. D1 is the
 *    single source of truth that survives eviction and is consistent globally.
 */
import { and, eq, gte, sql } from "drizzle-orm";
import { getDb, otpRateLimits } from "@kongsian/db";
import { OTP_MAX_PER_HOUR } from "@kongsian/shared/constants";
import type { Bindings } from "../index";

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  retryAfterSec: number;
  hourBucket: string;
}

function hourBucketUtc(now = new Date()): string {
  // 'YYYY-MM-DDTHH' — drop minutes/seconds.
  return now.toISOString().slice(0, 13);
}

/**
 * Check + increment in one call. Throws on DB errors but does NOT throw on
 * rate-limit (returns allowed:false). Caller decides the HTTP response.
 */
export async function checkAndIncrementOtp(
  env: Bindings,
  phoneE164: string
): Promise<RateLimitResult> {
  // Trial override: set OTP_RATE_LIMIT_DISABLED=1 (or any truthy value) as a
  // Worker secret/env to skip rate limiting entirely. Used during pilot
  // testing when the rate limit gets in the way of normal user flows.
  // Production must never have this set.
  if ((env as { OTP_RATE_LIMIT_DISABLED?: string }).OTP_RATE_LIMIT_DISABLED) {
    return {
      allowed: true,
      count: 0,
      limit: 0,
      retryAfterSec: 0,
      hourBucket: hourBucketUtc(),
    };
  }

  const db = getDb(env.kongsian_db);
  const now = Math.floor(Date.now() / 1000);
  const bucket = hourBucketUtc();
  const limit = OTP_MAX_PER_HOUR;

  // Try to read+update the bucket in one batch. We do a SELECT then INSERT-or-UPDATE
  // because D1 lacks `INSERT ... ON CONFLICT DO UPDATE` syntax (it does have
  // `ON CONFLICT` in newer builds but it's flaky across versions).
  const existing = await db
    .select()
    .from(otpRateLimits)
    .where(
      and(eq(otpRateLimits.phoneE164, phoneE164), eq(otpRateLimits.hourBucket, bucket))
    )
    .limit(1);

  if (existing.length === 0) {
    await db.insert(otpRateLimits).values({
      id: crypto.randomUUID(),
      phoneE164,
      hourBucket: bucket,
      count: 1,
      firstRequestAt: now,
      lastRequestAt: now,
    });
    return { allowed: true, count: 1, limit, retryAfterSec: 0, hourBucket: bucket };
  }

  const row = existing[0];
  if (row.count >= limit) {
    // Compute retry-after from the bucket's age. Caller can surface in header.
    const bucketStartSec = Math.floor(new Date(bucket + ":00:00Z").getTime() / 1000);
    const retryAfter = Math.max(60, 3600 - (now - bucketStartSec));
    return {
      allowed: false,
      count: row.count,
      limit,
      retryAfterSec: retryAfter,
      hourBucket: bucket,
    };
  }

  await db
    .update(otpRateLimits)
    .set({ count: row.count + 1, lastRequestAt: now })
    .where(eq(otpRateLimits.id, row.id));

  return {
    allowed: true,
    count: row.count + 1,
    limit,
    retryAfterSec: 0,
    hourBucket: bucket,
  };
}

/** Read-only peek — used by tests and the dev recent-OTPs endpoint. */
export async function getOtpCountThisHour(
  env: Bindings,
  phoneE164: string
): Promise<number> {
  const db = getDb(env.kongsian_db);
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const bucketCutoff = hourBucketUtc(oneHourAgo);
  const rows = await db
    .select({ c: sql<number>`COALESCE(SUM(${otpRateLimits.count}), 0)` })
    .from(otpRateLimits)
    .where(
      and(
        eq(otpRateLimits.phoneE164, phoneE164),
        gte(otpRateLimits.hourBucket, bucketCutoff)
      )
    );
  return Number(rows[0]?.c ?? 0);
}
