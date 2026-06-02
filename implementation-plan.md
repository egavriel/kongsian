# Kongsian — Implementation Plan

## 1. Executive summary

**Kongsian** solves a concrete problem Hanniel has today with a fragile Excel tracker: she consigns 3 SKUs of overnight oats to 2 cafe partners, and every day the brand owner and each cafe PIC have to coordinate stock-in, stock-out, physical count, and weekly 70/30 revenue split over a WhatsApp group + one Google Sheet. The math is simple (`Stok Awal + Titip − Tarik − Terjual = Sisa Sistem`) but the *coordination* is what breaks: missed messages, double-entries, selisih with no audit trail, Sunday settlement done by hand in Excel.

Kongsian turns that xlsx into a multi-tenant web app:

- Each **Brand** (Hanniel, and eventually others) registers and defines SKUs.
- Each **Tenant** (cafe) joins a partnership, gets a list of SKUs with prices set for that partnership.
- Daily: brand records `Titip` (delivered) and `Tarik` (pulled back); tenant records `Terjual` (sold) and `Sisa Fisik` (physical count). System computes `Sisa Sistem` and `Selisih` automatically.
- Sunday night: system generates a `Settlement` row with omzet and 70/30 split. Brand approves with one tap.
- Auth is **WhatsApp OTP** because cafe PICs are non-tech — no passwords, no apps, no onboarding friction.

**Multi-tenant** is built into the schema from day 1: every Stock Movement and Settlement is scoped by `(brand_id, tenant_id)`. Erwin as platform admin can see everything; brands see only their own; tenants see only what was delivered to them.

**Why this works as a portfolio piece:** Eeveeon's whole pitch is "AI agents that ship real things." Kongsian is a small, opinionated, production-quality app — not a demo. It shows full-stack judgment on a real domain (consignment, not another todo list), with real edge cases (selisih, dispute, mid-week price change, TZ rollover, offline).

---

## 2. MVP vs Phase 2 vs Phase 3

### MVP — "Hanniel doesn't use the xlsx anymore" (Weeks 1-4)

**Goal:** Replace the spreadsheet for 1 brand × 2 tenants. Production-stable.

In:
- Auth: WhatsApp OTP (Lucia + custom adapter for phone number sessions)
- 3 actor dashboards (brand, tenant, admin) — mobile-first, single-column
- Brand: CRUD SKUs, invite tenant (by phone), record daily Titip/Tarik
- Tenant: view SKUs delivered to them, record daily Terjual + Sisa Fisik (per SKU, per day)
- Auto-computed Sisa Sistem, Selisih, dispute flag
- Weekly Settlement auto-generated Monday 00:00 WIB; brand approves with one tap; tenant gets read-only view
- WhatsApp notifications: OTP, daily reminder (if not yet submitted), settlement ready, selisih alert
- Public showcase page (kongsian.com) — static, hand-curated
- Audit log (who edited what when) — important for dispute resolution
- TZ: Asia/Jakarta (single zone, hard-coded for MVP)
- Currency: IDR, no decimals
- PDF export of weekly settlement (R2 storage)

Out (deferred):
- Multi-currency, multi-timezone
- Invoice / billing
- Multi-warehouse for brand
- Mobile app (PWA only, no native)
- Payment integration (settlement is recorded; transfer happens off-platform)

### Phase 2 — "Real SaaS" (Weeks 5-8)

- Tenant self-signup (today: brand invites only)
- Public tenant directory / discovery
- Configurable revenue split per partnership (not just default 70:30)
- Configurable pricing per partnership (not just brand-level price)
- Price-change-with-7-day-notice enforcement (system locks new price for 7 days after change)
- Dispute resolution thread (in-app chat per `SisaFisik` row)
- Brand analytics: SKU velocity, sell-through %, top tenants
- Tenant analytics: brand performance, weekly revenue trend
- Webhooks for partners (POS integration at cafes)
- Email fallback for OTP

### Phase 3 — "Platform" (Week 9+)

- Platform admin: brand approval queue, tenant approval, partnership moderation
- Subscription billing via Midtrans/Xendit (per-brand monthly fee)
- Multi-warehouse for brand (Titip from warehouse A vs B)
- Inventory forecasting
- Tax report (e-Faktur) export
- Public API + SDK
- Mobile native (Capacitor wrapper) — only if PWA is insufficient
- White-label: a brand can host under their own subdomain

---

## 3. Tech stack — PICK: **Astro 4 + Cloudflare Workers + D1 + Drizzle + Lucia**

