# Kongsian — Multi-Tenant Consignment Tracking SaaS

> Brand → Tenant (cafe) stock and revenue split, weekly settlement, WhatsApp-first auth for non-tech cafe PICs.

## Live

- **Showcase URL:** https://6891d9e0.kongsian-web.pages.dev
- **Owner:** Erwin (@erwin)
- **First user:** Hanniel (Han's Overnight Oats) — 2 cafe partners including padel-cafe
- **Showcase agent:** Eeveeon (portfolio)

## Tech Stack

- **Frontend:** Astro 4 (static site, deployed on CF Pages)
- **Edge / API:** Cloudflare Workers (apps/api)
- **Database:** Cloudflare D1 (SQLite)
- **ORM:** Drizzle (`packages/db`)
- **Auth:** Lucia (passwordless, email-OTP baseline; WhatsApp-OTP planned)
- **Shared types/validators:** `packages/shared` (zod)
- **UI primitives:** `packages/ui`
- **Assets:** Cloudflare R2 (planned)

## Monorepo Layout

```
kongsian/
├── apps/
│   ├── web/        # Astro 4 showcase + login
│   └── api/        # CF Worker — /api routes (Lucia + Drizzle)
├── packages/
│   ├── db/         # Drizzle schema + migrations
│   ├── shared/     # zod validators, shared types
│   └── ui/         # Shared UI primitives
├── package.json    # pnpm workspace root
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## Database

- **D1 Database ID:** `94a52c2f-af08-4642-b477-4edc2251f52b`
- **Migrations:** `packages/db/migrations/`
- **Initial migration:** `packages/db/migrations/0000_silent_valeria_richards.sql`
- **Schemas:** `packages/db/src/schema/` (tenants, brands, users, tenant_memberships, skus, stock_movements, settlements, settlement_lines, audit_log, …)

## Setup

```bash
# 1. Install deps (pnpm workspace)
pnpm install

# 2. Cloudflare auth
pnpm dlx wrangler login

# 3. Create D1 database (one-time)
pnpm dlx wrangler d1 create kongsian-db
# Copy the printed database_id into apps/api/wrangler.toml and apps/web/wrangler.toml

# 4. Apply migrations to D1 (local first, then remote)
pnpm --filter @kongsian/db exec wrangler d1 execute kongsian-db --local --file=./migrations/0000_silent_valeria_richards.sql
pnpm --filter @kongsian/db exec wrangler d1 execute kongsian-db        --file=./migrations/0000_silent_valeria_richards.sql

# 5. Dev
pnpm dev
```

## Scripts (root `package.json`)

| Script | Action |
|--------|--------|
| `pnpm dev` | Run all workspace dev servers in parallel |
| `pnpm build` | Build all workspaces |
| `pnpm deploy` | Deploy web (CF Pages) + api (CF Worker) via wrangler |

Per-app scripts: `pnpm --filter @kongsian/web dev|build|deploy` etc.

## Deployment (Cloudflare)

- `apps/web` → Cloudflare Pages (static Astro output)
  - `pnpm --filter @kongsian/web exec wrangler pages deploy dist`
- `apps/api` → Cloudflare Worker
  - `pnpm --filter @kongsian/api exec wrangler deploy`
- Custom domain: kongsian.com (TBD) — see `deployment.md`

## Week 1 Status (✅ shipped)

- [x] Monorepo scaffold (pnpm workspaces, TypeScript, tsconfig.base)
- [x] Drizzle schema for all MVP tables + initial migration
- [x] Astro 4 showcase page (Hero, ValueProp, Audiences, DashboardPreview, BrandDashboardMock, TenantDashboardMock, SettlementMock, Cta, Footer)
- [x] Login page (UI shell, awaiting WA-OTP integration)
- [x] API Worker skeleton (Lucia + Drizzle wired)
- [x] D1 database created and migration applied
- [x] Deployed to Cloudflare Pages (showcase live)

## Project Planning Docs (legacy — see Opus 4.7 design pass)

- **Owner:** Erwin (@erwin)
- **Domain:** kongsian.com (or .app) — TBD
- **Repo:** git@github.com:egavriel/kongsian.git

| # | File | Purpose |
|---|------|---------|
| 1 | [`README.md`](./README.md) | This index |
| 2 | [`implementation-plan.md`](./implementation-plan.md) | Exec summary, stack choice, MVP/Phase 2/3, architecture |
| 3 | [`data-model.md`](./data-model.md) | ER diagram (mermaid) + D1/Drizzle schemas with types |
| 4 | [`api-routes.md`](./api-routes.md) | All HTTP endpoints (REST) with auth/scope notes |
| 5 | [`user-flows.md`](./user-flows.md) | 3-actor flows with mermaid sequence diagrams |
| 6 | [`ui-wireframes.md`](./ui-wireframes.md) | Mobile text wireframes for every key screen |
| 7 | [`whatsapp-templates.md`](./whatsapp-templates.md) | OTP, reminder, settlement, dispute, edge-case messages |
| 8 | [`edge-cases.md`](./edge-cases.md) | Failure modes and how the system behaves |
| 9 | [`anti-slop-checklist.md`](./anti-slop-checklist.md) | Pre-launch verification list (15+ items) |
| 10 | [`deployment.md`](./deployment.md) | Cloudflare setup, CI/CD, domains, secrets |
| 11 | [`milestones.md`](./milestones.md) | 4-week roadmap with daily tasks |
| 12 | [`open-questions.md`](./open-questions.md) | 12-15 decisions Erwin must make before build |

## Reading order

1. `implementation-plan.md` — the 10-min version
2. `data-model.md` — what the DB looks like
3. `api-routes.md` — what the system can do
4. `user-flows.md` — how a day works
5. Everything else is reference

## Status

- [x] Plan written — 2026-06-02
- [ ] Stack confirmed
- [ ] Domain registered
- [ ] First deployment
