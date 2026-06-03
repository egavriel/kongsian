import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { dailyClosings } from "./daily-closings";
import { users } from "./users";

/**
 * CLOSING_PHOTO
 * Multiple photos per closing (chiller + display + receipt).
 * Closing photo is WAJIB per plan — enforced at submit time.
 */
export const closingPhotos = sqliteTable(
  "closing_photos",
  {
    id: text("id").primaryKey(),
    dailyClosingId: text("daily_closing_id")
      .notNull()
      .references(() => dailyClosings.id, { onDelete: "cascade" }),
    r2Key: text("r2_key").notNull(),
    uploadedByUserId: text("uploaded_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    idxClosing: index("idx_cp_closing").on(t.dailyClosingId),
  })
);

export type ClosingPhoto = typeof closingPhotos.$inferSelect;
export type NewClosingPhoto = typeof closingPhotos.$inferInsert;
