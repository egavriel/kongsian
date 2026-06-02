import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * OTP
 * One-time code, bcrypt/argon2 hashed. Max 5 attempts. expires_at in unix seconds.
 * purpose: LOGIN (user signs in) or INVITE (tenant PIC onboarding).
 * Index on (phone_e164, purpose) for fast lookup of most-recent valid code.
 *
 * wa_sent: cron flag. 0 = not yet pushed to WhatsApp, 1 = push attempted.
 * The /v1/auth/otp/request handler returns devCode synchronously; the
 * Workers cron (apps/api/src/cron.ts) scans wa_sent=0 rows and re-sends
 * via Meta Cloud API once WA_PHONE_ID + WA_TOKEN are configured.
 */
export const otps = sqliteTable(
  "otps",
  {
    id: text("id").primaryKey(),
    phoneE164: text("phone_e164").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: integer("expires_at").notNull(),
    attempts: integer("attempts").notNull().default(0),
    purpose: text("purpose", { enum: ["LOGIN", "INVITE"] }).notNull(),
    consumedAt: integer("consumed_at"),
    waSent: integer("wa_sent").notNull().default(0),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    idxPhonePurpose: index("idx_otp_pp").on(t.phoneE164, t.purpose),
    idxExpires: index("idx_otp_expires").on(t.expiresAt),
    idxWaSent: index("idx_otp_wa_sent").on(t.waSent, t.createdAt),
  })
);

export type Otp = typeof otps.$inferSelect;
export type NewOtp = typeof otps.$inferInsert;