**The pick, with conviction:**

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | **Astro 4** (server output mode, hybrid rendering) | Server-rendered HTML for non-tech cafe PICs (no JS bundle to download = fast on 3G), islands for interactivity (titip form, counters). Svelte/React would ship a 200KB JS payload for users on bad cafe WiFi. Astro ships 0KB by default. |
| Runtime | **Cloudflare Workers** | Free tier handles 100k req/day — enough for years. Sub-50ms cold start globally. |
| DB | **D1** (SQLite) | Relational is correct here (Brand ↔ Tenant ↔ SKU ↔ StockMovement is a many-to-many). D1 is included in Workers, $0 at this scale. Prisma-on-D1 is clunky and adds cold start; Drizzle is native. |
| ORM | **Drizzle ORM** | Edge-native, zero runtime, generates types from schema. Prisma's data proxy adds latency and is overkill. |
| Auth | **Lucia** (v3) | Best-in-class for edge. We extend `Auth` to use phone+OTP instead of email+password. Lucia handles session cookies, we handle OTP. |
| Validation | **Zod** | Same schemas on client + server. |
| Styling | **Vanilla CSS + Tailwind utilities** (via `@tailwindcss/typography` for admin docs page) | Cafe PICs need chunky tap targets, high contrast, no framework lock-in. Tailwind keeps CSS small. |
| Storage | **R2** | PDF settlement exports, brand logos. |
| Email | **Resend** (fallback OTP) | 1-line setup. |
| WhatsApp | **WA Cloud API** (Meta Business) | Official, reliable, ~$0.005/msg. Template messages pre-approved. |
| Cron | **Workers Cron Triggers** | Settlement generation Monday 00:00 WIB; daily reminder check 21:00 WIB. |
| Deploy | **Wrangler** + GitHub Actions | Push to `main` → preview deploy; tag → prod. |
| Analytics | **Cloudflare Web Analytics** (free, no consent banner) | Sufficient for MVP. |
| Monitoring | **Sentry** (free tier) | Edge runtime supported. |
| Test | **Vitest** (unit) + **Playwright** (e2e) | Vitest works in Workers test pool. |

**Why not Next.js?** App router + edge runtime + D1 is still rough. RSC is overkill for 5 pages. Bundle size on 3G matters here.

**Why not SvelteKit?** Excellent alternative — would pick it for a 2nd project. Astro is the right call because the marketing/showcase page is also Astro, and the team (Erwin + future contributors) is more likely to know React-ish mental models.

**Why not Supabase / Firebase?** Vendor lock-in. The whole point of multi-tenant SaaS is owning your data. D1 keeps it portable to any SQLite host.

**Repo structure:**

```
kongsian/
├── apps/
│   └── web/                    # Astro app
│       ├── src/
│       │   ├── pages/          # routes (file-based)
│       │   │   ├── index.astro        # public showcase
│       │   │   ├── login.astro        # WA OTP request
│       │   │   ├── verify.astro       # OTP verify
│       │   │   ├── (brand)/
│       │   │   │   ├── dashboard.astro
│       │   │   │   ├── skus.astro
│       │   │   │   ├── movements.astro
│       │   │   │   ├── tenants.astro
│       │   │   │   └── settlement.astro
│       │   │   ├── (tenant)/
│       │   │   │   ├── dashboard.astro
│       │   │   │   ├── closing.astro   # daily Terjual + Sisa Fisik
│       │   │   │   └── history.astro
│       │   │   └── admin/
│       │   │       ├── brands.astro
│       │   │       ├── tenants.astro
│       │   │       └── audit.astro
│       │   ├── components/
│       │   │   ├── islands/    # client:* components
│       │   │   └── static/     # server-rendered
│       │   ├── server/
│       │   │   ├── db/         # Drizzle schema + client
│       │   │   ├── auth/       # Lucia + OTP
│       │   │   ├── wa/         # WhatsApp sender
│       │   │   └── domain/     # business logic (settlement, selisih)
│       │   ├── lib/            # shared types, zod schemas
│       │   └── middleware.ts   # auth guard
│       ├── astro.config.mjs
│       ├── wrangler.toml
│       └── package.json
├── packages/
│   └── shared/                 # zod schemas, types, money utils
├── .github/
│   └── workflows/
│       └── deploy.yml
└── README.md
```

---

## 4. Architecture overview

