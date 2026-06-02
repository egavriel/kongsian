/**
 * Kongsian DB seed — runs against the local D1.
 *
 * Creates:
 *   - 1 brand: "Hanniel" (owned by user +62-pic-hanniel)
 *   - 3 SKUs: A=Double Choco, B=Strawberry, C=Tiramisu (all Rp 42.000)
 *   - 2 tenants: Cafe Padel, Cafe Kedua
 *   - 1 ACTIVE partnership: Hanniel <-> Cafe Padel
 *   - Sample stock_movements: 5 Titip + 2 Terjual across 3 days
 *
 * Idempotent: re-running is safe. Existing rows are reused by slug/phone/code.
 *
 * Run:
 *   pnpm --filter @kongsian/db seed              # auto: local D1
 *   pnpm --filter @kongsian/db seed:remote       # remote D1
 */
import { randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ---------- Config (keep in sync with what the API and web use) ----------
const BRAND_NAME = "Hanniel";
const BRAND_SLUG = "hanniel";
const BRAND_OWNER_PHONE = "+6281234500001";
const BRAND_OWNER_NAME = "Hanniel Owner";

const TENANT_1 = { name: "Cafe Padel", slug: "cafe-padel", phone: "+6281234500002" };
const TENANT_2 = { name: "Cafe Kedua", slug: "cafe-kedua", phone: "+6281234500003" };

const SKUS = [
  { code: "A", name: "Double Choco", price: 42000 },
  { code: "B", name: "Strawberry",   price: 42000 },
  { code: "C", name: "Tiramisu",     price: 42000 },
];

const NOW = Math.floor(Date.now() / 1000);
const ONE_DAY = 86400;

// ---------- Low-level D1 exec helper ----------
function d1Exec(remote: boolean, sql: string): string {
  const tmp = mkdtempSync(join(tmpdir(), "kongsian-seed-"));
  const file = join(tmp, "seed.sql");
  writeFileSync(file, sql, "utf8");
  const flag = remote ? "--remote" : "--local";
  // wrangler runs from packages/db
  const cwd = process.cwd();
  try {
    process.chdir(join(cwd.endsWith("packages/db") ? cwd : join(cwd, "packages/db")));
    const out = execSync(
      `npx wrangler d1 execute kongsian-db ${flag} --file=${file}`,
      { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" }
    );
    return out;
  } catch (e: any) {
    process.chdir(cwd);
    throw new Error(`D1 exec failed: ${e?.stderr || e?.message || e}`);
  } finally {
    process.chdir(cwd);
  }
}

function esc(v: string): string {
  return v.replace(/'/g, "''");
}

// ---------- Plan + emit SQL ----------
function buildSql(): string {
  const ids = {
    userOwner:    randomUUID(),
    userPadel:    randomUUID(),
    userKedua:     randomUUID(),
    brand:        randomUUID(),
    tenantPadel:  randomUUID(),
    tenantKedua:  randomUUID(),
    partnership:  randomUUID(),
    skuA:         randomUUID(),
    skuB:         randomUUID(),
    skuC:         randomUUID(),
    partSkuA:     randomUUID(),
    partSkuB:     randomUUID(),
    partSkuC:     randomUUID(),
  };

  const movements: string[] = [];
  function mov(date: string, sku: string, kind: "TITIP" | "TERJUAL_OPENING", qty: number, idem: string) {
    const signed = kind === "TITIP" ? qty : -qty;
    const user = kind === "TITIP" ? ids.userOwner : ids.userPadel;
    movements.push(
      `INSERT OR IGNORE INTO stock_movements (id, partnership_id, sku_id, movement_date, kind, qty, reason, foto_r2_key, submitted_by_user_id, corrects_movement_id, submitted_at, idempotency_key) ` +
      `VALUES ('${randomUUID()}', '${ids.partnership}', '${sku}', '${date}', '${kind}', ${signed}, ${kind === "TITIP" ? "'Titip sample seed'" : "'Closing sample seed'"}, NULL, '${user}', NULL, ${NOW - Math.floor(Math.random() * 3600)}, '${idem}');`
    );
  }

  // 3 days of sample data. Use YYYY-MM-DD relative to today.
  function dateOffset(days: number): string {
    const d = new Date((NOW - days * ONE_DAY) * 1000);
    return d.toISOString().slice(0, 10);
  }
  // Day -2: 2 Titip (A, B), 0 Terjual
  mov(dateOffset(2), ids.skuA, "TITIP", 10, `seed-t-${ids.skuA.slice(0,8)}-d2`);
  mov(dateOffset(2), ids.skuB, "TITIP", 8,  `seed-t-${ids.skuB.slice(0,8)}-d2`);
  // Day -1: 2 Titip (A, C), 1 Terjual (A=3)
  mov(dateOffset(1), ids.skuA, "TITIP", 6, `seed-t-${ids.skuA.slice(0,8)}-d1`);
  mov(dateOffset(1), ids.skuC, "TITIP", 5, `seed-t-${ids.skuC.slice(0,8)}-d1`);
  mov(dateOffset(1), ids.skuA, "TERJUAL_OPENING", 3, `seed-s-${ids.skuA.slice(0,8)}-d1`);
  // Day 0 (today): 1 Titip (B), 1 Terjual (B=2)
  mov(dateOffset(0), ids.skuB, "TITIP", 12, `seed-t-${ids.skuB.slice(0,8)}-d0`);
  mov(dateOffset(0), ids.skuB, "TERJUAL_OPENING", 2, `seed-s-${ids.skuB.slice(0,8)}-d0`);

  const sql = `
-- Idempotent wipes (only target seed phone numbers + brand slug, so no prod data loss).
DELETE FROM stock_movements WHERE submitted_by_user_id IN (
  SELECT id FROM users WHERE phone_e164 IN ('${esc(BRAND_OWNER_PHONE)}', '${esc(TENANT_1.phone)}', '${esc(TENANT_2.phone)}')
);
DELETE FROM partnership_skus WHERE partnership_id IN (
  SELECT p.id FROM partnerships p
  INNER JOIN brands b ON b.id = p.brand_id
  WHERE b.slug = '${esc(BRAND_SLUG)}'
);
DELETE FROM partnerships WHERE brand_id IN (SELECT id FROM brands WHERE slug = '${esc(BRAND_SLUG)}');
DELETE FROM skus WHERE brand_id IN (SELECT id FROM brands WHERE slug = '${esc(BRAND_SLUG)}');
DELETE FROM brands WHERE slug = '${esc(BRAND_SLUG)}';
DELETE FROM tenant_memberships WHERE user_id IN (
  SELECT id FROM users WHERE phone_e164 IN ('${esc(TENANT_1.phone)}', '${esc(TENANT_2.phone)}')
);
DELETE FROM tenants WHERE slug IN ('${esc(TENANT_1.slug)}', '${esc(TENANT_2.slug)}');
DELETE FROM users WHERE phone_e164 IN ('${esc(BRAND_OWNER_PHONE)}', '${esc(TENANT_1.phone)}', '${esc(TENANT_2.phone)}');

-- Users.
INSERT INTO users (id, phone_e164, name, global_role, created_at, last_login_at) VALUES
  ('${ids.userOwner}', '${esc(BRAND_OWNER_PHONE)}', '${esc(BRAND_OWNER_NAME)}', 'USER', ${NOW}, ${NOW}),
  ('${ids.userPadel}', '${esc(TENANT_1.phone)}', 'PIC ${esc(TENANT_1.name)}', 'USER', ${NOW}, ${NOW}),
  ('${ids.userKedua}', '${esc(TENANT_2.phone)}', 'PIC ${esc(TENANT_2.name)}', 'USER', ${NOW}, ${NOW});

-- Brand.
INSERT INTO brands (id, user_id, name, slug, logo_r2_key, description, created_at) VALUES
  ('${ids.brand}', '${ids.userOwner}', '${esc(BRAND_NAME)}', '${esc(BRAND_SLUG)}', NULL, 'Brownies artisanal khas Hanniel — handmade daily, bahan premium.', ${NOW});

-- SKUs.
INSERT INTO skus (id, brand_id, code, name, price_idr, cost_idr, masa_simpan_hari, active, created_at) VALUES
  ('${ids.skuA}', '${ids.brand}', 'A', 'Double Choco', 42000, NULL, 7, 1, ${NOW}),
  ('${ids.skuB}', '${ids.brand}', 'B', 'Strawberry',   42000, NULL, 5, 1, ${NOW}),
  ('${ids.skuC}', '${ids.brand}', 'C', 'Tiramisu',     42000, NULL, 5, 1, ${NOW});

-- Tenants.
INSERT INTO tenants (id, name, slug, address, pic_phone_e164, created_at) VALUES
  ('${ids.tenantPadel}', '${esc(TENANT_1.name)}', '${esc(TENANT_1.slug)}', 'Jl. Padel No.1, Jakarta', '${esc(TENANT_1.phone)}', ${NOW}),
  ('${ids.tenantKedua}', '${esc(TENANT_2.name)}', '${esc(TENANT_2.slug)}', 'Jl. Raya No.2, Bandung',  '${esc(TENANT_2.phone)}', ${NOW});

-- Memberships (PIC owns their cafe).
INSERT INTO tenant_memberships (id, tenant_id, user_id, role, created_at) VALUES
  ('${randomUUID()}', '${ids.tenantPadel}', '${ids.userPadel}', 'OWNER', ${NOW}),
  ('${randomUUID()}', '${ids.tenantKedua}', '${ids.userKedua}', 'OWNER', ${NOW});

-- Partnership Hanniel <-> Cafe Padel (ACTIVE).
INSERT INTO partnerships (id, brand_id, tenant_id, revenue_split_brand_bps, revenue_split_tenant_bps, status, created_at, activated_at) VALUES
  ('${ids.partnership}', '${ids.brand}', '${ids.tenantPadel}', 7000, 3000, 'ACTIVE', ${NOW - 2 * ONE_DAY}, ${NOW - 2 * ONE_DAY});

-- Link all 3 SKUs to that partnership.
INSERT INTO partnership_skus (id, partnership_id, sku_id, price_override_idr, active, price_changed_at, price_changed_by_user_id) VALUES
  ('${ids.partSkuA}', '${ids.partnership}', '${ids.skuA}', NULL, 1, NULL, NULL),
  ('${ids.partSkuB}', '${ids.partnership}', '${ids.skuB}', NULL, 1, NULL, NULL),
  ('${ids.partSkuC}', '${ids.partnership}', '${ids.skuC}', NULL, 1, NULL, NULL);

-- Movements.
${movements.join("\n")}
`.trim();

  // Expose ids for the caller (via stdout parse). Also write a JSON sidecar.
  const idsPath = join(tmpdir(), "kongsian-seed-ids.json");
  writeFileSync(idsPath, JSON.stringify(ids, null, 2));
  return sql;
}

const remote = process.argv.includes("--remote");
console.log(`[seed] target: ${remote ? "REMOTE" : "LOCAL"} D1`);

const sql = buildSql();
console.log(`[seed] emitting ${sql.split("\n").length} SQL lines...`);
const out = d1Exec(remote, sql);
console.log(out);
console.log("[seed] DONE.");
