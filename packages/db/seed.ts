/**
 * Kongsian DB seed — inserts demo data using Drizzle into the local D1 SQLite file.
 *
 * What it creates:
 *   - 1 brand: "Hanniel" (owner phone configurable via KONGSIAN_SEED_BRAND_OWNER_PHONE)
 *   - 3 SKUs under Hanniel (A, B, C — Overnight Oats variants, IDR 42.000, masa simpan 3 hari)
 *   - 2 tenants: Cafe Padel (KONGSIAN_SEED_TENANT_PADEL_PHONE), Cafe Kedua
 *   - 1 ACTIVE partnership: Hanniel <-> Cafe Padel, 70/30 split (7000/3000 bps)
 *   - PartnershipSku entries linking all 3 SKUs to that partnership
 *   - 3 days of sample stock_movements:
 *       Day 1: TITIP  6×A, 5×B, 5×C
 *       Day 2: TITIP  0 ;   TERJUAL  5×A, 3×B, 3×C
 *       Day 3: TITIP  3×A, 3×B, 3×C   ;   TERJUAL  1×A
 *     All TITIP/TARIK submitted_by_user_id = Hanniel owner;
 *     All TERJUAL submitted_by_user_id = Cafe Padel PIC.
 *
 * Phone numbers:
 *   Default placeholders are clearly-fake E.164 numbers (+6280000000001, etc.)
 *   that pass the E.164 regex so the seed is always runnable. For the real
 *   pilot, override via env vars at seed time, e.g.:
 *     KONGSIAN_SEED_BRAND_OWNER_PHONE=+628123456789 \
 *     KONGSIAN_SEED_TENANT_PADEL_PHONE=+628123456790 \
 *     KONGSIAN_SEED_TENANT_KEDUA_PHONE=+628123456791 \
 *     pnpm --filter @kongsian/db seed
 *   Env values are validated against /^\+[1-9]\d{7,14}$/; bad values throw
 *   with a clear message rather than silently writing garbage to D1.
 *
 * Idempotency:
 *   - All inserts use .onConflictDoNothing() against the unique indexes
 *     (phone_e164, slug, (brand_id,code), (brand_id,tenant_id),
 *      (partnership_id,sku_id), idempotency_key).
 *   - Re-running the script is safe; rows are re-used by natural key.
 *
 * Why better-sqlite3?
 *   The local D1 in dev is just a SQLite file (miniflare uses better-sqlite3 under
 *   the hood). Drizzle's `drizzle-orm/better-sqlite3` driver lets us run the same
 *   `db.insert(table).values(...)` API we'd use in the Worker, but in a plain
 *   Node process invoked by tsx. For production (remote D1), the same Drizzle
 *   query objects can be passed through `drizzle-orm/d1` — schema/types unchanged.
 *
 * DB path discovery (in order):
 *   1. $KONGSIAN_D1_LOCAL_PATH env var (explicit override)
 *   2. <repo>/apps/web/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite
 *      (auto-detect; miniflare writes one file per binding)
 *   3. $CWD/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite
 *
 * Run:
 *   pnpm --filter @kongsian/db seed            # local D1 (default)
 *   pnpm --filter @kongsian/db seed:remote     # remote D1 (uses wrangler d1 execute)
 *   pnpm db:seed                               # via root
 */
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
// We import from `better-sqlite3` for the same reason the existing `getDb()` lives in
// `src/index.ts`: Drizzle's `drizzle-orm/better-sqlite3` is the only driver that works
// in a plain Node process (the `d1` driver needs a Workers context). The local D1
// file is just SQLite, so this is functionally equivalent to `drizzle(env.kongsian_db)`
// in production — same Drizzle API, same table types.
import { drizzle } from "drizzle-orm/better-sqlite3";

import {
  brands,
  partnershipSkus,
  partnerships,
  skus,
  stockMovements,
  tenantMemberships,
  tenants,
  users,
} from "./src/schema";
import * as schemaBundle from "./src/schema";