```
┌─────────────┐     ┌─────────────────┐     ┌──────────────┐
│  Cafe PIC    │────▶│  Astro SSR      │────▶│  D1 (SQLite) │
│  (mobile)    │     │  (CF Worker)    │     │  Cloudflare  │
└─────────────┘     └────────┬────────┘     └──────────────┘
       │                     │
       │  ┌──────────────────┴──────────────────┐
       │  │  Domain layer (pure functions):     │
       │  │  - computeSisaSistem(mov, prev)     │
       │  │  - computeSelisih(sisaS, sisaF)    │
       │  │  - generateSettlement(week)         │
       │  │  - computeSplit(omzet, ratio)       │
       │  └────────────────────────────────────┘
       │
       │                     │
       ▼                     ▼
┌──────────────┐     ┌─────────────────┐
│  R2 (assets) │     │  WA Cloud API   │
│  (PDF, logo) │     │  (Meta)         │
└──────────────┘     └─────────────────┘
                            ▲
┌─────────────┐            │
│  Cron Jobs  │────────────┘
│  - 21:00    │
│  - Mon 00:00│
└─────────────┘
```

**Key architectural decisions:**

1. **Pure domain functions** for all math (selisih, settlement, split). Zero side effects. Trivially testable. This is the heart of anti-AI-slop: the business logic is in named, testable functions, not buried in route handlers.

2. **Stock Movement is append-only.** We never UPDATE a movement. If a brand or tenant submits wrong data, we issue a corrective movement. This gives us a complete audit trail and makes selisih disputes debuggable.

3. **Stok Awal is derived, not stored.** The current `stok_awal` for `(tenant_id, sku_id, day)` is `prev_stok_awal + sum(titip) - sum(tarik) - sum(terjual)`. We store daily snapshots in `stock_snapshot` for fast reads, but the source of truth is the movement log.

4. **Settlement is generated, not entered.** A Monday cron job creates `settlement` rows for the just-ended week. Brand approves (state transition). Tenant can read but not approve. This eliminates the "we forgot to settle" failure mode.

5. **TZ awareness is minimal in MVP.** All `day` fields are ISO date strings in `Asia/Jakarta`. Cron schedules use CF's `cron` syntax (UTC) but are offset to WIB (UTC+7) — e.g. Monday 00:00 WIB = Sunday 17:00 UTC.

---

## 5. What I'm explicitly NOT doing (and why this matters)

- **No AI in the product for MVP.** No LLM summarization, no "smart" anything. This is deliberate — every AI feature in a B2B tool either (a) needs a model API key with billing, or (b) hallucinates and destroys trust. A consignment tracker has no business doing AI in v1. (Eeveeon the agent is the *meta* showcase; the product itself is plain CRUD.)
- **No "extensibility" for tenants/brands to customize fields.** Hard-coded schema. YAGNI. Adds complexity for zero value.
- **No internationalization framework.** Bahasa Indonesia UI only. English in admin and code. Add i18n when there are paying users outside ID.
- **No social login.** WhatsApp OTP only. PICs don't have Google accounts at the cafe; they have phones.
- **No drag-and-drop SKU reordering.** Sort by created_at. Add a sort field later if anyone complains.
- **No real-time anything.** No websockets, no live updates. Cafe submits, brand sees on next page load. Cuts a huge category of bugs.

---

## 6. Acceptance criteria for MVP

The MVP is "done" when, on production:

- [ ] Hanniel can register via WA OTP
- [ ] Hanniel can create 3 SKUs (Double Choco, Strawberry, Tiramisu, all Rp42k)
- [ ] Hanniel can invite 2 tenants by phone number
- [ ] Both tenants get a WA invite and onboard via OTP
- [ ] On a Monday, Hanniel submits Titip=10 SKU A, B, C to Tenant 1
- [ ] Tenant 1 sees 10 units of each SKU on their dashboard
- [ ] That evening, Tenant 1 submits Terjual=4, Sisa Fisik=6 for SKU A
- [ ] System shows Sisa Sistem=6, Selisih=0
- [ ] If Tenant 1 submits Sisa Fisik=5, system shows Selisih=−1 and a WA goes to both brand and tenant
- [ ] Sunday 23:59: Settlement auto-generated with correct math
- [ ] Monday morning: Hanniel sees "Rp588.000 omzet, your share Rp411.600, tenant share Rp176.400, [Approve] button"
- [ ] Hanniel taps Approve; tenant gets WA confirmation
- [ ] Audit log shows every submission with timestamp, user, IP
- [ ] If Hanniel doesn't approve within 72h, admin (Erwin) gets a WA
- [ ] Site loads in <1s on 3G in Jakarta (verified with throttled DevTools)

When all 13 are green, the xlsx dies.

---

## 7. Next file

Continue to [`data-model.md`](./data-model.md) for the full schema.
