# Kongsian — Anti-Slop Pre-Release Checklist

No "looks done" releases. Every box must be checked with a concrete verification method before tag.

## Checklist Table

| # | Category | Check | How to verify | Sev |
|---|----------|-------|---------------|-----|
| 1 | Auth | Tenant IDOR blocked | Try GET `/api/tenants/{id}` with another tenant's JWT → expect 403 | P0 |
| 2 | Auth | Brand can only see own placements | Cross-tenant placement GET → 403; add e2e test in Playwright | P0 |
| 3 | Auth | OTP rate limit (3/hour/number) | 4th request in 60min → 429; verify in Workers log | P0 |
| 4 | Auth | OTP expires in 10 min | Wait 11 min, submit valid code → 400; unit test with time-mock | P0 |
| 5 | Auth | JWT secret rotation works | Rotate in KV, redeploy, old tokens rejected; document runbook | P1 |
| 6 | Data | Atomic stock formula | Concurrency test: 100 parallel inputs → final stock = expected; SQL transaction test | P0 |
| 7 | Data | Settlement immutable post-approval | PATCH on approved settlement → 423 Locked; audit log entry created | P0 |
| 8 | Data | No negative stock on commit | Integration test: input Sisa_Fisik < 0 → 400 with reason code | P0 |
| 9 | Data | Money format always `Rp X.XXX` (Rp prefix, dot thousands, no decimals) | Snapshot test: render 1500000 → "Rp 1.500.000"; ICU MessageFormat | P0 |
| 10 | Data | All timestamps stored UTC, rendered in tenant TZ | DB check: `created_at` always TZ-aware; UI shows "10:30 WIB" | P0 |
| 11 | UX | Empty states designed (no blank pages) | Visit all dashboards with zero data → friendly illustration + CTA | P1 |
| 12 | UX | Loading states on all async actions | Network throttle 3G, click submit → spinner within 100ms | P1 |
| 13 | UX | Error messages are actionable | Force 5 errors; each says WHAT + HOW (e.g., "WA invalid. Format: 628xxx") | P1 |
| 14 | UX | Confirmation modal for destructive actions | Delete placement, cancel settlement → modal with typed-confirm for "delete" | P1 |
| 15 | Mobile | Viewport meta + no horizontal scroll on 360px | Chrome DevTools iPhone SE, scroll X — no overflow; Lighthouse mobile 90+ | P1 |
| 16 | Mobile | Touch targets ≥ 44px | Inspect all buttons on mobile view; Figma export check | P1 |
| 17 | Mobile | Forms work with native keyboard (numeric for cup counts) | `<input type="number" inputmode="numeric">` for quantity fields | P2 |
| 18 | WA | Messages under 1024 chars (template-safe) | Unit test: longest message < 1024; otherwise split | P1 |
| 19 | WA | Delivery confirmation tracked | Callback URL `/api/wa/callback` updates `wa_message.status`; dashboard shows "Delivered" | P1 |
| 20 | Performance | LCP < 2.5s on 3G | Lighthouse CI on Pages preview; budget in wrangler.toml | P1 |
| 21 | Performance | Workers cold start < 50ms | Tail log; p95 < 50ms for 1k req sample | P2 |
| 22 | Performance | D1 query p95 < 100ms | Workers Analytics query; alert if > 200ms | P1 |
| 23 | Security | CSRF token on all state-changing routes | POST without CSRF → 403; same-site cookies=Strict | P0 |
| 24 | Security | XSS: all user input escaped | DOMPurify on any HTML field; CSP header `default-src 'self'` | P0 |
| 25 | Security | SQL injection: all queries parameterized | Code review: no string concat in D1 queries; Drizzle ORM only | P0 |
| 26 | Security | API rate limit (100 req/min/IP) | Burst test from k6; 101st request → 429 | P1 |
| 27 | Security | Secrets never in client bundle | Build grep: no `WA_TOKEN`, `JWT_SECRET` in `apps/web/dist/`; CI fails if found | P0 |
| 28 | Security | HTTPS only, HSTS 1 year | `curl -I` shows HSTS; mixed-content test | P0 |
| 29 | Legal | GDPR/PII: WA numbers, names hashable for export | Test data export request flow; PII fields documented | P1 |
| 30 | Legal | Terms + Privacy links in footer | Visual check; click both → real pages, not 404 | P1 |
| 31 | Legal | Data retention: 2-year auto-purge of settlements | Cron test: insert 3-year-old row, run purge, verify deleted | P1 |
| 32 | Legal | Cookie consent banner (ID + EN) | First visit shows banner; reject = no analytics | P1 |
| 33 | Offline | Service worker caches last dashboard | DevTools offline, reload → cached view loads; sync queue intact | P1 |
| 34 | Offline | IndexedDB queue persists across tab close | Submit offline, close tab, reopen, reconnect → input syncs | P1 |
| 35 | Observability | All API calls log to Workers Analytics | Tail 100 req, every line has `request_id`, `tenant_id`, `latency_ms` | P1 |
| 36 | Observability | Error events tagged to Sentry/Datadog | Trigger 5xx, see event with stack + context | P1 |
| 37 | Observability | Audit log for all write ops | DB check: every INSERT/UPDATE has `audit_log` row with actor | P0 |
| 38 | Payment | Settlement receipt PDF/PNG generated | E2E: approve settlement → receipt downloadable; valid Rp format | P0 |
| 39 | Payment | Payment proof upload (transfer screenshot) | R2 upload test; image < 2MB; preview shows | P1 |
| 40 | Dispute | Dispute photo upload works on slow 3G | Network throttle 1Mbps, upload 1.5MB photo → success with progress | P1 |
| 41 | Idempotency | All POSTs accept Idempotency-Key | Send same key twice → 1 row created, second 200 with same id | P0 |
| 42 | A11y | Font size ≥ 16px body, ≥ 14px secondary | DevTools inspector; axe-core scan passes | P2 |
| 43 | A11y | Color contrast ≥ 4.5:1 (text) | axe-core + manual check on brand colors | P2 |
| 44 | A11y | Keyboard nav: tab through all forms | No focus traps; visible focus ring | P2 |
| 45 | Testing | Unit test coverage ≥ 70% | Vitest coverage report in CI; fail if < 70% | P1 |
| 46 | Testing | E2E happy path green on Chromium + WebKit | Playwright CI on 2 browsers | P1 |
| 47 | Deploy | Staging + prod envs isolated | Deploy to staging, hit `staging.kongsian.com`, verify separate D1 | P0 |
| 48 | Deploy | Rollback plan: keep last 3 deploys | `wrangler rollback` documented; tested in staging | P1 |

## Categories Roll-up

- **P0 (release blocker)**: 1, 2, 3, 4, 6, 7, 8, 9, 10, 23, 24, 25, 27, 28, 37, 38, 41, 47
- **P1 (should fix)**: 5, 11, 12, 13, 14, 15, 16, 18, 19, 20, 22, 26, 29, 30, 31, 32, 33, 34, 35, 36, 39, 40, 45, 46, 48
- **P2 (nice to have)**: 17, 21, 42, 43, 44

## Definition of Done

- [ ] All P0 checks green
- [ ] All P1 checks green or explicitly deferred with ticket
- [ ] P2 tracked in backlog
- [ ] Sign-off: founder + lead eng
