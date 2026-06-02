# Kongsian — Data Model

## 1. ER diagram (mermaid)

```mermaid
erDiagram
    USER ||--o{ BRAND : "owns (role=BRAND)"
    USER ||--o{ TENANT_MEMBERSHIP : "belongs to (role=TENANT)"
    TENANT ||--o{ TENANT_MEMBERSHIP : "has PICs"
    BRAND ||--o{ SKU : "defines"
    BRAND ||--o{ PARTNERSHIP : "sells through"
    TENANT ||--o{ PARTNERSHIP : "sells at"
    PARTNERSHIP ||--o{ PARTNERSHIP_SKU : "offers (price, override)"
    SKU ||--o{ PARTNERSHIP_SKU : "listed in"
    PARTNERSHIP ||--o{ STOCK_MOVEMENT : "tracks"
    SKU ||--o{ STOCK_MOVEMENT : "moved"
    PARTNERSHIP ||--o{ DAILY_CLOSING : "closed daily"
    DAILY_CLOSING ||--o{ DAILY_CLOSING_LINE : "per SKU"
    SKU ||--o{ DAILY_CLOSING_LINE : "counted"
    PARTNERSHIP ||--o{ SETTLEMENT : "settled weekly"
    SETTLEMENT ||--o{ SETTLEMENT_LINE : "per SKU"
    SKU ||--o{ SETTLEMENT_LINE : "settled"
    USER ||--o{ OTP : "verifies"
    USER ||--o{ SESSION : "logs in"
    USER ||--o{ AUDIT_LOG : "performed"
    PARTNERSHIP ||--o{ DISPUTE : "may have"
    DAILY_CLOSING_LINE ||--o| DISPUTE : "triggered by"

    USER {
        text id PK
        text phone_e164 UK "e.g. +6281234567890"
        text name
        text role "BRAND|TENANT|ADMIN"
        text global_role "USER|PLATFORM_ADMIN"
        timestamp created_at
        timestamp last_login_at
    }

    BRAND {
        text id PK
        text user_id FK
        text name
        text slug UK
        text logo_r2_key
        text description
        timestamp created_at
    }

    TENANT {
        text id PK
        text name
        text slug UK
        text address
        text pic_phone_e164 "primary PIC"
        timestamp created_at
    }

    TENANT_MEMBERSHIP {
        text id PK
        text tenant_id FK
        text user_id FK
        text role "OWNER|STAFF"
        timestamp created_at
    }

    SKU {
        text id PK
        text brand_id FK
        text code "A, B, C or human-readable"
        text name "Double Choco, etc."
        integer price_idr "list price, brand-wide default"
        integer cost_idr "nullable, brand's cost"
        boolean active
        timestamp created_at
    }

    PARTNERSHIP {
        text id PK
        text brand_id FK
        text tenant_id FK
        integer revenue_split_brand_bps "7000 = 70%, basis points"
        integer revenue_split_tenant_bps "3000 = 30%"
        text status "PENDING|ACTIVE|SUSPENDED|ENDED"
        timestamp created_at
        timestamp activated_at
    }

    PARTNERSHIP_SKU {
        text id PK
        text partnership_id FK
        text sku_id FK
        integer price_override_idr "nullable; falls back to SKU.price_idr"
        boolean active
        timestamp price_changed_at
        text price_changed_by_user_id FK
    }

    STOCK_MOVEMENT {
        text id PK
        text partnership_id FK
        text sku_id FK
        text movement_date "ISO date 'YYYY-MM-DD' (WIB)"
        text kind "TITIP|TARIK|TERJUAL_OPENING|TERJUAL_CORRECTION|ADJUSTMENT"
        integer qty "signed: +Titip, -Tarik, -Terjual, ±Adjust"
        text reason "free text for ADJUSTMENT/CORRECTION"
        text submitted_by_user_id FK
        text corrects_movement_id FK "nullable; points to row being corrected"
        timestamp submitted_at
        text idempotency_key UK "client UUID; prevents double-submit"
    }

    DAILY_CLOSING {
        text id PK
        text partnership_id FK
        text closing_date "ISO date"
        text status "OPEN|SUBMITTED|LOCKED"
        text submitted_by_user_id FK "nullable until SUBMITTED"
        timestamp submitted_at
        text notes
    }

    DAILY_CLOSING_LINE {
        text id PK
        text daily_closing_id FK
        text sku_id FK
        integer terjual "units sold today (tenant input)"
        integer sisa_fisik "physical count (tenant input)"
        integer sisa_sistem "computed"
        integer selisih "computed: sisa_fisik - sisa_sistem"
        text dispute_id FK "nullable"
    }

    SETTLEMENT {
        text id PK
        text partnership_id FK
        text week_start_date "Senin ISO date"
        text week_end_date "Minggu ISO date"
        integer total_terjual
        integer total_omzet_idr
        integer brand_share_idr "computed"
        integer tenant_share_idr "computed"
        text status "DRAFT|PENDING_BRAND|BRAND_APPROVED|PAID|DISPUTED"
        text approved_by_user_id FK
        timestamp approved_at
        text pdf_r2_key "nullable until generated"
        timestamp generated_at
    }

    SETTLEMENT_LINE {
        text id PK
        text settlement_id FK
        text sku_id FK
        integer qty_terjual
        integer omzet_idr
    }

    OTP {
        text id PK
        text phone_e164
        text code_hash "bcrypt/argon2; never plaintext"
        timestamp expires_at
        integer attempts "max 5"
        text purpose "LOGIN|INVITE"
        text consumed_at
        timestamp created_at
    }

    SESSION {
        text id PK
        text user_id FK
        text session_token_hash
        timestamp expires_at
        text user_agent
        text ip
    }

    AUDIT_LOG {
        text id PK
        text user_id FK
        text action "SKU_CREATED|MOVEMENT_SUBMITTED|CLOSING_SUBMITTED|SETTLEMENT_APPROVED|..."
        text entity_type
        text entity_id
        text before_json
        text after_json
        text ip
        text user_agent
        timestamp created_at
    }

    DISPUTE {
        text id PK
        text partnership_id FK
        text daily_closing_line_id FK
        integer selisih_qty
        text status "OPEN|RESOLVED_BRAND|RESOLVED_TENANT|RESOLVED_ADMIN"
        text resolution_notes
        text resolved_by_user_id FK
        timestamp resolved_at
        timestamp created_at
    }
```

