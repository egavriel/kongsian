# P0 Audit Status — Kongsian (3 Jun 2026)

## Identity reminder
- Eeveeon runs on VPS `178.104.30.188` (NOT sandbox)
- Hostname: `ubuntu-8gb-nbg1-1`
- IP via curl api.ipify.org: `178.104.30.188`
- Container shows `2a01:4f8:1c19:19bd::1` (different egress) — CF 9109 transient, retry always works

## P0 fixes status (ALL VERIFIED LIVE ✅)

### P0-1 (OTP disclosure) — DEPLOYED & LIVE VERIFIED
- wrangler.toml: `ENV = "production"`
- Live: `POST /v1/auth/otp/request` returns NO `devCode` field
- Deploy version: `15ea6ee3-4cd4-49c2-8c35-8cfeb4f6e951` (latest)

### P0-2 (IDOR) — DEPLOYED & LIVE VERIFIED (13 tests passed)
- tenants.ts: scope to tenantMemberships
- skus.ts: assertBrandOwner + tenant-partnership check
- partnerships.ts: auth check before returning data
- audit.ts: intersected with allowed entityIds
- brands.ts: ownership check on `:id`
- **13 tests pass:**
  - LH owner → LH SKUs: 200, 2 items ✅
  - LH owner → H SKUs: 403 FORBIDDEN ✅
  - H owner → H SKUs: 200, 2 items ✅
  - H owner → LH SKUs: 403 FORBIDDEN ✅
  - SOL PIC → LH SKUs (via partnership): 200, 2 items ✅
  - SOL PIC → H SKUs (via partnership): 200, 2 items ✅
  - LH owner → own partnerships: 200, 1 ✅
  - H owner → LH partnerships: 403 FORBIDDEN ✅
  - SOL PIC → all partnerships (member of both): 200, 2 ✅
  - Audit log: cross-tenant returns 0 (no rows + filtered) ✅
  - Brand detail: cross-tenant 403, via partnership 200 ✅

### P0-3 (verification gate) — DEPLOYED & LIVE VERIFIED
- brands.ts:47-65 returns 403 VERIFICATION_PENDING for PENDING/REJECTED
- login.astro:257-262 shows block modal, NO redirect
- PLATFORM_ADMIN bypasses by design
- **3 tests pass:**
  - PENDING user → /v1/brands/me: 403 VERIFICATION_PENDING ✅
  - REJECTED user → /v1/brands/me: 403 VERIFICATION_PENDING ✅
  - VERIFIED user → /v1/brands/me: 200 with role data ✅

## Production state

### Secrets
- **OTP_HMAC_KEY:** `5c71847d423e...ea0e57a7fba9` (64-char hex, openssl rand -hex 32). Set via `wrangler secret put` 03 Jun 2026 04:17 UTC. Auto-redeployed.

### Test data (KEEP for Week 3)
- 4 users (all VERIFIED):
  - `+628****8111` Test User (USER)
  - `+628****7890` Bu Ervina — Hanniel owner (USER)
  - `+628****7809` Erwin — PLATFORM_ADMIN
  - `+628****99779` Little Hanniel owner (USER)
- 2 brands:
  - `brand-little-hanniel` owned by `little-hanniel-owner-001`
  - `brand-hanniel` owned by `hanniel-owner-001`
- 1 tenant:
  - `tenant-sol-racquet` "SOL Racquet Club" (PIC: `+628****0011`, member: `7f840634-a7b9-4cf5-8d68-8727fb6627b0`)
- 2 partnerships (both ACTIVE):
  - `partnership-lh-sol`: Little Hanniel ↔ SOL
  - `partnership-h-sol`: Hanniel ↔ SOL
- 4 SKUs:
  - Little Hanniel: `sku-lh-dco` (DCO, Rp42k), `sku-lh-str` (Strawberry, Rp42k)
  - Hanniel: `sku-h-tira` (Tiramisu, Rp42k), `sku-h-dco` (DCO, Rp45k)
- 4 partnership_skus links

### Cleanup done
- All test sessions deleted (0 remaining)
- All users VERIFIED
- HMAC key set to proper random value

## Files reviewed
- `/root/kongsian/apps/api/src/routes/tenants.ts` (105 lines)
- `/root/kongsian/apps/api/src/routes/skus.ts` (218 lines)
- `/root/kongsian/apps/api/src/routes/partnerships.ts` (627 lines)
- `/root/kongsian/apps/api/src/routes/audit.ts` (90 lines)
- `/root/kongsian/apps/api/src/routes/brands.ts` (228 lines, P0-3 gate here)
- `/root/kongsian/apps/api/src/routes/auth.ts` (390 lines, OTP disclosure fix)
- `/root/kongsian/apps/api/src/lib/auth.ts` (72 lines)
- `/root/kongsian/apps/api/src/lib/crypto.ts` (43 lines, HMAC primitive)
- `/root/kongsian/apps/web/src/pages/login.astro` (288 lines, P0-3 frontend block)

## Memory
- `/root/.hermes/memories/MEMORY.md` updated with Eeveeon VPS identity
- Pinned: Eeveeon = VPS 178.104.30.188, CF 9109 transient, identity-check commands

## Next: Week 3
1. Daily closing flow (Terjual+Sisa Fisik per-SKU per-hari)
2. Auto-compute Sisa Sistem+Selisih
3. Dispute flag
4. WA notification (manual+cron)
5. Use seeded data: SOL Racquet Club as test tenant for daily closing

## Live URLs
- API: `https://kongsian-api.thegavriel-co.workers.dev` (version 15ea6ee3)
- Web: `https://15236687.kongsian-web.pages.dev`
- D1 db id: `94a52c2f-af08-4642-b477-4edc2251f52b`
- Migrations applied: 0000 (Week 1), 0002 (verification_status+onboarding_role+wa_sent)

## Git state
- Branch: main
- Last commit: `942ba00` (P0 fixes), pushed
- Working dir: `/root/kongsian`
