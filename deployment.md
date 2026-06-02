# Kongsian — Deployment

**Stack decision (committed)**: Cloudflare Workers + Pages + D1 + KV + R2. No alternatives evaluated — speed to ship at low cost wins. We can migrate later if scale demands it.

## Why Cloudflare

- Free tier covers pilot (10 brands, 50 cafes, ~100k req/mo)
- Global edge = fast for ID users
- D1 (SQLite) sufficient for transactional workload at pilot scale
- Workers KV for OTP + session, R2 for dispute photos
- One bill, one dashboard, one deploy

## Monorepo Structure

```
kongsian/
├── apps/
│   ├── web/              # Next.js on Cloudflare Pages
│   │   ├── app/          # App router
│   │   ├── components/
│   │   └── public/
│   └── api/              # Hono on Cloudflare Workers
│       ├── src/
│       │   ├── routes/   # /auth, /placements, /settlements, /wa
│       │   ├── middleware/
│       │   └── lib/
│       └── wrangler.toml
├── packages/
│   ├── db/               # Drizzle schema + migrations
│   │   ├── schema/
│   │   └── migrations/
│   ├── ui/               # Shared React components
│   ├── types/            # Shared TS types
│   └── config/           # ESLint, TSConfig, Tailwind
├── .github/
│   └── workflows/        # CI/CD
├── turbo.json            # Turborepo
└── pnpm-workspace.yaml
```

**Tooling**: pnpm + Turborepo, TypeScript strict, Vitest, Playwright.

## Environment Variables

| Var | Dev | Staging | Prod | Source |
|-----|-----|---------|------|--------|
| `ENV` | `development` | `staging` | `production` | wrangler.toml |
| `D1_DATABASE_ID` | local D1 | `d1-staging-xxx` | `d1-prod-xxx` | `wrangler secret` |
| `JWT_SECRET` | dev-only | rotated | rotated (90d) | `wrangler secret` |
| `OTP_HMAC_KEY` | dev-only | rotated | rotated (90d) | `wrangler secret` |
| `WA_PHONE_ID` | test number | test number | real number | `wrangler secret` |
| `WA_TOKEN` | Meta dev token | Meta test token | Meta prod token | `wrangler secret` |
| `R2_BUCKET` | local R2 (miniflare) | `kongsian-staging` | `kongsian-prod` | `wrangler.toml` |
| `KV_NAMESPACE_ID` | local | `kv-staging-xxx` | `kv-prod-xxx` | `wrangler.toml` |
| `APP_URL` | `http://localhost:3000` | `https://staging.kongsian.com` | `https://kongsian.com` | `wrangler.toml` |
| `LOG_LEVEL` | `debug` | `info` | `warn` | `wrangler.toml` |

**Rule**: secrets only via `wrangler secret put` or GitHub Actions encrypted secrets. Never in repo.

## CI/CD (GitHub Actions)

**Workflows:**

1. `.github/workflows/ci.yml` (on PR)
   - `pnpm install --frozen-lockfile`
   - `pnpm turbo lint typecheck test`
   - Playwright e2e (Chromium)
   - Coverage report (must be ≥ 70%)
   - Bundle size check (web < 500KB gzipped)

2. `.github/workflows/deploy.yml` (on push to `main`)
   - Run DB migrations on staging D1 via Drizzle
   - `wrangler pages deploy apps/web/dist --project-name=kongsian-staging`
   - `wrangler deploy --env staging` for api
   - Smoke test: `curl https://api-staging.kongsian.com/health`

3. `.github/workflows/release.yml` (on tag `v*`)
   - Run migrations on prod D1 (manual approval step)
   - Deploy to prod
   - Create GitHub release with changelog

**Approval gates**: prod deploy requires `environment: production` with required reviewers (Erwin + 1 other).

## D1 Migrations via Drizzle

```bash
# Generate migration
pnpm --filter @kongsian/db generate

# Apply locally
pnpm --filter @kongsian/db migrate:local

# Apply staging
wrangler d1 migrations apply kongsian-staging --remote

# Apply prod (gated)
wrangler d1 migrations apply kongsian-prod --remote
```

Migrations are append-only, reviewed in PR, applied in CI before deploy.

## Custom Domain

- **Primary**: `kongsian.com` (owned by Erwin, transfer to Cloudflare Registrar)
- **API**: `api.kongsian.com` (CNAME to Workers)
- **Staging**: `staging.kongsian.com`, `api-staging.kongsian.com`
- **Wildcard**: `*.kongsian.com` for future tenant subdomains (not used in MVP)

**Setup**: Cloudflare for SaaS, custom hostnames route to Pages/Workers.

## Observability

- **Workers Analytics Engine**: built-in, 7-day retention, free
- **Logpush**: ship Workers logs to R2 (30-day archive, IDR ~free)
- **Sentry**: errors only, free tier (5k events/mo) — sufficient for pilot
- **Uptime**: UptimeRobot free, 5-min check on `/health`

## Free Tier Cost Estimate (Pilot)

| Resource | Limit | Pilot usage | Cost |
|----------|-------|-------------|------|
| Workers requests | 100k/day | ~5k/day | $0 |
| Workers CPU | 10ms/req | avg 3ms | $0 |
| Pages requests | Unlimited | low | $0 |
| D1 reads | 5M/day | ~50k/day | $0 |
| D1 writes | 100k/day | ~2k/day | $0 |
| D1 storage | 5GB | ~200MB | $0 |
| KV reads | 100k/day | ~10k/day | $0 |
| KV writes | 1k/day | ~200/day | $0 |
| R2 storage | 10GB | ~1GB (photos) | $0 |
| R2 ops | 10M/mo | ~100k | $0 |
| Domain | — | `kongsian.com` | ~$10/yr |
| **Total** | | | **< $15/yr** |

When we hit 80% of any limit → alert via Workers Analytics → revisit.

## Environments Summary

| Env | URL | D1 | KV | R2 | Deploy trigger |
|-----|-----|----|----|-----|----------------|
| Local | `localhost:*` | local D1 | local | local | dev |
| Staging | `staging.kongsian.com` | `d1-staging` | `kv-staging` | `kongsian-staging` | push to `main` |
| Prod | `kongsian.com` | `d1-prod` | `kv-prod` | `kongsian-prod` | git tag `v*` |

## Rollback

```bash
# Pages
wrangler pages deployments list --project-name=kongsian-prod
wrangler pages deployments rollback --project-name=kongsian-prod

# Workers
wrangler rollback --env production
```

Keep last 3 deploys hot. DB migrations are forward-only — rollback means code-only revert; if schema breaks, manual SQL fix forward.

## Out of Scope (MVP)

- Multi-region failover (Cloudflare is global by default, good enough)
- Custom CDN rules
- SOC2 / ISO compliance (post-pilot)
- Status page (use UptimeRobot's free one)
