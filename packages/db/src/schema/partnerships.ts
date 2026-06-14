import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { brands } from "./brands";
import { tenants } from "./tenants";

/**
 * PARTNERSHIP
 * The contract: brand X sells at tenant Y with revenue split in bps (I1: brand+tenant=10000).
 * (brand_id, tenant_id) unique — only one active partnership per pair.
 */
export const partnerships = sqliteTable(
  "partnerships",
  {
    id: text("id").primaryKey(),
    brandId: text("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    revenueSplitBrandBps: integer("revenue_split_brand_bps").notNull().default(7000),
    revenueSplitTenantBps: integer("revenue_split_tenant_bps").notNull().default(3000),
    status: text("status", { enum: ["PENDING", "ACTIVE", "SUSPENDED", "ENDED"] })
      .notNull()
      .default("PENDING"),
    settlementStartDay: text("settlement_start_day").notNull().default("SUNDAY"),
    settlementEndDay: text("settlement_end_day").notNull().default("SATURDAY"),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(unixepoch())`),
    activatedAt: integer("activated_at"),
  },
  (t) => ({
    uniqBrandTenant: uniqueIndex("uniq_brand_tenant").on(t.brandId, t.tenantId),
    idxStatus: index("idx_partnership_status").on(t.status),
    idxTenant: index("idx_partnership_tenant").on(t.tenantId),
  })
);

export type Partnership = typeof partnerships.$inferSelect;
export type NewPartnership = typeof partnerships.$inferInsert;
