import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { disputes } from "./disputes";
import { users } from "./users";

/**
 * DISPUTE_MESSAGE
 * Chat thread per dispute. brand ↔ tenant (and admin) can post messages.
 * Author role is snapshot at write time to prevent role drift.
 */
export const disputeMessages = sqliteTable(
  "dispute_messages",
  {
    id: text("id").primaryKey(),
    disputeId: text("dispute_id")
      .notNull()
      .references(() => disputes.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id")
      .notNull()
      .references(() => users.id),
    authorRole: text("author_role", {
      enum: ["BRAND", "TENANT", "ADMIN"],
    }).notNull(),
    body: text("body").notNull(),
    photoR2Key: text("photo_r2_key"),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    idxDisputeCreated: index("idx_dm_dispute").on(t.disputeId, t.createdAt),
  })
);

export type DisputeMessage = typeof disputeMessages.$inferSelect;
export type NewDisputeMessage = typeof disputeMessages.$inferInsert;
