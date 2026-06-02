import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * USERS
 * Single user table, role derived from brands/tenants at request time (I10).
 * Phone in E.164 format, unique. globalRole only for platform admins.
 *
 * verification_status: admin-gate for onboarding.
 *   - PENDING_VERIFICATION  → just registered, awaiting admin approval
 *   - VERIFIED              → approved, can use the dashboard
 *   - REJECTED              → admin rejected
 *
 * onboarding_role: the role chosen at register time (BRAND or TENANT).
 *   Stored on first registration; subsequent OTP verifies (login) do NOT update it.
 */
export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    phoneE164: text("phone_e164").notNull().unique(),
    name: text("name").notNull(),
    globalRole: text("global_role", { enum: ["USER", "PLATFORM_ADMIN"] })
      .notNull()
      .default("USER"),
    onboardingRole: text("onboarding_role", { enum: ["BRAND", "TENANT"] }),
    verificationStatus: text("verification_status", {
      enum: ["PENDING_VERIFICATION", "VERIFIED", "REJECTED"],
    })
      .notNull()
      .default("PENDING_VERIFICATION"),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch())`),
    lastLoginAt: integer("last_login_at"),
  },
  (t) => ({
    idxPhone: uniqueIndex("idx_users_phone").on(t.phoneE164),
    idxVerification: index("idx_users_verification").on(t.verificationStatus),
  })
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
