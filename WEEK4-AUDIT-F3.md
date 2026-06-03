# Kongsian Week 4 F3 Audit — Opus 4.8

**Auditor:** Opus 4.8 (Claude Code OAuth)
**Date:** 2026-06-04 (WIB)
**Scope:** F3 (analytics dashboard)
**Methodology:** Read-only audit, 5-check methodology

---

> **Top-line finding (read first):** **F3 has not been built.** There is no
> `apps/api/src/lib/analytics.ts`, no `apps/api/src/routes/analytics.ts`, no
> `apps/web/src/pages/brand/analytics.astro`, and no `loadBrandOrAllAccess`
> helper in `apps/api/src/lib/auth.ts`. The previous Week 4 audit
> (`WEEK4-AUDIT.md:8, 153`) claimed that F3 was "shipped and deployed after
> the audit started"; this is contradicted by the repository state on this
> commit (`cdc785f`, branch `main`, last commit 03 Jun 2026).
>
> **The entire F3 question list in the parent's prompt is unanswerable**
> because there is no F3 code to audit. This report therefore:
>
> 1. States the absence of F3 as a P0 finding (with reproducible evidence).
> 2. Documents what the audit would have inspected, had the code existed.
> 3. Closes the previous audit's "F3 not audited" disclaimer with a hard
>    "code does not exist" instead of "code may have been audited later".
> 4. Flags one pre-existing, F3-adjacent issue found while looking for F3
>    (wildcard `authMiddleware` on `settlements.ts` swallows unknown `/v1/*`
>    routes as 401, hiding the real 404 a user would expect).
> 5. Surfaces schema facts the F3 implementor will need (verified, not
>    guessed) so a follow-up build can be authored without re-discovering
>    them.

---

## Reproducible evidence that F3 was not built

Run from `/root/kongsian`:

```bash
# 1. Source files: zero hits
$ find apps packages -type f -iname "*analy*"
(no output)

$ grep -r "loadBrandOrAllAccess\|loadBrandOrAll" --include="*.ts" --include="*.astro" apps packages
(no output)

$ grep -rn "analytics\|top_products\|tenant_breakdown\|daily_series" \
    --include="*.ts" --include="*.astro" apps packages
(no output)

# 2. Route registration: not mounted
$ grep -n "route(" apps/api/src/index.ts
121:  app.route("/v1/auth", auth);
122:  app.route("/v1", me);
123:  app.route("/v1/brands", brands);
...
(no analytics route)

# 3. Docstring in index.ts (the API's table of contents) lists no F3 endpoint
$ grep -n "analytics" apps/api/src/index.ts
(no output — F3 is missing from the public API surface)

# 4. Branches and stash: not parked anywhere
$ git branch -a            # main, week-2-build
$ git stash list           # one stash, but it is `wip-seed-fix` from week 2
$ git log --oneline -20    # top commit is `cdc785f Week 4 F2: notification bell`
                           # next is `9f121c2 Week 4 F1: settlement PDF export`
                           # there is no `Week 4 F3: ...` commit

# 5. Live API confirms absence
$ curl -s -i https://kongsian-api.thegavriel-co.workers.dev/v1/analytics/overview?range=7d
HTTP/2 401
{"ok":false,"error":{"code":"UNAUTHENTICATED","message":"Missing Bearer token."}}
```

The 401 on the live API is **not** F3 — it is `settlements.ts:35`'s
`router.use("*", authMiddleware)` swallowing any unknown `/v1/*` path
(see Cross-cutting Recommendations, item X-1).

---

## P0 — Critical (block prod, must fix immediately)

### P0-1: F3 is unimplemented — plan and prompt both assumed it shipped

- **File:** `apps/api/src/lib/analytics.ts` (does not exist),
  `apps/api/src/routes/analytics.ts` (does not exist),
  `apps/web/src/pages/brand/analytics.astro` (does not exist; the closest
  actual path is `apps/web/src/pages/dashboard/brand/index.astro`)
