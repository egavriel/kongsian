import type { DbClient } from "@kongsian/db";
import { stockMovements } from "@kongsian/db";
import { and, eq, lte, sum } from "drizzle-orm";

/** SUM(signed qty) over (partnership, sku) up to and including upTo (YYYY-MM-DD). */
export async function computeSisaSistem(
  db: DbClient,
  partnershipId: string,
  skuId: string,
  upTo: string
): Promise<number> {
  const [row] = await db
    .select({ total: sum(stockMovements.qty) })
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.partnershipId, partnershipId),
        eq(stockMovements.skuId, skuId),
        lte(stockMovements.movementDate, upTo)
      )
    );
  return Number(row?.total ?? 0);
}

/** Batch version — one query for all SKUs in a partnership. Returns skuId → sisaSistem. */
export async function computeSisaSistemBatch(
  db: DbClient,
  partnershipId: string,
  upTo: string
): Promise<Map<string, number>> {
  const rows = await db
    .select({ skuId: stockMovements.skuId, total: sum(stockMovements.qty) })
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.partnershipId, partnershipId),
        lte(stockMovements.movementDate, upTo)
      )
    )
    .groupBy(stockMovements.skuId);

  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.skuId, Number(row.total ?? 0));
  }
  return map;
}
