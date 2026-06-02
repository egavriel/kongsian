# Kongsian — API Routes

All routes are served by the Astro app on Cloudflare Workers. Path prefix `/api/v1`. JSON only. All authenticated routes require a valid Lucia session cookie (`__session`). Scopes are derived per request from the session user (see `data-model.md` §I10).

**Conventions**
- All money fields: integer IDR, no decimals.
- All date-only fields: ISO `YYYY-MM-DD` in `Asia/Jakarta`.
- All timestamps: Unix seconds (integer).
- `Idempotency-Key` header required for all `POST`/`PUT`/`DELETE` that mutates state; echoed in response.
- Errors: `{ "error": { "code": "STRING_CODE", "message": "Human readable", "details": {...} } }` with stable codes listed below.
- Pagination: `?cursor=<opaque>&limit=50` (max 200). Response wraps arrays in `{ "items": [...], "nextCursor": "..." | null }`.

---

## 1. Auth

| Method | Path | Role | Purpose |
|--------|------|------|---------|
| POST | `/api/v1/auth/otp/request` | public | Request OTP for a phone number |
| POST | `/api/v1/auth/otp/verify` | public | Verify OTP, create session |
| POST | `/api/v1/auth/session/refresh` | session | Rotate session token |
| POST | `/api/v1/auth/session/revoke` | session | Logout (current device) |
| GET  | `/api/v1/auth/me` | session | Current user + active memberships |

### POST `/api/v1/auth/otp/request`
- **Body**
  ```ts
  { phoneE164: string }       // e.g. "+6281234567890"
  ```
- **Response 200**
  ```ts
  { otpId: string, expiresAt: number, debugCode?: string } // debugCode only when APP_ENV=dev
  ```
- **Status codes:** `200` sent, `429` rate limited (>5/hour/phone, >20/hour/IP), `400` invalid phone format.
- **Errors:** `PHONE_INVALID`, `OTP_RATE_LIMIT_PHONE`, `OTP_RATE_LIMIT_IP`.
- **Side effects:** Generates 6-digit code, hashes (argon2id), stores in `otps`, sends via WA Cloud API using `whatsapp_otp` template.

### POST `/api/v1/auth/otp/verify`
- **Body**
  ```ts
  { otpId: string, code: string }   // code: 6 digits, string for leading zeros
  ```
- **Response 200**
  ```ts
  { user: User, memberships: Array<{tenantId?:string, brandId?:string, role:string}>, sessionToken: string }
  ```
- **Status codes:** `200` ok, `400` bad shape, `401` wrong code / expired, `403` phone not invited to any brand/tenant (auto-creates a `USER`-only account if `APP_ENV=dev` only).
- **Errors:** `OTP_INVALID`, `OTP_EXPIRED`, `OTP_LOCKED` (5 attempts), `OTP_ALREADY_USED`.
- **Side effects:** On success: marks `otps.consumed_at`, creates `sessions` row, returns `__session` cookie (HttpOnly, Secure, SameSite=Lax, 30 days).

### GET `/api/v1/auth/me`
- **Response 200**
  ```ts
  {
    user: { id, phoneE164, name, globalRole, createdAt, lastLoginAt },
    brand?: { id, name, slug, logoR2Key },
    tenantMemberships: Array<{ tenantId, name, slug, role: 'OWNER'|'STAFF' }>
  }
  ```

---

## 2. Brand

All routes in this section require `session` AND a resolved `brand` (user must own a `brands` row).

### 2.1 SKUs

| Method | Path | Purpose |
|--------|------|---------|
| GET   | `/api/v1/brand/skus` | List brand's SKUs (filter `?active=true|false`) |
| POST  | `/api/v1/brand/skus` | Create SKU |
| PATCH | `/api/v1/brand/skus/:skuId` | Update SKU (name/price/cost/active) |
| DELETE| `/api/v1/brand/skus/:skuId` | Soft-delete (set `active=false`); blocked if any open movement in last 7 days |

- **POST body**
  ```ts
  { code: string, name: string, priceIdr: number, costIdr?: number }
  ```