---

## 2. Drizzle schema (TypeScript)

The schema lives at `apps/web/src/server/db/schema.ts`. Field types map to D1's SQLite. Money is `integer` IDR (no decimals). Dates are stored as `text` in ISO `YYYY-MM-DD` format. Timestamps are Unix seconds (integer) for easy comparison.

```ts
// apps/web/src/server/db/schema.ts
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  phoneE164: text('phone_e164').notNull().unique(),
  name: text('name').notNull(),
  globalRole: text('global_role', { enum: ['USER', 'PLATFORM_ADMIN'] }).notNull().default('USER'),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
  lastLoginAt: integer('last_login_at'),
});

export const brands = sqliteTable('brands', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logoR2Key: text('logo_r2_key'),
  description: text('description'),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
});

export const tenants = sqliteTable('tenants', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  address: text('address'),
  picPhoneE164: text('pic_phone_e164').notNull(),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
});

export const tenantMemberships = sqliteTable('tenant_memberships', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['OWNER', 'STAFF'] }).notNull().default('OWNER'),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
}, (t) => ({
  uniqUserTenant: uniqueIndex('uniq_user_tenant').on(t.userId, t.tenantId),
}));

export const skus = sqliteTable('skus', {
  id: text('id').primaryKey(),
  brandId: text('brand_id').notNull().references(() => brands.id, { onDelete: 'cascade' }),
  code: text('code').notNull(),       // "A", "B", "C" or "DC", "STR", "TI"
  name: text('name').notNull(),
  priceIdr: integer('price_idr').notNull(),
  costIdr: integer('cost_idr'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
}, (t) => ({
  uniqBrandCode: uniqueIndex('uniq_brand_code').on(t.brandId, t.code),
}));

export const partnerships = sqliteTable('partnerships', {
  id: text('id').primaryKey(),
  brandId: text('brand_id').notNull().references(() => brands.id, { onDelete: 'cascade' }),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  // basis points: 7000 = 70%
  revenueSplitBrandBps: integer('revenue_split_brand_bps').notNull().default(7000),
  revenueSplitTenantBps: integer('revenue_split_tenant_bps').notNull().default(3000),
  status: text('status', { enum: ['PENDING', 'ACTIVE', 'SUSPENDED', 'ENDED'] })
    .notNull().default('PENDING'),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
  activatedAt: integer('activated_at'),
}, (t) => ({
  uniqBrandTenant: uniqueIndex('uniq_brand_tenant').on(t.brandId, t.tenantId),
  idxStatus: index('idx_partnership_status').on(t.status),
}));

export const partnershipSkus = sqliteTable('partnership_skus', {
  id: text('id').primaryKey(),
  partnershipId: text('partnership_id').notNull().references(() => partnerships.id, { onDelete: 'cascade' }),
  skuId: text('sku_id').notNull().references(() => skus.id, { onDelete: 'cascade' }),
  priceOverrideIdr: integer('price_override_idr'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  priceChangedAt: integer('price_changed_at'),
  priceChangedByUserId: text('price_changed_by_user_id').references(() => users.id),
}, (t) => ({
  uniqPartnershipSku: uniqueIndex('uniq_partnership_sku').on(t.partnershipId, t.skuId),
}));

export const stockMovements = sqliteTable('stock_movements', {
  id: text('id').primaryKey(),
  partnershipId: text('partnership_id').notNull().references(() => partnerships.id),
  skuId: text('sku_id').notNull().references(() => skus.id),
  movementDate: text('movement_date').notNull(),  // 'YYYY-MM-DD' WIB
  kind: text('kind', {
    enum: ['TITIP', 'TARIK', 'TERJUAL_OPENING', 'TERJUAL_CORRECTION', 'ADJUSTMENT'],
  }).notNull(),
  qty: integer('qty').notNull(),  // signed
  reason: text('reason'),
  submittedByUserId: text('submitted_by_user_id').notNull().references(() => users.id),
  correctsMovementId: text('corrects_movement_id'),
  submittedAt: integer('submitted_at').notNull().default(sql`(unixepoch())`),
  idempotencyKey: text('idempotency_key').notNull().unique(),
}, (t) => ({
  idxPartnershipSkuDate: index('idx_mov_psd').on(t.partnershipId, t.skuId, t.movementDate),
}));

export const dailyClosings = sqliteTable('daily_closings', {
  id: text('id').primaryKey(),
  partnershipId: text('partnership_id').notNull().references(() => partnerships.id),
  closingDate: text('closing_date').notNull(),
  status: text('status', { enum: ['OPEN', 'SUBMITTED', 'LOCKED'] }).notNull().default('OPEN'),
  submittedByUserId: text('submitted_by_user_id').references(() => users.id),
  submittedAt: integer('submitted_at'),
  notes: text('notes'),
}, (t) => ({
  uniqPartnershipDate: uniqueIndex('uniq_closing_pd').on(t.partnershipId, t.closingDate),
}));

export const dailyClosingLines = sqliteTable('daily_closing_lines', {
  id: text('id').primaryKey(),
  dailyClosingId: text('daily_closing_id').notNull().references(() => dailyClosings.id, { onDelete: 'cascade' }),
  skuId: text('sku_id').notNull().references(() => skus.id),
  terjual: integer('terjual').notNull(),
  sisaFisik: integer('sisa_fisik').notNull(),
  sisaSistem: integer('sisa_sistem').notNull(),
  selisih: integer('selisih').notNull(),
  disputeId: text('dispute_id'),
}, (t) => ({
  uniqClosingSku: uniqueIndex('uniq_closing_sku').on(t.dailyClosingId, t.skuId),
}));

export const settlements = sqliteTable('settlements', {
  id: text('id').primaryKey(),
  partnershipId: text('partnership_id').notNull().references(() => partnerships.id),
  weekStartDate: text('week_start_date').notNull(),
  weekEndDate: text('week_end_date').notNull(),
  totalTerjual: integer('total_terjual').notNull(),
  totalOmzetIdr: integer('total_omzet_idr').notNull(),
  brandShareIdr: integer('brand_share_idr').notNull(),
  tenantShareIdr: integer('tenant_share_idr').notNull(),
  status: text('status', {
    enum: ['DRAFT', 'PENDING_BRAND', 'BRAND_APPROVED', 'PAID', 'DISPUTED'],
  }).notNull().default('DRAFT'),
  approvedByUserId: text('approved_by_user_id').references(() => users.id),
  approvedAt: integer('approved_at'),
  pdfR2Key: text('pdf_r2_key'),
  generatedAt: integer('generated_at').notNull().default(sql`(unixepoch())`),
}, (t) => ({
  uniqPartnershipWeek: uniqueIndex('uniq_settlement_pw').on(t.partnershipId, t.weekStartDate),
}));

export const settlementLines = sqliteTable('settlement_lines', {
  id: text('id').primaryKey(),
  settlementId: text('settlement_id').notNull().references(() => settlements.id, { onDelete: 'cascade' }),
  skuId: text('sku_id').notNull().references(() => skus.id),
  qtyTerjual: integer('qty_terjual').notNull(),
  omzetIdr: integer('omzet_idr').notNull(),
});

export const otps = sqliteTable('otps', {
  id: text('id').primaryKey(),
  phoneE164: text('phone_e164').notNull(),
  codeHash: text('code_hash').notNull(),
  expiresAt: integer('expires_at').notNull(),
  attempts: integer('attempts').notNull().default(0),
  purpose: text('purpose', { enum: ['LOGIN', 'INVITE'] }).notNull(),
  consumedAt: integer('consumed_at'),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
}, (t) => ({
  idxPhonePurpose: index('idx_otp_pp').on(t.phoneE164, t.purpose),
}));

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  sessionTokenHash: text('session_token_hash').notNull(),
  expiresAt: integer('expires_at').notNull(),
  userAgent: text('user_agent'),
  ip: text('ip'),
});

export const auditLog = sqliteTable('audit_log', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  beforeJson: text('before_json'),
  afterJson: text('after_json'),
  ip: text('ip'),
  userAgent: text('user_agent'),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
}, (t) => ({
  idxEntity: index('idx_audit_entity').on(t.entityType, t.entityId),
  idxUser: index('idx_audit_user').on(t.userId),
}));

export const disputes = sqliteTable('disputes', {
  id: text('id').primaryKey(),
  partnershipId: text('partnership_id').notNull().references(() => partnerships.id),
  dailyClosingLineId: text('daily_closing_line_id').notNull().references(() => dailyClosingLines.id),
  selisihQty: integer('selisih_qty').notNull(),
  status: text('status', {
    enum: ['OPEN', 'RESOLVED_BRAND', 'RESOLVED_TENANT', 'RESOLVED_ADMIN'],
  }).notNull().default('OPEN'),
  resolutionNotes: text('resolution_notes'),
  resolvedByUserId: text('resolved_by_user_id').references(() => users.id),
  resolvedAt: integer('resolved_at'),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
});
```