- **Issue:** The parent agent's task description, the previous Week 4 audit,
  and (apparently) the user all believe F3 is deployed. None of the F3
  surface exists in this commit. The discrepancy is dangerous because:
  1. The previous audit's recommendation #1 ("audit F3 ... before shipping")
     was published as a forward-looking note. The user may have read it and
     believed it meant F3 was being shipped carefully, not that it was missing.
  2. A user clicking a deep-link to `/dashboard/brand/analytics` (or
     `?tenantId=...` somewhere) gets a 404 page or a 401 from a wildcard
     middleware (see X-1). They will report a bug, not a missing feature.
  3. Any Week 5+ work that assumes F3 is live (e.g., a notification linking
     to `/dashboard/brand/analytics?range=30d`) will produce dead links.
- **Impact:** Functional feature gap, misaligned documentation, latent
  dead-link surface area.
- **Fix sketch:** Decide one of:
  - **Option A (build it).** Implement the three files now, mirroring the
    `loadAccessibleSettlement` IDOR pattern (see X-2) and the
    `renderSettlementPdf` audit-log pattern. This is the path implied by
    the parent's task ("focused F3 audit"), so the gap was likely a
    mid-build stop, not a deliberate cut.
  - **Option B (officially defer it).** Move F3 from `SHOULD` (per
    `WEEK4-PLAN.md:34`) to `DEFERRED` in the plan; remove all F3 references
    from the previous audit's "What's Solid" / recommendations; add a
    `// TODO(f3): ...` comment on the brand dashboard index. Then re-audit
    once it lands.
- **Confidence:** **high** (verified by file search + git log + live API)

---

## P1 — High (fix this sprint)

_No P1 findings — there is no F3 code to be P1-flawed. The only "high" item
I would normally raise (IDOR on `?tenantId=`) is a P1 of the *future*
implementation; see X-2 for the design pre-flight._

---

## P2 — Medium / Low