- **PATCH body** (any subset): `{ name?, priceIdr?, costIdr?, active? }`.
- **Errors:** `SKU_CODE_DUPLICATE`, `SKU_HAS_RECENT_MOVEMENT` (on delete), `SKU_NOT_FOUND`, `SKU_FOREIGN` (skuId belongs to another brand).
- **Side effect of price change:** creates an audit row; partnership-level `price_override_idr` is unaffected (override still wins). If brand has any ACTIVE partnerships, response includes `partnershipsAffected: number`.

### 2.2 Partnerships

| Method | Path | Purpose |
|--------|------|---------|
| GET   | `/api/v1/brand/partnerships` | List brand's partnerships (filter `?status=`) |
| POST  | `/api/v1/brand/partnerships` | Create partnership (by tenant phone) |
| GET   | `/api/v1/brand/partnerships/:id` | Detail with SKUs, split, status |
| PATCH | `/api/v1/brand/partnerships/:id` | Update split bps, status (suspend/activate/end) |
| POST  | `/api/v1/brand/partnerships/:id/skus` | Add SKU to partnership (with optional `priceOverrideIdr`) |
| PATCH | `/api/v1/brand/partnerships/:id/skus/:psId` | Toggle active / change override |
| POST  | `/api/v1/brand/partnerships/:id/invite` | Re-send WA invite to PIC |

- **POST body** (create)
  ```ts
  {
    tenantName: string,
    tenantAddress?: string,
    picPhoneE164: string,           // primary PIC
    revenueSplitBrandBps?: number,  // default 7000
    skuIds: string[],               // must all belong to this brand
  }
  ```
- **Status transitions:** `PENDING` → `ACTIVE` automatically the first time the tenant accepts the invite (signs in for the first time). `ACTIVE ↔ SUSPENDED` manual. `ACTIVE → ENDED` is permanent.
- **Errors:** `PARTNERSHIP_TENANT_NOT_FOUND_BY_PHONE` (auto-creates a `tenants` row if `APP_ENV=dev` only), `SPLIT_INVALID` (bps not summing to 10000), `PARTNERSHIP_ALREADY_EXISTS`.
- **Side effects:** Creates `partnerships` + `partnership_skus` rows; sends WA `partnership_invite` template; if phone belongs to existing user, links via `tenant_memberships`.

### 2.3 Stock ops

| Method | Path | Purpose |
|--------|------|---------|
| GET   | `/api/v1/brand/partnerships/:id/movements` | List (filter `?date=YYYY-MM-DD&skuId=&kind=`) |
| POST  | `/api/v1/brand/partnerships/:id/movements/titip` | Record Titip (delivered) |
| POST  | `/api/v1/brand/partnerships/:id/movements/tarik` | Record Tarik (pulled back) |
| POST  | `/api/v1/brand/partnerships/:id/movements/adjustment` | Manual adjustment (with reason) |
| GET   | `/api/v1/brand/partnerships/:id/stock/today` | Live computed stock snapshot for a date |

- **Titip body**
  ```ts
  { date: 'YYYY-MM-DD', lines: Array<{skuId: string, qty: number}>, note?: string }
  ```
- **Tarik body** (same shape; qty positive, sign applied server-side)
- **Adjustment body**
  ```ts
  { date: 'YYYY-MM-DD', lines: Array<{skuId: string, qty: number, direction: '+'|'-', reason: string}>, note?: string }
  ```
- **Idempotency:** all POSTs require `Idempotency-Key` header. Same key returns the original 201 response, never duplicates the row.
- **Errors:** `MOVEMENT_DUPLICATE` (same key, returns cached response with 200), `MOVEMENT_DATE_LOCKED` (closing already SUBMITTED and not within 24h grace), `MOVEMENT_QTY_INVALID` (<=0 or >999).
- **Side effects:** Inserts `stock_movements` row; broadcasts `stock.changed` event to tenant via SSE/poll endpoint (Phase 2).

### 2.4 Settlement (brand side)

