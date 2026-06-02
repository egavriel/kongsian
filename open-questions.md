# Kongsian — Open Questions for Erwin

Decisions needed before / during build. Format: **Q | Why | Default | Decision [pending]**.

| # | Question | Why it matters | Default suggestion | Decision |
|---|----------|----------------|-------------------|----------|
| 1 | Custom domain: `kongsian.com` vs `.app` vs subdomain of existing? | Branding, SEO, trust, cost (`.app` requires HTTPS, ~$15/yr) | `kongsian.com` — short, brandable, .app force-HTTPS is fine for us | **DECIDED**: `kongsian.app` + vanity URL `kongsian.app/<brand>` (Erwin, 2 Jun 2026) |
| 2 | Subscription model: free pilot → paid? Pricing per brand, per tenant, per cup, or flat? | Revenue model, pilot conversion, cash flow | Free for 3 months, then Rp 200k/brand/month (unlimited cafes). Pilot goal: convert 5 brands | **DECIDED**: 1–2 minggu free trial per brand → paid tier. Angka paid tier TBD setelah trial selesai (Erwin, 2 Jun 2026) |
| 3 | Multi-currency MVP? | IDR is universal in our pilot (Indonesian cafes, brands), USD adds complexity, FX risk | IDR only for MVP. Schema has `currency` column for v2 | [pending] |
| 4 | Stock photo for dispute: required or optional? | Affects dispute resolution speed, friction for tenant, storage cost | Required when selisih > 1 cup. Optional but encouraged otherwise. Max 2 photos, 2MB each, R2 | [pending] |
| 5 | Settlement payout: recorded manually (brand uploads proof) vs bank API integration? | Speed to ship, accuracy, fraud risk, dev cost | MVP: brand records payout + uploads proof. Bank API (Xendit?) in v2. Saves 2+ weeks of dev | [pending] |
| 6 | WA notification cap per tenant per day? | Meta charges per conversation, spam complaints, user trust | Max 5 transactional WA per tenant/day. Digest anything else into weekly summary | **DECIDED (channel)**: WA Business manual + Workers cron job untuk MVP. Tidak pakai Meta Cloud API dulu. Cap per-tenant TBD setelah channel stabil (Erwin, 2 Jun 2026) |
| 7 | Brand KYC: required for signup or trust-based? | Legal risk, fraud, friction, regulatory (if holding money) | MVP: brand KYC stub (name, NPWP optional, business type). Real KYC post-pilot if we hold money | [pending] |
| 8 | Data retention period? | Storage cost, GDPR/UU PDP compliance, dispute window | Settlements: 2 years. Photos: 1 year. Logs: 90 days. Configurable per tenant for enterprise | [pending] |
| 9 | CSV export for tenants? | Tenant ops, accounting, transparency | Yes, free. Tenant dashboard "Export this week/month" → CSV with all inputs + settlement | [pending] |
| 10 | White-label possibility (cafe co-ops)? | Future revenue, complexity, brand dilution | Not in MVP. Schema has `brand.theme` JSON column so it's a config flip, not rebuild | [pending] |
| 11 | PPN / tax handling? | Indonesian tax law (11% PPN for some goods), invoicing, accounting | MVP: prices are tax-exclusive; brand handles PPN in their accounting. Add `tax_inclusive` flag in v2 | [pending] |
| 12 | Cancellation cycle length (brand pulls all stock, ends placement)? | Gives cafe time to sell, gives brand exit clarity, affects selisih handling | 5 days default: brand files Tarik with `cancellation=true`, settlement closes 5 days later, all unsold counted as `RETURN_TO_BRAND` | [pending] |
| 13 | Product photos in SKU? | Visual UX, dispute clarity, storage cost | Yes, optional, 1 photo per SKU, R2, lazy-loaded. Helps cafe PIC identify correct product | [pending] |
| 14 | Dispute escalation chain? | Who sees what, who's accountable, resolution time | L1: brand owner resolves (48h SLA). L2: admin (Erwin) if escalated or overdue. L3: in-person mediation (out of band) | [pending] |
| 15 | Cafe location verification (GPS check-in for Titip)? | Trust, fraud prevention, friction, battery drain | Not in MVP. Optional flag for v2 (`require_gps_for_titip`). Add later if fraud appears | [pending] |

## Critical Decisions (Block Week 1)

These MUST be answered before we start coding:

- **#1 Domain** — blocks deploy + branding
- **#6 WA cap** — blocks notification architecture
- **#2 Pricing** — blocks Terms of Service copy + billing stub

## Important but Deferrable (Block by Week 3)

- **#5 Payout method** — affects Week 3 settlement UI flow
- **#12 Cancellation cycle** — affects Week 3 dispute logic
- **#14 Dispute escalation** — affects Week 3 admin tools

## Deferred to Post-MVP

- **#3 Multi-currency**, **#10 White-label**, **#11 PPN**, **#15 GPS** — schema supports them, build in v2
- **#7 KYC**, **#8 Retention**, **#9 CSV export** — can be added without migration

## Decision Log

When Erwin answers, update `Decision` column and move row to "Decided" section below. Cite source (Slack link, call date).

### Decided

- **(NEW) Foto bukti Titip & Tarik** — **WAJIB**. Mirip Gojek, harus ada foto saat antar & tarik barang. Stored in R2, linked to StockMovement. (Erwin, 2 Jun 2026)
- **#4 Stock photo for dispute** — **WAJIB by default**, admin bisa override ke optional per partnership. Default behavior flips from "optional" to "required"; admin control surfaces this in partnership config. (Erwin, 2 Jun 2026)
- **#5 Settlement payout** — **MANUAL transfer**. Flow: tenant upload bukti transfer → brand approve. Xendit ditunda ke v2. Faster to ship, no payment-gateway dependency, fraud risk mitigated by tenant-uploaded proof + brand approval gate. (Erwin, 2 Jun 2026)
- **#12 Cancellation cycle / settlement period** — **DEFAULT weekly (Senin–Minggu)**, tapi **CONFIGURABLE per partnership**: bi-weekly, custom 8/10 hari, start day flexible (bisa mulai dari hari apa, gak harus Senin). `partnership.settlement_period` + `partnership.settlement_start_day` columns. (Erwin, 2 Jun 2026)
- **#7 Brand KYC** — **SKIP sampai post-pilot**. Erwin apply nama PT perorangan paralel. Yang penting MVP jalan dulu. Stub form stays in DB (`brand.kyc_status = 'pending'`) but no enforcement. Revisit after pilot with 5 brands. (Erwin, 2 Jun 2026)

## How to Answer

Erwin can reply in any of these ways:
1. Slack DM with question number + choice (e.g., "1: kongsian.com, 2: free pilot, 3: IDR")
2. Edit this file directly in Obsidian
3. Voice memo → I'll parse + update

Default to the suggestion if no answer by Day 3 of the relevant week. Flag any "default applied" in the next standup.
