import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { brands } from "./brands";
import { users } from "./users";

/**
 * SKU
 * Stock-Keeping Unit, defined per brand. Money in IDR integer.
 * (brand_id, code) unique — same letter code reusable across brands.
 */
export const skus = sqliteTable(
  "skus",
  {
    id: text("id").primaryKey(),
    brandId: text("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    priceIdr: integer("price_idr").notNull(),
    costIdr: integer("cost_idr"),
    /** Shelf life in days. Required for Indonesian F&B titipan workflows. */
    masaSimpanHari: integer("masa_simpan_hari").notNull().default(7),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    imageB64: text("image_b64"),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    uniqBrandCode: uniqueIndex("uniq_brand_code").on(t.brandId, t.code),
    idxBrand: index("idx_skus_brand").on(t.brandId),
  })
);

export type Sku = typeof skus.$inferSelect;
export type NewSku = typeof skus.$inferInsert;