| Method | Path | Purpose |
|--------|------|---------|
| GET   | `/api/v1/brand/settlements` | List (filter `?weekStart=&status=`) |
| GET   | `/api/v1/brand/settlements/:id` | Detail with lines + PDF URL |
| POST  | `/api/v1/brand/settlements/:id/approve` | Approve draft (DRAFT/PENDING_BRAND → BRAND_APPROVED) |
| POST  | `/api/v1/brand/settlements/:id/mark-paid` | Mark as paid (BRAND_APPROVED → PAID) |
| POST  | `/api/v1/brand/settlements/:id/dispute` | Brand raises a dispute (reverts to DISPUTED) |

- **Approve body:** `{ acknowledgedDisputes: string[] }` (dispute ids brand has reviewed).
- **Errors:** `SETTLEMENT_NOT_DRAFT`, `SETTLEMENT_ALREADY_APPROVED`, `SETTLEMENT_HAS_OPEN_DISPUTES` (unless disputes acknowledged).
- **Side effects:** On approve, sends WA `settlement_approved` to tenant; on mark-paid, sends `settlement_paid` (added in templates list, not in initial trigger set).
- **PDF generation:** `GET /api/v1/brand/settlements/:id/pdf` returns 302 redirect to R2 signed URL (TTL 5 min). PDF is generated lazily on first request by a Worker.

---

## 3. Tenant

All routes require `session` AND `tenant_memberships` row for the tenant in the path.

| Method | Path | Purpose |
|--------|------|---------|
| GET   | `/api/v1/tenant/me` | Current tenant profile + brand partnerships |
| GET   | `/api/v1/tenant/partnerships` | List active partnerships (with SKU catalog and prices) |
| GET   | `/api/v1/tenant/partnerships/:id/today` | Stock snapshot for today (Titip, Terjual, Sisa Sistem, Sisa Fisik status) |

### 3.1 Daily input

| Method | Path | Purpose |
|--------|------|---------|
| GET   | `/api/v1/tenant/partnerships/:id/closings/:date` | Get today's closing (or for any date within last 7 days) |
| POST  | `/api/v1/tenant/partnerships/:id/closings/:date/terjual` | Record Terjual (sold) for one or more SKUs |
| POST  | `/api/v1/tenant/partnerships/:id/closings/:date/sisa-fisik` | Record Sisa Fisik (physical count) |
| POST  | `/api/v1/tenant/partnerships/:id/closings/:date/submit` | Lock the closing (transitions to SUBMITTED) |
| POST  | `/api/v1/tenant/partnerships/:id/closings/:date/photos` | Upload chiller photo (multipart, R2) |

- **Terjual body**
  ```ts
  { lines: Array<{skuId: string, qty: number}>, idempotencyKey: string }
  ```
  - `idempotencyKey` is body field (not header) because this is a PWA form on flaky network.
- **Sisa Fisik body**
  ```ts
  { lines: Array<{skuId: string, qty: number}>, idempotencyKey: string }
  ```
- **Submit body:** `{}` (no payload; server validates all lines present, all >=0).
- **Errors:** `CLOSING_ALREADY_SUBMITTED` (returns the current closing read-only), `CLOSING_DATE_OUT_OF_RANGE` (>7 days old), `CLOSING_LINE_MISSING` (submit with empty lines), `SELISIH_TOO_LARGE` (auto-flagged, not blocked).
- **Side effects on submit:**
  - Transitions `daily_closings.status` to `SUBMITTED`, then `LOCKED` after 24h.
  - For each line with `|selisih| > 1`, creates a `disputes` row and sends WA `selisih_alert` to both brand and tenant.
  - Sends WA `closing_submitted` to brand (added in templates list).

### 3.2 Disputes

| Method | Path | Purpose |
|--------|------|---------|
| GET   | `/api/v1/tenant/disputes` | List (filter `?status=`) |
| GET   | `/api/v1/tenant/disputes/:id` | Detail with timeline + photos |
| POST  | `/api/v1/tenant/disputes/:id/messages` | Post a message (text or photo) |
| POST  | `/api/v1/tenant/disputes/:id/resolve` | Tenant accepts brand's resolution |