// ---------- Config ----------
// Phone numbers default to clearly-marked E.164 placeholders. Override via
// env vars at seed time for the real pilot (e.g. KONGSIAN_SEED_BRAND_OWNER_PHONE=+628xxxxxxxxxx).
// All values are validated against the E.164 regex /^\+[1-9][\d*]{7,14}$/ at use.
// (Accepts `*` placeholders for historical seeder compat — see packages/shared/src/constants.ts.)
const E164_RE = /^\+[1-9][\d*]{7,14}$/;
function reqEnv(name: string, fallback: string): string {
  const v = process.env[name]?.trim();
  if (v) {
    if (!E164_RE.test(v)) {
      throw new Error(`${name}="${v}" is not valid E.164 (expected /^\\+[1-9]\\d{7,14}$/)`);
    }
    return v;
  }
  if (!E164_RE.test(fallback)) {
    throw new Error(`Default for ${name} ("${fallback}") is not valid E.164 — fix the seed file.`);
  }
  return fallback;
}
const BRAND_OWNER = {
  phone: reqEnv("KONGSIAN_SEED_BRAND_OWNER_PHONE", "+6280000000001"),
  name: process.env.KONGSIAN_SEED_BRAND_OWNER_NAME?.trim() || "Hanniel Owner",
};
const BRAND = {
  name: "Hanniel",
  slug: "hanniel",
  description:
    "Hanniel — overnight oats artisan khas Hanniel. Dibuat fresh setiap hari, bahan premium.",
};

const SKUS: Array<{
  code: string;
  name: string;
  price: number;
  /** Shelf life in days. The "2-4°C" detail is operational (not stored). */
  masaSimpanHari: number;
}> = [
  { code: "A", name: "Double Choco Overnight Oats", price: 42000, masaSimpanHari: 3 },
  { code: "B", name: "Strawberry Overnight Oats",   price: 42000, masaSimpanHari: 3 },
  { code: "C", name: "Tiramisu Overnight Oats",     price: 42000, masaSimpanHari: 3 },
];

const TENANTS: Array<{ name: string; slug: string; phone: string; address: string }> = [
  { name: "Cafe Padel", slug: "cafe-padel", phone: reqEnv("KONGSIAN_SEED_TENANT_PADEL_PHONE", "+6280000000002"), address: "Batam Padel Club" },
  { name: "Cafe Kedua", slug: "cafe-kedua", phone: reqEnv("KONGSIAN_SEED_TENANT_KEDUA_PHONE", "+6280000000003"), address: "Batam Center"     },
];

const PARTNERSHIP = {
  brandSlug: BRAND.slug,
  tenantSlug: "cafe-padel",
  splitBrandBps: 7000,
  splitTenantBps: 3000,
  status: "ACTIVE" as const,
};

// ---------- DB path discovery ----------
function findLocalD1Path(): string {
  if (process.env.KONGSIAN_D1_LOCAL_PATH) {
    const p = resolve(process.env.KONGSIAN_D1_LOCAL_PATH);
    if (!existsSync(p)) throw new Error(`KONGSIAN_D1_LOCAL_PATH not found: ${p}`);
    return p;
  }
  // The script lives at packages/db/seed.ts; repo root is one level up.
  // Walk up to find a workspace that contains apps/web/.wrangler/...
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  let probe: string | null = null;
  for (let i = 0; i < 6; i++) {
    const candidate = join(scriptDir, "..".repeat(i), "apps/web/.wrangler/state/v3/d1/miniflare-D1DatabaseObject");
    if (existsSync(candidate)) { probe = candidate; break; }
  }
  // Fallback: check the current working directory too.
  const candidates = [probe, resolve(process.cwd(), "apps/web/.wrangler/state/v3/d1/miniflare-D1DatabaseObject")]
    .filter((d): d is string => Boolean(d));
  for (const dir of candidates) {
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir).filter((f) => f.endsWith(".sqlite"));
    if (files.length === 0) continue;
    // miniflare writes a separate file per binding; pick the first .sqlite
    return join(dir, files[0]);
  }
  throw new Error(
    "Could not auto-detect local D1 SQLite. Run `pnpm dev:web` once to create it, " +
      "or set KONGSIAN_D1_LOCAL_PATH to the .sqlite file path."
  );
}