---

## 3. Critical invariants (asserted in domain code + DB constraints)

These are non-negotiable; the data model exists to enforce them.

| # | Invariant | Enforced by |
|---|-----------|-------------|
| I1 | `revenue_split_brand_bps + revenue_split_tenant_bps === 10000` | Zod + domain assertion at partnership create |
| I2 | `sisa_sistem = (movements up to date) computed; never written by user | Computed in transaction; only domain function writes it |
| I3 | `selisih = sisa_fisik − sisa_sistem` (signed) | Computed |
| I4 | `settlement.week_start_date === Monday` and `week_end_date === Sunday` (WIB) | Cron generator; never user-entered |
| I5 | `stock_movement.idempotency_key` is unique per request | DB unique index; client supplies UUID |
| I6 | `daily_closing_line.daily_closing_id + sku_id` is unique | DB unique index; one line per SKU per closing |
| I7 | A `Settlement` can only transition `DRAFT → PENDING_BRAND → BRAND_APPROVED/PAID/DISPUTED` | State machine in domain code |
| I8 | `partnership_skus.price_changed_at` is set when override changes; UI shows 7-day notice before applying | Domain rule + UI gating |
| I9 | Once `daily_closing.status === SUBMITTED`, no movement rows can be added for that `(partnership, date)` without an `ADJUSTMENT` kind and an audit row | Domain check + audit log |
| I10 | `user.role` is derived from which side of a partnership they act on, not stored per-user | Computed at request time from `brands` / `tenant_memberships` |

---

## 4. Money & date conventions

**Money:** All monetary values are `integer` IDR, no decimals. `Rp42.000` = `42000`. Always pair with a `priceIdr` (singular). Splits computed as:

```ts
const brandShare = Math.floor(omzetIdr * brandBps / 10000);
const tenantShare = omzetIdr - brandShare; // remainder to tenant (handles rounding)
```

**Date vs datetime:** Stock and closing are date-only (`YYYY-MM-DD` text). Movements and audit rows have Unix timestamp integers. We **never** mix the two in queries without explicit conversion.

**TZ:** MVP is single-TZ `Asia/Jakarta`. The app does not store offset; it assumes WIB. The cron schedules are written in WIB in comments and converted to UTC in wrangler config (e.g. "Monday 00:00 WIB" = Sunday 17:00 UTC = `17 0 * * 0`).

**Why this matters:** A cafe closing at 23:59 Monday WIB then settlement running at 00:00 Tuesday WIB is unambiguous in single-TZ. Multi-TZ support is a Phase 2 problem; the schema is already designed to add `timezone` later without data migration.

---

## 5. Migration strategy

- Drizzle migrations in `apps/web/drizzle/`, versioned, applied via `wrangler d1 migrations apply kongsian-db-prod`.
- Initial migration: full schema above, generated by `drizzle-kit generate`.
- Seed: 0. Production seeds nothing; staging seeds Hanniel's 3 SKUs as test data.
- **No destructive migrations in prod.** Add a column → migrate. Rename a column → migrate with `ALTER TABLE RENAME` + deploy code that uses new name; old name dropped in a follow-up migration once the new code is stable.
- All migrations go through GitHub Actions with a dry-run on PR and an apply on merge to `main` against prod.

---

## 6. Query patterns the data model optimizes for

The most common reads (verified from xlsx workflow):

1. **Today's stock for a tenant** (every page load):
   ```sql
   SELECT sku_id,
          COALESCE(SUM(CASE WHEN kind='TITIP' THEN qty ELSE 0 END), 0) titip,
          COALESCE(SUM(CASE WHEN kind='TARIK' THEN qty ELSE 0 END), 0) tarik,
          COALESCE(SUM(CASE WHEN kind LIKE 'TERJUAL%' THEN qty ELSE 0 END), 0) terjual
     FROM stock_movements
    WHERE partnership_id = ? AND movement_date = ?
    GROUP BY sku_id;
   ```
   Covered by `idx_mov_psd`.

2. **This week's omzet per partnership** (settlement cron):
   ```sql
   SELECT partnership_id, sku_id, SUM(qty) total_terjual
     FROM stock_movements
    WHERE kind IN ('TERJUAL_OPENING','TERJUAL_CORRECTION')
      AND movement_date BETWEEN ? AND ?
    GROUP BY partnership_id, sku_id;
   ```

3. **A single closing's lines** (selisih page): direct PK lookup on `daily_closings` + `daily_closing_lines`.

4. **Open disputes across all partnerships** (admin dashboard): scan `disputes WHERE status='OPEN'`, no index needed at MVP scale.

D1's read replica is in the same region as the writer (single region); no eventual consistency surprises for the brand↔tenant read flow.