- **Messages body:** `{ body?: string, photoR2Key?: string }` (one required, max 5 per dispute, text 2000 chars).
- **Errors:** `DISPUTE_CLOSED`, `DISPUTE_MESSAGE_INVALID` (both empty, or both set).
- **Side effects:** Inserts `dispute_messages` row (Phase 2 table, see `data-model.md` note below); on resolve, sets `disputes.status='RESOLVED_TENANT'` and `RESOLVED_ADMIN` not allowed from tenant side.

---

## 4. Admin (PLATFORM_ADMIN only)

Erwin's global role. Hard-coded as `PLATFORM_ADMIN` for `erwin@eeveeon.id` in seed.

| Method | Path | Purpose |
|--------|------|---------|
| GET   | `/api/v1/admin/brands` | List all brands |
| PATCH | `/api/v1/admin/brands/:id` | Suspend/reactivate a brand |
| GET   | `/api/v1/admin/tenants` | List all tenants |
| GET   | `/api/v1/admin/settlements?status=DISPUTED` | Settlements needing admin action |
| POST  | `/api/v1/admin/disputes/:id/resolve` | Admin override resolution |
| GET   | `/api/v1/admin/audit?entity=...&entityId=...` | Audit log query |
| GET   | `/api/v1/admin/metrics` | `{ totalBrands, totalTenants, totalSettlementsThisWeek, openDisputes }` |

- **Resolve body:** `{ resolutionNotes: string, inFavorOf: 'BRAND'|'TENANT'|'SPLIT' }`.
- **Errors:** `ADMIN_FORBIDDEN` (not platform admin).

---

## 5. Webhooks (incoming)

### 5.1 WhatsApp Cloud API
`POST /api/v1/webhooks/wa` — receives delivery + status callbacks from Meta.

- **Verification (GET):** Meta sends `hub.challenge`; we echo if `X-Hub-Signature-256` matches and `hub.verify_token` matches env `WA_WEBHOOK_VERIFY_TOKEN`.
- **Event types handled:**
  - `message_status` → updates `wa_message_log.status` (`sent|delivered|read|failed`).
  - `messages` (inbound) → if user replies to a templated message outside a flow, create a `support_thread` (Phase 2). For MVP: only `STOP` keyword unsubscribes from non-OTP non-settlement WA.
- **Auth:** HMAC SHA-256 of body with `WA_APP_SECRET`; reject `401` if mismatch.
- **Idempotency:** dedupe on Meta's `message_id` (unique index on `wa_message_log.wa_message_id`).

### 5.2 Resend (email fallback)
`POST /api/v1/webhooks/resend` — delivery events; same dedupe pattern.

---

## 6. Outbound webhooks (Phase 2, listed for completeness)

- `POST` to brand-configured URL on `settlement.approved`, `closing.submitted`, `dispute.opened`. HMAC signed with per-brand secret. MVP does not implement.

---

## 7. Status code summary

| Code | Meaning in this API |
|------|---------------------|
| 200 | OK (reads, idempotent replay) |
| 201 | Created (first successful POST) |
| 204 | No content (logout revoke) |
| 400 | Validation error (`error.code` set) |
| 401 | Unauthenticated or session expired |
| 403 | Authenticated but wrong scope (e.g. tenant requesting brand route) |
| 404 | Resource not found OR not visible to caller (we don't differentiate, to avoid info leak) |
| 409 | Conflict (duplicate idempotency key with different body, partnership already exists) |
| 422 | Business rule violation (split doesn't sum to 10000, closing submitted twice) |
| 429 | Rate limited |
| 5xx | Server error (Sentry capture, no body detail) |

---

## 8. Rate limits (per `WRANGLER` env or defaults)

| Bucket | Limit |
|--------|-------|
| OTP request per phone | 5 / hour |
| OTP request per IP | 20 / hour |
| OTP verify per phone | 10 / hour |
| Login session per user | 5 active devices |
| Any mutation per session | 600 / hour |
| WA webhook inbound | 1000 / min (Meta sends bursts) |

All enforced at the Worker edge via a small in-memory token bucket (per-isolate, with KV backup for cross-isolate accuracy on the OTP buckets).
