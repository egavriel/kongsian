import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { dailyClosings } from "./daily-closings";
import { skus } from "./skus";

/**
 * DAILY_CLOSING_LINE
 * Per-SKU per-closing line. One line per SKU per closing (I6).
 * sisaSistem & selisih are computed in domain code (I2, I3) — never user-input.
 */
export const dailyClosingLines = sqliteTable(
  "daily_closing_lines",
  {
    id: text("id").primaryKey(),
    dailyClosingId: text("daily_closing_id")
      .notNull()
      .references(() => dailyClosings.id, { onDelete: "cascade" }),
    skuId: text("sku_id")
      .notNull()
      .references(() => skus.id),
    terjual: integer("terjual").notNull(),
    sisaFisik: integer("sisa_fisik").notNull(),
    sisaSistem: integer("sisa_sistem").notNull(),
    selisih: integer("selisih").notNull(),
    disputeId: text("dispute_id"),
  },
  (t) => ({
    uniqClosingSku: uniqueIndex("uniq_closing_sku").on(t.dailyClosingId, t.skuId),
    idxSku: index("idx_dcl_sku").on(t.skuId),
  })
);

export type DailyClosingLine = typeof dailyClosingLines.$inferSelect;
export type NewDailyClosingLine = typeof dailyClosingLines.$inferInsert;