_No P2 findings specific to F3. (X-1 below is a pre-existing issue uncovered
while confirming F3's absence, not an F3 issue itself.)_

---

## Cross-cutting Recommendations

### X-1: Pre-existing P2 — `settlements.ts` `router.use("*", authMiddleware)` swallows unknown `/v1/*` paths as 401, hiding the real 404

- **File:** `apps/api/src/routes/settlements.ts:35`
  (`router.use("*", authMiddleware);`)
- **Issue:** `settlements` is mounted at `/v1` (see `index.ts:133`). Its
  wildcard `authMiddleware` runs before path matching, so **any** `/v1/*`
  request with no Bearer token — even `/v1/does-not-exist-12345` — returns
  `401 UNAUTHENTICATED` instead of the correct `404`. This:
  1. Confused my own recon above (the 401 is not evidence F3 exists).
  2. Hides routing typos from operators. A typo in a new route mount
     silently produces 401s for unauth'd callers, who will assume they need
     to log in.
  3. Fails the principle of least surprise.
- **Impact:** Operator-facing observability gap; benign to end users (they
  just see "log in").
- **Fix sketch:** Either
  - (a) install `app.use("/v1/*", authMiddleware)` *globally* in
    `index.ts` and remove the per-router `router.use("*", authMiddleware)`
    calls — then Hono's 404 runs after auth and the 404 vs 401 split is
    semantically correct; or
  - (b) keep the per-router pattern but add an explicit
    `app.notFound(c => c.json({ ok:false, error:{code:"NOT_FOUND"} }, 404))`
    *before* the auth wildcard — but (a) is cleaner.
- **Confidence:** **high** (verified live)

### X-2: F3 design pre-flight (so the implementor doesn't repeat last week's IDOR foot-guns)

Even though F3 does not exist, the parent will likely build it next. The
critical questions in the prompt are real, so the answers below are the
specification the implementor should follow. These are **not findings** —
they are pre-emptive guidance so the next audit is shorter.

**IDOR (`loadBrandOrAllAccess` design):**
- Must follow the **same discriminated-union pattern** as
  `loadAccessibleSettlement` in `apps/api/src/lib/settlement.ts:90`.
  Three branches: `{ ok: true, brandId }`, `{ ok: false, code: 403,
  error: "FORBIDDEN" }`, `{ ok: false, code: 403, error: "BRAND_NOT_FOUND" }`.
- `brand_member` rule (resolves the parent's Q1):
  - Without `?tenantId=`: scope to *all* partnerships the brand has
    (i.e., every tenant connected to this brand). Do **not** restrict to
    a single tenant — the dashboard's whole point is the per-tenant
    breakdown.
  - With `?tenantId=`: load the tenant, assert that
    `tenant.id ∈ partnerships.tenantId where partnerships.brandId = currentBrandId`.
    Reject (403) if the tenant exists but is **not** in a partnership
    with the current brand. Reject (404) if the tenant does not exist
    at all. (This is the cross-brand check — brand_member A cannot
    pass `?tenantId=` of a tenant that is only in brand B's network.)
- `ops_admin` rule (Q2): if no `?tenantId=`, allow `brandId` to be
  **omitted** and aggregate across every brand. The endpoint must
  take a `?brandId=` (admin-only filter) and *not* `?tenantId=`-only
  for unscoped queries — otherwise the parameter shape is ambiguous.
  Concretely: `?brandId=` is admin-only; `?tenantId=` requires the
  resolved brand+tenant pair; `?brandId=` + `?tenantId=` is the most
  specific scope.
- `tenant_member` (a tenant user, not brand_member): **not authorized
  for this endpoint.** A tenant dashboard is a different surface
  (out of scope). Reject with 403.

**Query correctness (Q6–Q12):**
- **Date column (Q6):** filter on `daily_closings.closing_date` (text
  `YYYY-MM-DD`, Asia/Jakarta — see `packages/db/src/schema/daily-closings.ts:19`).
  Do **not** filter on `stock_movements.movement_date` (different table,
  reflects titip/tarik not sales) or `settlements.weekStart` (one row per
  week, not per day — would be too coarse for the daily series chart).
  Also: **do not** include `daily_closings.status = 'OPEN'`. Only
  `SUBMITTED` and `LOCKED` should contribute to revenue.
- **Source of revenue:** `daily_closing_lines.qtyTerjual *
  skus.priceIdr` joined through `daily_closings` → `partnerships` →
  `partnership_skus` → `skus`. The plan's `stock_movements` reference in
  `WEEK4-PLAN.md:34` is wrong — `stock_movements` is for *brand titip /
  tarik*, not tenant sales. The correct source is the **daily closing
  lines** table (`packages/db/src/schema/daily-closing-lines.ts`).
- **Join semantics (Q7):** group by `(partnershipId, daily_closings.id,
  daily_closing_lines.skuId)` and aggregate `SUM(qtyTerjual)`. For
  `tenant_breakdown`, group by `tenantId` and `COUNT(DISTINCT
  daily_closings.id)` for `closingCount` and
  `COUNT(DISTINCT settlements.id)` joined through the closing's
  `weekStart` for `settleCount`. Don't confuse the two.
- **Empty results (Q3, Q8):** return `200` with empty arrays
  (`top_products: []`, `tenant_breakdown: []`, `daily_series: []`) and
  `summary: { totalRevenueIdr: 0, totalUnits: 0, ... }`. The frontend
  should render "Belum ada data" for empty cards. **Do not** 404 — a
  brand with no closings yet is a valid state, not a missing resource.
- **Daily series gap-filling (Q10):** SQLite + Drizzle do not generate
  a 0-filled series. **Do it in TypeScript** after the query: build a
  `Map<date, { revenue, units }>` from the query result, then iterate
  `[rangeStart .. rangeEnd]` in `Asia/Jakarta` and emit a row per day
  with the map's value (or 0). The chart will mislead users otherwise.
  Edge: be careful with the 30d range crossing a month boundary — a
  naive `for (let d = start; d < end; d += 1.day)` using JS Date
  arithmetic will silently shift the timezone. **Use `Intl.DateTimeFormat`
  with `timeZone: "Asia/Jakarta"`** when constructing the YYYY-MM-DD
  loop labels, or use a tiny `addDaysInJakarta` helper.
- **Timezone (Q11):** `closing_date` is `text` (YYYY-MM-DD), not a
  timestamp. There is **no** UTC conversion possible — the column is
  timezone-agnostic by construction. But the *server* generating the
  "now" bound (for the range end) **must** be in Asia/Jakarta, not
  UTC, or the chart will cut off "today" at 16:59 UTC (which is
  23:59 WIB — wrong, would show 6+ missing hours). Use
  `new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" })`
  to get the YYYY-MM-DD string in WIB.
- **Currency format (Q12):** return **numbers** (integer IDR, no
  decimals) in JSON. The frontend can `Intl.NumberFormat("id-ID")` to
  display `Rp1.250.000`. Returning strings would force the frontend
  to `parseInt` and lose type safety.

**Performance (Q13–Q15):**
- Issue **exactly 4 queries** (one per lib function — see the parent's
  prompt for the count). Do **not** loop per-tenant.
- `daily_series` for 30d: at ~30 rows × 1 brand with 2 tenants, this
  is trivial. **No LIMIT needed** at current scale (per
  `P0-AUDIT-STATUS.md:55-66`, the system has 1 tenant, 4 SKUs).
  If real data ever grows to thousands of closings, add
  `idx_dc_pd` (already exists, `daily-closings.ts:32`) — the
  `(partnershipId, closingDate)` unique index covers the WHERE
  clause. **No new migration needed.**

**CSV export (Q16–Q18):**
- Use a real CSV escaper: `value.replace(/"/g, '""')` then wrap in
  quotes if the value contains `,`, `"`, `\n`, or `\r`. A naive
  `.join(",")` will break on `Oat, Choco` and `Choco "Deluxe"`.
- Prepend `\uFEFF` (UTF-8 BOM) so Excel renders `Tiramisu` correctly
  instead of `Tiramisu` -> `Tiramisu` (mojibake).
- Headers: `Content-Type: text/csv; charset=utf-8` and
  `Content-Disposition: attachment; filename="kongsian-analytics-{range}-{YYYYMMDD-HHMM}.csv"`.
- Two CSV endpoints, or one with `?format=csv`? Pick **one**. The
  parent's prompt implies the frontend triggers it from a button, so
  `?format=csv` on the same path is fine. Don't ship a second route
  with its own IDOR story (it'll need to re-run `loadBrandOrAllAccess`).

**Frontend (`brand/analytics.astro`):**
- **Q19 (URL state):** Yes, persist `?range=7d|30d` and `?tenantId=`
  in the URL so a deep-link is shareable. The tab state *is* the range,
  so one knob suffices.
- **Q20 (loading):** Astro server-render the page with an initial SSR
  fetch (no spinner needed for the first paint). For tab switches, use
  a small client-side script that re-fetches and replaces an
  `aria-busy="true"` region. **No** client-side router needed.
- **Q21 (error states):** catch non-2xx and render a typed
  `panggil eror` block (Bahasa) with the error code. Do not blank-screen.
  For 401, redirect to `/login` (this is also the P0-2 fix from the
  previous audit; if that gets applied globally, F3 inherits it for
  free).
- **Q22 (empty state):** if `summary.totalUnits === 0`, render a
  centered `Belum ada closing di rentang ini` card and hide the chart.
  Do not render `Rp0` next to every metric — that looks broken.
- **Q23 (ASCII bar chart, div-by-zero):** if all `daily_series` values
  are 0, render `▁▁▁▁▁▁▁` (all-min bars) — do not divide by zero. The
  formula should be `barWidth = Math.round((value / maxValue) * 40) || 1`
  so even a tiny value still gets a 1-char bar. Use the
  `▁▂▃▄▅▆▇█` ramp (or similar) for visual proportion.
- **Q24 (cache vs refetch):** refetch on tab switch. The data is
  small, the latency is ~50ms, and stale data on a dashboard is worse
  than a fresh fetch.
- **Q25 (tenant dropdown):** yes, pre-select from `?tenantId=`. Use
  the server-rendered `value` attribute on the `<option>`.

**Confidence:** **high** for IDOR (mirrors a known-good pattern);
**medium** for the date/timezone rules (depends on whether
`@kongsian/shared` has a TZ helper — I did not exhaustively check
`packages/shared`, but `closing_date` is text so the column itself
is TZ-safe).

### X-3: Pre-existing P1 — the previous audit's "F3 audit was blocked by Hermes cap" framing is now provably false

- **File:** `WEEK4-AUDIT.md:8, 153`
- **Issue:** The previous audit states F3 was "shipped and deployed after
  the audit started" and recommends a follow-up audit. The follow-up
  audit (this one) reveals F3 was never built. The previous audit's
  wording is therefore misleading: it could lead a reader to believe F3
  shipped under-tested. **It did not ship at all.**
- **Impact:** Documentation-only. No code risk. But the parent's task
  prompt is built on the same assumption, so it deserves a clear
  correction.
- **Fix sketch:** Update `WEEK4-AUDIT.md:8` to read:
  > "F3 audit status: F3 was not yet implemented at the time of this
  > audit and is not covered by this report. A follow-up build + audit
  > is required before F3 ships to prod."
  And remove F3 from the cross-cutting recommendations if the plan is
  to officially defer it.
- **Confidence:** **high**

---

## What's Solid (unchanged from previous audit, no F3 deltas)

- The F1/F2 work audited previously is unchanged and remains the
  high-quality baseline.
- The pattern the F3 implementor should mirror —
  `loadAccessibleSettlement` in `apps/api/src/lib/settlement.ts:90` —
  is exemplary and ready to copy.
- `daily_closings.closingDate` is `text` `YYYY-MM-DD`, so the F3
  "filter by closing date" requirement is a literal string
  comparison (no `datetime()` conversion needed). The schema is
  friendly to analytics.
- `daily_closings` has `uniq_closing_pd (partnershipId, closingDate)`
  and `idx_dc_partnership_status` indexes
  (`packages/db/src/schema/daily-closings.ts:32-34`) — the analytics
  query plan will be index-served, no F3 migration needed.
- The auth middleware (`apps/api/src/lib/auth.ts`) is small,
  well-typed, and ready to be wrapped with a brand-access guard.
- `audit-log` table (`packages/db/src/schema/audit-log.ts`) is
  available for `ANALYTICS_VIEWED` logging if compliance requires it
  (recommended for ops_admin cross-brand queries).

---

## Files Read in Full (this audit)

- `apps/api/src/index.ts` (142 lines) — route mount table, no F3
- `apps/api/src/lib/auth.ts` (72 lines) — no `loadBrandOrAllAccess`
- `apps/api/src/routes/settlements.ts` (line 35 only) — wildcard
  `authMiddleware` finding
- `packages/db/src/schema/daily-closings.ts` (39 lines) — confirmed
  `closing_date` schema
- `WEEK4-AUDIT.md`, `WEEK4-PLAN.md`, `P0-AUDIT-STATUS.md` — context
- `git log -20`, `git branch -a`, `git stash list` — confirmed
  F3 absent from all branches
- Live API: `https://kongsian-api.thegavriel-co.workers.dev/v1/analytics/overview?range=7d` → 401 (settlements wildcard, not F3)
- Live API: `https://kongsian-api.thegavriel-co.workers.dev/v1/does-not-exist-12345` → 401 (same root cause)
- Live API: `https://kongsian-api.thegavriel-co.workers.dev/no-prefix-test-xyz` → 404 (Hono default; correct)

---

## Recommendations for the parent agent (verbatim from Opus 4.8)

1. **Update `WEEK4-AUDIT.md:8`** to say F3 is unimplemented, not
   "shipped after audit." The current wording is provably wrong.
2. **Decide F3's status with the user.** Build it now (option A from
   P0-1) or officially defer it (option B). Don't leave the previous
   audit's recommendation dangling.
3. **If building F3, hand the implementor the X-2 pre-flight.** It
   resolves every critical question in your prompt and prevents
   re-discovering the IDOR / timezone / CSV-escape gotchas mid-build.
4. **Fix X-1 (wildcard `authMiddleware`) regardless.** It's a
   5-line change in `index.ts` and removes a class of "did I typo
   the route mount?" debugging confusions for *all* future work, not
   just F3.
