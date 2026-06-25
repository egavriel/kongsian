import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { partnerships } from "./partnerships";
import { users } from "./users";

/**
 * DAILY_CLOSING
 * One per (partnership, date) (unique). status: OPEN → SUBMITTED → REVISED (one
 * or more times) → LOCKED (terminal, when settlement for that week is PAID).
 * Submitted_at null until SUBMITTED. After SUBMITTED, only ADJUSTMENT rows are
 * allowed for that (partnership, date) (I9) — but a /revise endpoint can create
 * compensating TERJUAL_CORRECTION movements and flip status to REVISED.
 */
export const dailyClosings = sqliteTable(
  "daily_closings",
  {
    id: text("id").primaryKey(),
    partnershipId: text("partnership_id")
      .notNull()
      .references(() => partnerships.id),
    closingDate: text("closing_date").notNull(),
    status: text("status", { enum: ["OPEN", "SUBMITTED", "LOCKED", "REVISED"] })
      .notNull()
      .default("OPEN"),
    submittedByUserId: text("submitted_by_user_id").references(() => users.id),
    submittedAt: integer("submitted_at"),
    notes: text("notes"),
    lockedAt: integer("locked_at"),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    uniqPartnershipDate: uniqueIndex("uniq_closing_pd").on(t.partnershipId, t.closingDate),
    idxStatus: index("idx_dc_status").on(t.status),
    idxPartnershipStatus: index("idx_dc_partnership_status").on(t.partnershipId, t.status),
  })
);

export type DailyClosing = typeof dailyClosings.$inferSelect;
export type NewDailyClosing = typeof dailyClosings.$inferInsert;
