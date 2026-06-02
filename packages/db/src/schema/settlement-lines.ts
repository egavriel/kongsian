import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { settlements } from "./settlements";
import { skus } from "./skus";

/**
 * SETTLEMENT_LINE
 * Per-SKU lines in a settlement, omzet_idr = qty * effective_price.
 */
export const settlementLines = sqliteTable(
  "settlement_lines",
  {
    id: text("id").primaryKey(),
    settlementId: text("settlement_id")
      .notNull()
      .references(() => settlements.id, { onDelete: "cascade" }),
    skuId: text("sku_id")
      .notNull()
      .references(() => skus.id),
    qtyTerjual: integer("qty_terjual").notNull(),
    omzetIdr: integer("omzet_idr").notNull(),
  },
  (t) => ({
    idxSettlement: index("idx_sl_settlement").on(t.settlementId),
    idxSku: index("idx_sl_sku").on(t.skuId),
  })
);

export type SettlementLine = typeof settlementLines.$inferSelect;
export type NewSettlementLine = typeof settlementLines.$inferInsert;
