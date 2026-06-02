# Kongsian — Edge Cases

Operational scenarios the system must handle gracefully. Detection = signal; Handling = response; Notified = who gets the ping.

## Edge Case Table

| # | Scenario | Detection | Handling | Notified |
|---|----------|-----------|----------|----------|
| 1 | Cafe forgot to input 2+ days | Cron: gap in daily_input since last > 36h | Auto-send WA reminder at 10:00 + 18:00 local on day 2+; mark day as `MISSING_INPUT` in settlement | Tenant PIC, Brand owner |
| 2 | Selisih (discrepancy) > 1 cup | `Sisa_Fisik - Sisa_Hitungan` abs > 1 | Auto-open dispute, lock week's settlement, require foto + reason before brand approval | Tenant PIC, Brand owner |
| 3 | Brand pulls stock mid-day (Tarik emergency) | `Tarik` input timestamp + SKU from active placement | Allow, but compute new `Sisa_Hitungan` immediately; remaining day counts against new stock; flag for audit | Tenant PIC |
| 4 | Sunday timezone rollover (WIB → WITA → WIT) | Cron job checks tenant TZ before settlement gen | Use tenant's IANA TZ (Asia/Jakarta default) for all week boundaries; log TZ in settlement row | — (internal) |
| 5 | Cafe offline / no internet | Local IndexedDB queue + service worker | Queue all inputs locally with UUID; sync on reconnect; show "pending sync" badge | Tenant PIC (offline toast) |
| 6 | Double-submit retry (network jitter) | Idempotency key from client (UUID) | Reject duplicate POST with 409; UI disables button after first click + spinner | — |
| 7 | Race condition: 2 PICs edit same day | Optimistic lock via `version` column | Second writer gets 409 with "refresh needed" toast; merge diff if forced | Both PICs |
| 8 | Settlement edited after brand approval | Audit log: `status=APPROVED` → write attempt | Hard block; require brand to revert to `DISPUTED` first; new edit creates v2 settlement | Brand owner, Admin |
| 9 | Price change mid-week | `placement.price` is per-week; mid-week change creates new placement record | Old week's settlement uses old price; new week uses new; show in settlement line items | Tenant PIC (banner) |
| 10 | OTP expired (10 min) or already used | `otp.expires_at < now` OR `otp.used=true` | Reject with 400 "OTP expired, request new"; rate-limit re-request to 3/hour | — |
| 11 | WA number changed (tenant PIC swap) | New WA number on profile update | Send OTP to OLD + NEW number for confirmation; old can deny within 24h | Old PIC, New PIC |
| 12 | Cafe closes permanently | `tenant.status = INACTIVE` (manual) | Mark all open placements as `CLOSED`; no more Titip allowed; finalize current week settlement | Brand owner, Admin |
| 13 | Brand adds new SKU mid-week | New `sku` row inserted; not in any placement yet | Available for new placements only; existing week's SKU list unchanged for that cafe | — |
| 14 | Expired `masa simpan` (shelf life) return | SKU `masa_simpan_date < now` returned via Tarik | Accept Tarik; tag with `EXPIRED_RETURN`; brand decides: refund / replace / write-off | Brand owner |
| 15 | Negative stock (Sisa_Fisik < 0) | Formula `Sisa_Hitungan - Sisa_Fisik > stock_in` | UI blocks submit if < 0; allow override with reason + photo (likely dispute) | Tenant PIC, Brand |
| 16 | Wrong cafe entry (PIC inputs for wrong tenant) | Placement FK mismatch in audit | Soft-block if no active placement for tenant+SKU; warn if last input was > 4h ago for this PIC | Tenant PIC (confirm modal) |
| 17 | Partial payout (brand pays some tenants, not all) | Payout recorded per tenant in cycle | Each tenant settlement tracks `paid_at`, `paid_amount`, `payment_proof_url` independently | Unpaid tenant (reminder WA) |
| 18 | Zero sales week | `Terjual = 0` for whole week | Settlement still generated with Rp 0; no dispute; mark `DORMANT` after 3 zero weeks | Brand owner (digest) |
| 19 | Tenant PIC change (staff turnover) | New PIC linked to tenant | Old PIC loses access; new PIC gets WA OTP invite; transition log entry | Both PICs, Brand owner |
| 20 | OTP brute force attempt | > 5 wrong OTPs in 15 min for same number | Lock number for 1 hour; alert admin; show generic error to attacker | Admin |
| 21 | Cafe inputs Terjual > Titip (impossible) | `Terjual > cumulative_Titip - cumulative_Tarik` | UI red banner; submit disabled; offer "review your inputs" link | Tenant PIC |
| 22 | Holiday / cafe closed (legit) | Tenant flags day as `LIBUR` | Excluded from `MISSING_INPUT` check; no Titip expected; treated as 0 sales | — |
| 23 | Massive order day (Titip spike) | Titip > 2x weekly average | Auto-flag for brand review; allow but require brand confirmation within 24h | Brand owner |
| 24 | Photo upload fails (R2 timeout) | Client retry 3x then fail | Save metadata + placeholder; settlement goes to `PENDING_PHOTO`; auto-retry background job | Tenant PIC, Brand |
| 25 | WA Business API down (Meta outage) | Send fails after 3 retries | Queue to KV; exponential backoff; show in admin dashboard "WA delivery delayed" | Admin |

## Severity Tiers

- **P0 (data corruption / money loss)**: #2, #6, #7, #8, #10, #15, #21
- **P1 (operational break)**: #1, #3, #5, #11, #14, #17, #19, #24
- **P2 (annoyance)**: #4, #9, #12, #13, #16, #18, #20, #22, #23, #25