function assertSchema(sqlite: Database.Database) {
  const required = [
    "users", "brands", "tenants", "tenant_memberships", "skus",
    "partnerships", "partnership_skus", "stock_movements",
  ];
  const rows = sqlite
    .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
    .all() as Array<{ name: string }>;
  const have = new Set(rows.map((r) => r.name));
  const missing = required.filter((t) => !have.has(t));
  if (missing.length > 0) {
    throw new Error(
      `Local D1 is missing required tables: ${missing.join(", ")}.\n` +
        `Run migrations first: pnpm --filter @kongsian/db migrate:apply:local`
    );
  }
}

// ---------- Date helpers ----------
function dateOffset(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function noonEpoch(daysAgo: number): number {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(7, 0, 0, 0); // ~14:00 WIB; deterministic seed
  return Math.floor(d.getTime() / 1000);
}

// ---------- Row counters ----------
type Counters = Record<string, number>;
function inc(c: Counters, key: string) {
  c[key] = (c[key] ?? 0) + 1;
}

// ---------- Main ----------
async function main() {
  const remote = process.argv.includes("--remote");
  if (remote) {
    console.error(
      "[seed] --remote mode: this script targets the local SQLite for now.\n" +
        "       For remote D1, run the generated SQL via:\n" +
        "         pnpm --filter @kongsian/db db:generate-sql | wrangler d1 execute kongsian-db-apac --remote --file=-"
    );
    process.exit(1);
  }

  const dbPath = findLocalD1Path();
  console.log(`[seed] D1 path: ${dbPath}`);

  const sqlite = new Database(dbPath);
  // Ensure FK constraints are honored (better-sqlite3 default is ON for new connections,
  // but local D1 files sometimes set it OFF — make it explicit).
  sqlite.pragma("foreign_keys = ON");
  assertSchema(sqlite);

  // pnpm hoists two structurally identical copies of drizzle-orm into the workspace
  // (one for the workers-types peer, one for the better-sqlite3 peer). The runtime
  // objects are interchangeable, but TS sees them as nominally distinct, so we cast
  // the schema bundle to any for the drizzle() factory call. All subsequent
  // `db.insert(<table>).values(...)` calls use the typed table imports.
  const db = drizzle(sqlite, { schema: schemaBundle as any });
  const counters: Counters = {};

  // ---- 1. Users (brand owner + 2 PICs) ----
  const userIds = {
    owner: randomUUID(),
    picPadel: randomUUID(),
    picKedua: randomUUID(),
  };
  const userRows = [
    { id: userIds.owner,    phoneE164: BRAND_OWNER.phone,    name: BRAND_OWNER.name,    globalRole: "USER" as const },
    { id: userIds.picPadel, phoneE164: TENANTS[0].phone,    name: `PIC ${TENANTS[0].name}`, globalRole: "USER" as const },
    { id: userIds.picKedua, phoneE164: TENANTS[1].phone,    name: `PIC ${TENANTS[1].name}`, globalRole: "USER" as const },
  ];
  for (const u of userRows) {
    const res = db.insert(users).values(u).onConflictDoNothing().run();
    if (res.changes > 0) inc(counters, "users");
  }

  // ---- 2. Brand ----
  const brandId = randomUUID();
  const brandRes = db
    .insert(brands)
    .values({
      id: brandId,
      userId: userIds.owner,
      name: BRAND.name,
      slug: BRAND.slug,
      description: BRAND.description,
    })
    .onConflictDoNothing()
    .run();
  if (brandRes.changes > 0) inc(counters, "brands");

  // Look up the real brand id (in case it pre-existed by slug).
  const brandRow = sqlite
    .prepare(`SELECT id FROM brands WHERE slug = ?`)
    .get(BRAND.slug) as { id: string } | undefined;
  const realBrandId = brandRow?.id ?? brandId;

  // ---- 3. SKUs ----
  const skuIds: Record<string, string> = {};
  for (const s of SKUS) {
    const id = randomUUID();
    const res = db
      .insert(skus)
      .values({
        id,
        brandId: realBrandId,
        code: s.code,
        name: s.name,
        priceIdr: s.price,
        masaSimpanHari: s.masaSimpanHari,
        active: true,
      })
      .onConflictDoNothing()
      .run();
    if (res.changes > 0) inc(counters, "skus");
    // Resolve real id (may pre-exist by (brand_id, code) unique index).
    const row = sqlite
      .prepare(`SELECT id FROM skus WHERE brand_id = ? AND code = ?`)
      .get(realBrandId, s.code) as { id: string } | undefined;
    skuIds[s.code] = row?.id ?? id;
  }

  // ---- 4. Tenants ----
  const tenantIds: Record<string, string> = {};
  for (const t of TENANTS) {
    const id = randomUUID();
    const res = db
      .insert(tenants)
      .values({
        id,
        name: t.name,
        slug: t.slug,
        address: t.address,
        picPhoneE164: t.phone,
      })
      .onConflictDoNothing()
      .run();
    if (res.changes > 0) inc(counters, "tenants");
    const row = sqlite.prepare(`SELECT id FROM tenants WHERE slug = ?`).get(t.slug) as
      | { id: string }
      | undefined;
    tenantIds[t.slug] = row?.id ?? id;
  }

  // ---- 5. Tenant memberships (PIC owns their cafe) ----
  const membershipRows = [
    { tenantSlug: "cafe-padel", userId: userIds.picPadel },
    { tenantSlug: "cafe-kedua", userId: userIds.picKedua },
  ];
  for (const m of membershipRows) {
    const res = db
      .insert(tenantMemberships)
      .values({
        id: randomUUID(),
        tenantId: tenantIds[m.tenantSlug],
        userId: m.userId,
        role: "OWNER",
      })
      .onConflictDoNothing()
      .run();
    if (res.changes > 0) inc(counters, "tenant_memberships");
  }

  // ---- 6. Partnership Hanniel <-> Cafe Padel ----
  const partnershipId = randomUUID();
  const partnershipRes = db
    .insert(partnerships)
    .values({
      id: partnershipId,
      brandId: realBrandId,
      tenantId: tenantIds[PARTNERSHIP.tenantSlug],
      revenueSplitBrandBps: PARTNERSHIP.splitBrandBps,
      revenueSplitTenantBps: PARTNERSHIP.splitTenantBps,
      status: PARTNERSHIP.status,
      activatedAt: noonEpoch(2),
    })
    .onConflictDoNothing()
    .run();
  if (partnershipRes.changes > 0) inc(counters, "partnerships");
  const partRow = sqlite
    .prepare(`SELECT id FROM partnerships WHERE brand_id = ? AND tenant_id = ?`)
    .get(realBrandId, tenantIds[PARTNERSHIP.tenantSlug]) as { id: string } | undefined;
  const realPartnershipId = partRow?.id ?? partnershipId;

  // ---- 7. PartnershipSku links for all 3 SKUs ----
  for (const code of ["A", "B", "C"] as const) {
    const res = db
      .insert(partnershipSkus)
      .values({
        id: randomUUID(),
        partnershipId: realPartnershipId,
        skuId: skuIds[code],
        // price_override_idr left NULL → partnership uses the SKU's default price (42000).
        active: true,
      })
      .onConflictDoNothing()
      .run();
    if (res.changes > 0) inc(counters, "partnership_skus");
  }

  // ---- 8. Stock movements (3 days) ----
  type Mov = {
    date: string;       // YYYY-MM-DD
    code: "A" | "B" | "C";
    kind: "TITIP" | "TERJUAL_OPENING";
    qty: number;
    idem: string;
    submittedBy: string;
    submittedAt: number;
  };

  // Day 1: TITIP only — 6A, 5B, 5C  (owner submits)
  // Day 2: 0 titip, TERJUAL 5A, 3B, 3C  (PIC submits)
  // Day 3: TITIP 3A, 3B, 3C ; TERJUAL 1A  (mixed)
  const day1 = dateOffset(2);
  const day2 = dateOffset(1);
  const day3 = dateOffset(0);

  const movements: Mov[] = [
    // Day 1 — TITIP (owner)
    { date: day1, code: "A", kind: "TITIP", qty: 6, idem: "seed-1", submittedBy: userIds.owner,    submittedAt: noonEpoch(2) },
    { date: day1, code: "B", kind: "TITIP", qty: 5, idem: "seed-2", submittedBy: userIds.owner,    submittedAt: noonEpoch(2) + 60 },
    { date: day1, code: "C", kind: "TITIP", qty: 5, idem: "seed-3", submittedBy: userIds.owner,    submittedAt: noonEpoch(2) + 120 },
    // Day 2 — TERJUAL (PIC)
    { date: day2, code: "A", kind: "TERJUAL_OPENING", qty: 5, idem: "seed-4", submittedBy: userIds.picPadel, submittedAt: noonEpoch(1) },
    { date: day2, code: "B", kind: "TERJUAL_OPENING", qty: 3, idem: "seed-5", submittedBy: userIds.picPadel, submittedAt: noonEpoch(1) + 60 },
    { date: day2, code: "C", kind: "TERJUAL_OPENING", qty: 3, idem: "seed-6", submittedBy: userIds.picPadel, submittedAt: noonEpoch(1) + 120 },
    // Day 3 — TITIP (owner)
    { date: day3, code: "A", kind: "TITIP", qty: 3, idem: "seed-7", submittedBy: userIds.owner,    submittedAt: noonEpoch(0) },
    { date: day3, code: "B", kind: "TITIP", qty: 3, idem: "seed-8", submittedBy: userIds.owner,    submittedAt: noonEpoch(0) + 60 },
    { date: day3, code: "C", kind: "TITIP", qty: 3, idem: "seed-9", submittedBy: userIds.owner,    submittedAt: noonEpoch(0) + 120 },
    // Day 3 — TERJUAL 1×A (PIC)
    { date: day3, code: "A", kind: "TERJUAL_OPENING", qty: 1, idem: "seed-10", submittedBy: userIds.picPadel, submittedAt: noonEpoch(0) + 600 },
  ];

  for (const m of movements) {
    // Schema: qty is signed (Titip positive, Terjual negative — see data-model.md).
    const signedQty = m.kind === "TITIP" ? m.qty : -m.qty;
    const reason =
      m.kind === "TITIP"
        ? `Seed: titip ${m.qty} cup SKU ${m.code} (masa simpan 3 hari, simpan 2-4°C)`
        : `Seed: closing terjual ${m.qty} cup SKU ${m.code}`;
    const res = db
      .insert(stockMovements)
      .values({
        id: randomUUID(),
        partnershipId: realPartnershipId,
        skuId: skuIds[m.code],
        movementDate: m.date,
        kind: m.kind,
        qty: signedQty,
        reason,
        submittedByUserId: m.submittedBy,
        idempotencyKey: m.idem,
        submittedAt: m.submittedAt,
      })
      .onConflictDoNothing()
      .run();
    if (res.changes > 0) inc(counters, "stock_movements");
  }

  // ---- Summary ----
  const totals = sqlite
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM users)              AS users,
         (SELECT COUNT(*) FROM brands)             AS brands,
         (SELECT COUNT(*) FROM skus)               AS skus,
         (SELECT COUNT(*) FROM tenants)            AS tenants,
         (SELECT COUNT(*) FROM tenant_memberships) AS memberships,
         (SELECT COUNT(*) FROM partnerships)       AS partnerships,
         (SELECT COUNT(*) FROM partnership_skus)   AS partnership_skus,
         (SELECT COUNT(*) FROM stock_movements)    AS stock_movements`
    )
    .get() as Record<string, number>;

  console.log("\n[seed] Inserted (this run):", counters);
  console.log("[seed] Table totals now :", totals);
  console.log("\n[seed] Partnership:", {
    id: realPartnershipId,
    brand: BRAND.name,
    tenant: "Cafe Padel",
    status: PARTNERSHIP.status,
    split: `${PARTNERSHIP.splitBrandBps / 100}% brand / ${PARTNERSHIP.splitTenantBps / 100}% tenant`,
  });
  console.log("[seed] Users:");
  console.log(`  - ${BRAND_OWNER.name.padEnd(20)} ${BRAND_OWNER.phone}  (Hanniel owner)`);
  console.log(`  - PIC Cafe Padel`.padEnd(22) + ` ${TENANTS[0].phone}`);
  console.log(`  - PIC Cafe Kedua`.padEnd(22) + ` ${TENANTS[1].phone}`);
  console.log("\n[seed] DONE.");
}

main().catch((err) => {
  console.error("[seed] FAILED:", err);
  process.exit(1);
});
