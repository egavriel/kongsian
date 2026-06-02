/**
 * @kongsian/db — Drizzle schema + D1 client
 *
 * Usage:
 *   import { getDb, schema } from "@kongsian/db";
 *   const db = getDb(env.KONGSIAN_DB);
 *   const brands = await db.select().from(schema.brands);
 */
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export * from "./schema";
export { schema };

/**
 * D1 binding type — matches the binding name in wrangler.toml.
 * Apps cast their env to this shape.
 */
export interface D1Env {
  kongsian_db: D1Database;
}

/**
 * Create a typed Drizzle client for D1.
 * Pass the binding from the Workers / Pages env: getDb(env.kongsian_db).
 */
export function getDb(d1: D1Database) {
  return drizzle(d1, { schema, logger: false });
}

export type DbClient = ReturnType<typeof getDb>;
