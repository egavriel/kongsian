import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * TENANTS (cafes)
 * picPhoneE164 is the primary PIC's phone, used for invite.
 * Note: no FK to users — PIC is invited by phone, not yet a user.
 */
export const tenants = sqliteTable(
  "tenants",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    address: text("address"),
    picPhoneE164: text("pic_phone_e164").notNull(),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    uniqSlug: uniqueIndex("uniq_tenants_slug").on(t.slug),
    idxPicPhone: index("idx_tenants_pic").on(t.picPhoneE164),
  })
);

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
