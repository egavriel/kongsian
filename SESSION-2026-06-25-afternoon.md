# Kongsian — Session 2026-06-25 (afternoon pivot)

## Feature shipped: brand-side closing revision

User scenario: brand owner (Erwin) caught a mistake on a SUBMITTED closing the
day after submission. DCO was marked as sold 2; should have been 1 Tiramisu + 1 DCO.
Need a way to correct post-submission closings without manual SQL.

## What shipped

**New endpoint: `POST /v1/brands/:brandId/closings/:id/revise`**

Request body:
```json
{
  "reason": "customer-reported mixup, should be 1 tiramisu + 1 DCO",
  "corrections": [
    { "closingLineId": "...", "terjual": 1 },
    { "skuId": "tiramisu-sku-id", "terjual": 1 }
  ]
}
```

Behavior:
1. Auth: brand owner of the closing's brand (or PLATFORM_ADMIN override)
2. Status guard: only SUBMITTED or REVISED closings can be revised (OPEN
   closings use the existing PUT endpoints; LOCKED closings cannot be revised
   because the week's settlement is PAID)
3. Settlement guard: refuses if the week's settlement is BRAND_APPROVED or
   PAID — those require admin unlock first
4. For each correction:
   - Insert compensating `stock_movement` (kind=TERJUAL_CORRECTION) pointing
     back to the original via `corrects_movement_id`
   - Upsert `daily_closing_lines.terjual` (or insert new line for new SKU)
5. Flip closing status to REVISED
6. Emit audit_log entry with full before/after
7. Re-trigger settlement regeneration for the affected week
8. Return `{ closingId, status: "REVISED", corrections, settlementStatus, weekStart }`

**New helper: `regenerateSettlementForPartnershipWeek(env, partnershipId, weekStart, nowSec)`**

Upserts an existing DRAFT settlement (refuses if BRAND_APPROVED/PAID). Updates
totals + replaces settlement_lines. Throws specific errors:
- `NO_EXISTING_SETTLEMENT` — caller should have caught via earlier guard
- `SETTLEMENT_NOT_DRAFT:<status>` — caller should have caught via earlier guard
- `NO_CLOSINGS_REMAIN` — week now empty, settlement deleted

**Schema changes:**
- `daily_closings.status` enum: added `REVISED` (no D1 migration needed,
  SQLite TEXT column with no CHECK constraint)
- `settlements.regenerated_at` integer column added (migration `0006`)
- Status filter in `generateSettlements` now includes `REVISED` alongside
  `SUBMITTED` and `LOCKED` so corrected closings feed into weekly aggregation

## Files changed

- `apps/api/src/routes/closings.ts` — added revise endpoint (~280 lines)
- `apps/api/src/lib/settlement.ts` — extracted `computeSettlementForPartnershipWeek`
  helper, added `regenerateSettlementForPartnershipWeek`
- `packages/db/src/schema/daily-closings.ts` — REVISED enum value
- `packages/db/src/schema/settlements.ts` — regenerated_at column
- `packages/db/migrations/0006_closing_revision.sql` — D1 migration (Drizzle-generated)
- `packages/db/migrations/meta/0006_snapshot.json` — Drizzle migration metadata
- `packages/db/migrations/meta/_journal.json` — auto-updated by drizzle-kit generate

## Verification

- `pnpm exec tsc --noEmit` clean in both `packages/db` and `apps/api`
- Drizzle Kit generated the migration cleanly
- Migration applied to remote D1 successfully
- `PRAGMA table_info(settlements)` confirms `regenerated_at INTEGER` column exists
- GitHub Actions deploy run `28167033357` succeeded (38s, all 11 steps green)
- Endpoint reachable on production: POST without auth returns proper
  `UNAUTHENTICATED` error code (path registered, auth middleware firing)

## What I did NOT verify (needs real session)

- Full E2E with auth session — would need OTP login + session cookie, then a real
  revise call. The structural smoke test (route registered, auth wired, schema
  validates) is the strongest signal available without scripting the OTP flow.
- UI for the revise action — currently the endpoint is API-only. Next step is
  adding a "Revise" button to the brand-side closing detail page.

## Open follow-ups (not in this PR)

1. **UI: brand-side closing detail page should show "Revise" button on SUBMITTED
   closings**, opening a modal with current lines + correction fields + reason
   text input. Reason must be ≥10 chars (enforced server-side).
2. **Confirmation flow**: consider a two-step "preview → confirm" UX so brand
   owner sees the before/after delta and settlement impact before submitting.
3. **Audit visibility**: the `CLOSING_REVISED` audit_log entries should surface
   in the brand-side closing history view (if it exists — none today).
4. **Settlement view freshness**: the regenerated settlement appears in the
   brand dashboard immediately, but there's no UI badge indicating it was
   regenerated vs initially drafted. Consider a small "Regenerated HH:MM"
   indicator on the settlement card.

## Deployment timeline

- Branch: `feature/closing-revision`
- Merged to main via `--no-ff`
- Pushed at 11:31 UTC
- CI deploy completed at 11:32 UTC (38s total)
- Live on `https://kongsian-api.thegavriel-co.workers.dev`