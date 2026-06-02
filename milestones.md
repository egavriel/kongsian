# Kongsian — 4-Week Roadmap

Aggressive timeline. Ship the loop: Titip → Terjual → Settlement → Payout. Everything else is polish.

## Week 1: Foundation

**Goals**
Get auth, multi-tenant data model, and read-only dashboards working. No transactions yet.

**Deliverables**
- WA OTP auth flow (request → send → verify → JWT)
- Brand signup: register, KYC stub, dashboard shell
- Tenant (cafe) CRUD: create, list, assign to brand
- SKU CRUD: create, list per brand, masa simpan field
- D1 schema: users, brands, tenants, skus, placements
- Cloudflare Pages deploy (staging URL live)
- Workers API + Drizzle migrations wired

**Demoable**
- Brand logs in via WA, creates 3 tenants, 5 SKUs. Tenant PIC receives WA invite, logs in, sees empty dashboard.

**Exit Criteria**
- [ ] OTP send + verify works in staging (test WA number)
- [ ] Tenant IDOR test passes (see anti-slop #1)
- [ ] D1 migrations apply cleanly on fresh DB
- [ ] Pages deploys on push to `main`
- [ ] CI green: lint, typecheck, unit tests
- [ ] JWT secret + WA token in `wrangler secret`

## Week 2: Core Flow

**Goals**
Make the Titip / Tarik / Terjual / Sisa Fisik input loop work end-to-end at one cafe with paper, no disputes yet.

**Deliverables**
- `Titip` (deposit) input form + audit log
- `Tarik` (pull) input form (mid-day stock removal)
- `Terjual` (sold) daily input form
- `Sisa Fisik` (physical count) weekly input
- Stock formula: `Sisa_Hitungan = cumulative_Titip - cumulative_Tarik - cumulative_Terjual`
- Atomic writes (DB transaction + version column)
- Brand dashboard: live stock per cafe
- Tenant dashboard: "input hari ini" CTA
- IndexedDB offline queue + service worker (basic)

**Demoable**
- Brand deposits 50 cups to cafe. Cafe logs 30 sold + 15 physical. System shows 5 unaccounted (selisih=5 > 1 → flag, but no dispute UI yet). Offline input syncs after reconnect.

**Exit Criteria**
- [ ] All 4 input types work with idempotency
- [ ] Race condition test passes (100 parallel inputs)
- [ ] Selisih > 1 surfaces in brand dashboard
- [ ] Offline queue persists across tab close
- [ ] Brand can pull stock mid-day without breaking Sisa_Hitungan
- [ ] Money format `Rp X.XXX` enforced everywhere

## Week 3: Settlement Cycle

**Goals**
Auto-generate weekly settlements Sunday 23:59 WIB. Brand approves, pays, uploads proof. Dispute loop live.

**Deliverables**
- Cron worker: Sunday 23:59 WIB → generate settlement per active placement
- Settlement row: status DRAFT → PENDING_BRAND → APPROVED → PAID
- WA notification on each transition
- Brand approval UI: see all settlements, approve/reject batch
- Dispute flow: tenant or brand opens with reason + photo (R2)
- Settlement edit lock post-approval (anti-slop #7)
- Audit log for all write ops
- Payment proof upload + display in tenant view
- "Reminder WA" for missed daily inputs (cron)

**Demoable**
- Week ends Sunday. Monday morning brand sees 5 settlements. 4 approved, 1 disputed (selisih 3 cups). Brand approves 4, requests foto on disputed. Tenant uploads foto. Brand resolves. WA notifications fire at each step.

**Exit Criteria**
- [ ] Cron fires reliably Sunday 23:59 WIB (test in staging)
- [ ] Settlement immutable post-approval (P0 check)
- [ ] Dispute photo upload works on 3G
- [ ] WA delivery tracked + visible in admin
- [ ] Audit log captures all settlement transitions
- [ ] Payout recorded per tenant independently

## Week 4: Polish + Pilot

**Goals**
Make it not embarrassing. Onboard Hanniel + 2 cafes for real. Convert to paying.

**Deliverables**
- Admin tools: user list, brand list, force-reset OTP, manual settlement trigger
- Marketing page: `kongsian.com` (hero, how it works, 3 testimonials, contact)
- Onboarding wizard: brand signup → first tenant → first Titip in < 10 min
- Empty states + illustrations on all dashboards
- Loading skeletons on all async views
- Error message copy pass (anti-slop #13)
- Mobile viewport polish (anti-slop #15-17)
- Hanniel onboarding call + first Titip logged
- 2 cafe PICs onboarded, given WA logins
- Billing stub: track "partnerships active" counter
- Backup: nightly D1 export to R2

**Demoable**
- Hanniel on video: creates account, adds 2 cafes, deposits 100 cups. Closes laptop. Cafe PIC opens phone, inputs 30 sold. Sunday: settlement auto-generated, Hanniel approves, transfers Rp X, uploads proof. Cafe sees "Paid ✓". Full loop in real life.

**Exit Criteria**
- [ ] All P0 anti-slop checks green
- [ ] Lighthouse mobile ≥ 90
- [ ] Hanniel has done ≥ 1 real settlement cycle
- [ ] 2 cafe PICs have logged in via WA
- [ ] Showcase page live at kongsian.com
- [ ] Nightly backup verified
- [ ] Post-mortem doc: what broke, what to fix in v2

## After Week 4

Not in this 4-week plan, but queued:
- v2: Multi-currency, PPN, white-label
- v2: Bank API integration for auto-payout
- v2: Tenant self-service analytics
- v3: Mobile native (React Native) for cafe PICs
