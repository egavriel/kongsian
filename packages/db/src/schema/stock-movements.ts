import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { partnerships } from "./partnerships";
import { skus } from "./skus";
import { users } from "./users";

/**
 * STOCK_MOVEMENT
 * The atomic Titip / Tarik / Terjual / Adjustment ledger.
 * qty is signed. idempotency_key unique per request (I5).
 * Index (partnership_id, sku_id, movement_date) covers the most common read
 * (today's stock per partnership per SKU).
 */
export const stockMovements = sqliteTable(
  "stock_movements",
  {
    id: text("id").primaryKey(),
    partnershipId: text("partnership_id")
      .notNull()
      .references(() => partnerships.id),
    skuId: text("sku_id")
      .notNull()
      .references(() => skus.id),
    movementDate: text("movement_date").notNull(), // 'YYYY-MM-DD' WIB
    kind: text("kind", {
      enum: ["TITIP", "TARIK", "TERJUAL_OPENING", "TERJUAL_CORRECTION", "ADJUSTMENT"],
    }).notNull(),
    qty: integer("qty").notNull(),
    reason: text("reason"),
    submittedByUserId: text("submitted_by_user_id")
      .notNull()
      .references(() => users.id),
    correctsMovementId: text("corrects_movement_id"),
    submittedAt: integer("submitted_at")
      .notNull()
      .default(sql`(unixepoch())`),
    idempotencyKey: text("idempotency_key").notNull().unique(),
  },
  (t) => ({
    idxPartnershipSkuDate: index("idx_mov_psd").on(t.partnershipId, t.skuId, t.movementDate),
    idxDate: index("idx_mov_date").on(t.movementDate),
  })
);

export type StockMovement = typeof stockMovements.$inferSelect;
export type NewStockMovement = typeof stockMovements.$inferInsert;
