import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { partnerships } from "./partnerships";
import { users } from "./users";

/**
 * SETTLEMENT
 * Weekly settlement per partnership. week_start_date is Monday WIB (I4).
 * (partnership_id, week_start_date) unique. State machine: DRAFT → PENDING_BRAND → BRAND_APPROVED / PAID / DISPUTED (I7).
 */
export const settlements = sqliteTable(
  "settlements",
  {
    id: text("id").primaryKey(),
    partnershipId: text("partnership_id")
      .notNull()
      .references(() => partnerships.id),
    weekStartDate: text("week_start_date").notNull(),
    weekEndDate: text("week_end_date").notNull(),
    totalTerjual: integer("total_terjual").notNull(),
    totalOmzetIdr: integer("total_omzet_idr").notNull(),
    brandShareIdr: integer("brand_share_idr").notNull(),
    tenantShareIdr: integer("tenant_share_idr").notNull(),
    status: text("status", {
      enum: ["DRAFT", "PENDING_BRAND", "BRAND_APPROVED", "PAID", "DISPUTED"],
    })
      .notNull()
      .default("DRAFT"),
    approvedByUserId: text("approved_by_user_id").references(() => users.id),
    approvedAt: integer("approved_at"),
    pdfR2Key: text("pdf_r2_key"),
    generatedAt: integer("generated_at")
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    uniqPartnershipWeek: uniqueIndex("uniq_settlement_pw").on(t.partnershipId, t.weekStartDate),
    idxStatus: index("idx_settlement_status").on(t.status),
    idxWeek: index("idx_settlement_week").on(t.weekStartDate),
  })
);

export type Settlement = typeof settlements.$inferSelect;
export type NewSettlement = typeof settlements.$inferInsert;
