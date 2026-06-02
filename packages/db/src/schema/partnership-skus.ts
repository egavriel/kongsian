import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { partnerships } from "./partnerships";
import { skus } from "./skus";
import { users } from "./users";

/**
 * PARTNERSHIP_SKU
 * Which SKUs are offered at which partnership, with optional price override (I8).
 * (partnership_id, sku_id) unique.
 */
export const partnershipSkus = sqliteTable(
  "partnership_skus",
  {
    id: text("id").primaryKey(),
    partnershipId: text("partnership_id")
      .notNull()
      .references(() => partnerships.id, { onDelete: "cascade" }),
    skuId: text("sku_id")
      .notNull()
      .references(() => skus.id, { onDelete: "cascade" }),
    priceOverrideIdr: integer("price_override_idr"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    priceChangedAt: integer("price_changed_at"),
    priceChangedByUserId: text("price_changed_by_user_id").references(() => users.id),
  },
  (t) => ({
    uniqPartnershipSku: uniqueIndex("uniq_partnership_sku").on(t.partnershipId, t.skuId),
    idxSku: index("idx_ps_sku").on(t.skuId),
  })
);

export type PartnershipSku = typeof partnershipSkus.$inferSelect;
export type NewPartnershipSku = typeof partnershipSkus.$inferInsert;
