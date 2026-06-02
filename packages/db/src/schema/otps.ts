import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * OTP
 * One-time code, bcrypt/argon2 hashed. Max 5 attempts. expires_at in unix seconds.
 * purpose: LOGIN (user signs in) or INVITE (tenant PIC onboarding).
 * Index on (phone_e164, purpose) for fast lookup of most-recent valid code.
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
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    idxPhonePurpose: index("idx_otp_pp").on(t.phoneE164, t.purpose),
    idxExpires: index("idx_otp_expires").on(t.expiresAt),
  })
);

export type Otp = typeof otps.$inferSelect;
export type NewOtp = typeof otps.$inferInsert;
