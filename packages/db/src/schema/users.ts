import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * USERS
 * Single user table, role derived from brands/tenants at request time (I10).
 * Phone in E.164 format, unique. globalRole only for platform admins.
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
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch())`),
    lastLoginAt: integer("last_login_at"),
  },
  (t) => ({
    idxPhone: uniqueIndex("idx_users_phone").on(t.phoneE164),
  })
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
