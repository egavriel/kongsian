import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { partnerships } from "./partnerships";
import { dailyClosingLines } from "./daily-closing-lines";
import { users } from "./users";

/**
 * DISPUTE
 * A selisih that requires resolution. Linked to one daily_closing_line.
 * status: OPEN → RESOLVED_BRAND | RESOLVED_TENANT | RESOLVED_ADMIN.
 */
export const disputes = sqliteTable(
  "disputes",
  {
    id: text("id").primaryKey(),
    partnershipId: text("partnership_id")
      .notNull()
      .references(() => partnerships.id),
    dailyClosingLineId: text("daily_closing_line_id")
      .notNull()
      .references(() => dailyClosingLines.id),
    selisihQty: integer("selisih_qty").notNull(),
    status: text("status", {
      enum: ["OPEN", "RESOLVED_BRAND", "RESOLVED_TENANT", "RESOLVED_ADMIN"],
    })
      .notNull()
      .default("OPEN"),
    raisedByUserId: text("raised_by_user_id").references(() => users.id),
    openedByRole: text("opened_by_role", { enum: ["BRAND", "TENANT", "ADMIN"] }),
    reason: text("reason"),
    photoR2Key: text("photo_r2_key"),
    resolutionNotes: text("resolution_notes"),
    resolvedByUserId: text("resolved_by_user_id").references(() => users.id),
    resolvedAt: integer("resolved_at"),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    idxPartnership: index("idx_dispute_partnership").on(t.partnershipId),
    idxStatus: index("idx_dispute_status").on(t.status),
    idxClosingLine: index("idx_dispute_closing_line").on(t.dailyClosingLineId),
  })
);

export type Dispute = typeof disputes.$inferSelect;
export type NewDispute = typeof disputes.$inferInsert;
