import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { users } from "./users";

/**
 * NOTIFICATION
 * In-app notification queue (read by GET /v1/notifications, marked read
 * by POST /v1/notifications/:id/read). wa_sent=0 means not yet dispatched
 * via WhatsApp — every-minute cron scans wa_sent=0 and sends.
 *
 * entity_type/entity_id are loose FK pointers so we don't need a polymorphic
 * FK table — UI resolves them based on kind.
 */
export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind", {
      enum: [
        "CLOSING_REMINDER",
        "CLOSING_SUBMITTED",
        "DISPUTE_OPENED",
        "DISPUTE_MESSAGE",
        "DISPUTE_RESOLVED",
        "SETTLEMENT_READY",
        "SETTLEMENT_APPROVED",
        "SETTLEMENT_PAID",
        "OTP",
      ],
    }).notNull(),
    title: text("title").notNull(),
    body: text("body"),
    entityType: text("entity_type"), // 'settlement' | 'dispute' | 'daily_closing'
    entityId: text("entity_id"),
    readAt: integer("read_at"),
    waSent: integer("wa_sent").notNull().default(0),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    idxUserUnread: index("idx_notif_user_unread").on(t.userId, t.readAt),
    idxWa: index("idx_notif_wa").on(t.waSent, t.createdAt),
  })
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
