import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";

/**
 * OTP_RATE_LIMIT
 * Per-phone, per-hour-bucket counter for OTP request throttling.
 * P0 audit fix #1 — max 5 OTP requests per phone per hour.
 *
 * hourBucket is "YYYY-MM-DDTHH" in UTC; row is upserted (count + 1) atomically
 * by apps/api. D1 counter pattern — survives Worker eviction, single source of truth.
 *
 * TTL pruning: rows older than 24h can be GC'd by a cron (Week 3+); the read
 * query only counts rows where hourBucket >= now-1h so stale rows are naturally
 * ignored even before pruning.
 */
export const otpRateLimits = sqliteTable(
  "otp_rate_limits",
  {
    id: text("id").primaryKey(),
    phoneE164: text("phone_e164").notNull(),
    hourBucket: text("hour_bucket").notNull(), // 'YYYY-MM-DDTHH' UTC
    count: integer("count").notNull().default(0),
    firstRequestAt: integer("first_request_at")
      .notNull()
      .default(0),
    lastRequestAt: integer("last_request_at")
      .notNull()
      .default(0),
  },
  (t) => ({
    uniqPhoneBucket: uniqueIndex("uniq_otp_rate").on(t.phoneE164, t.hourBucket),
    idxPhone: index("idx_otp_rate_phone").on(t.phoneE164),
    idxBucket: index("idx_otp_rate_bucket").on(t.hourBucket),
  })
);

export type OtpRateLimit = typeof otpRateLimits.$inferSelect;
export type NewOtpRateLimit = typeof otpRateLimits.$inferInsert;
