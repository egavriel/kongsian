# Kongsian Week 4 Audit (F0–F3) — Opus 4.8

**Auditor:** Opus 4.8 (Claude Code OAuth)
**Date:** 2026-06-04 (WIB)
**Scope:** F0 (cron+R2), F1 (PDF), F2 (bell), F3 (analytics — **not audited**, see note at end)
**Methodology:** Read-only audit, 5-check methodology per file (correctness, security, races, type-safety, integration)

> **F3 audit status:** Opus 4.8 ran out of tool-iteration budget before reading the F3 analytics files. F3 (`lib/analytics.ts`, `routes/analytics.ts`, `brand/analytics.astro`) was shipped and deployed *after* the audit started and is **not covered by this report**. A follow-up audit (or M3 self-audit) is required.

---

## P0 — Critical (block prod, must fix immediately)

### P0-1: Stale-cache window in PDF endpoint — TOCTOU between R2 put and DB update
- **File:** `apps/api/src/routes/settlements.ts:525-531`
- **Issue:** `await bucket.put(cacheKey, bytes, ...)` succeeds, but the subsequent `await db.update(...).set({ pdfR2Key: cacheKey })` is in a separate I/O operation with no transaction. If the DB update fails (transient D1 blip, Worker isolate drop), the next request sees `pdfR2Key !== cacheKey` (still NULL), re-renders, re-puts to R2 (idempotent — same key, overwrites cleanly), and re-updates DB. **Self-healing in practice**, so the failure mode is wasted CPU on the *next* request, not data corruption. The actual risk: if a *third* request fires between the R2 put succeeding and the DB update completing, two concurrent renders happen. Not catastrophic, but it's the only P0-adjacent issue I found in F1.
- **Impact:** Transient performance regression + duplicate audit log entries on race; no data corruption.
- **Fix sketch:** Wrap the put+update in `db.batch([...])` if Drizzle supports it on D1, or use a short-lived in-memory mutex keyed by settlement id. Lower-priority fix acceptable.
- **Confidence:** medium

### P0-2: Notification bell does not redirect to /login on session expiry
- **File:** `apps/web/src/components/NotificationBell.astro:184`
- **Issue:** On 401, the bell calls `stopPolling()` and shows nothing, but the user remains on the page. The rest of the page's other fetches will also start returning 401, but there's no global handler. The user can still click nav links, which will silently 401. They will not be auto-redirected to /login. Worse: a brand owner who loses session mid-shift won't know their approvals aren't being submitted.
- **Impact:** Silent failure of all subsequent API calls. Brand owner thinks their approve action worked; in reality, the 401 was swallowed by `.catch(() => ({}))` in page scripts (e.g., `apps/web/src/pages/dashboard/brand/settlements/[id].astro:201`).
- **Fix sketch:** In `fetchAndRender`'s 401 branch, also set `localStorage.removeItem("kongsian_session")` and `window.location.href = "/login"` (or use a custom event that a global handler picks up). Apply the same redirect-on-401 in the page-level scripts that swallow errors.
- **Confidence:** high

---

## P1 — High (fix this sprint)

### P1-1: `cron.ts` docstring contradicts the code (latent foot-gun)
- **File:** `apps/api/src/cron.ts:7`
- **Issue:** Docstring still says `"59 16 * * 0"` but the actual branch at line 206 is `"59 16 * * 7"` and `wrangler.toml:14` is also `"59 16 * * 7"`. The code is correct; the comment is stale. A future engineer reading only the top-of-file docstring could "fix" the code to match the comment, reintroducing the original P0 from the planning audit.
- **Impact:** None today. High risk of regression in Week 5+ when someone refactors.
- **Fix sketch:** Change line 7 to `"59 16 * * 7"` and the explanatory line to `"0..7 both accepted"`.
- **Confidence:** high

### P1-2: `formatIdr` cosmetic — negative-sign placement
- **File:** `apps/api/src/lib/pdf.ts:20-25`
- **Issue:** Returns `"-Rp1.250.000"`. Indonesian convention is usually `"-Rp 1.250.000"` (with space, or even "Rp -1.250.000"). Not strictly wrong; just inconsistent with the rest of the app's `Intl.NumberFormat("id-ID")` output which has spaces. Cosmetic only — settlements are never negative in practice, but defensive formatting matters.
- **Impact:** None in prod. Eyebrow raise on code review.
- **Fix sketch:** `return (n < 0 ? "-Rp " : "Rp") + withDots;` (add space after Rp).
- **Confidence:** low

### P1-3: PDF endpoint has no error handling around `renderSettlementPdf`
- **File:** `apps/api/src/routes/settlements.ts:515-522`
- **Issue:** `renderSettlementPdf` is a pure function but `pdf-lib` can throw on malformed data (extremely long brandName that overflows the page, special Unicode glyphs missing in Helvetica, etc.). The throw propagates to the generic Worker error handler, returns a 500 with no useful message, and writes nothing to the audit log. The user sees "Gagal (500)" from the frontend.
- **Impact:** Bad UX, no audit trail of the failure.
- **Fix sketch:** Wrap in try/catch, return `{ ok: false, error: { code: "PDF_RENDER_FAILED", message: String(err) } }` 500, and write an `auditLog` row with action `SETTLEMENT_PDF_FAILED`.
- **Confidence:** medium

### P1-4: NotificationBell hardcodes entity URL to brand side — tenant sees dead links
- **File:** `apps/web/src/components/NotificationBell.astro:115-123`
- **Issue:** `entityUrl()` returns `/dashboard/brand/settlements/${id}` for any `entityType: "settlement"` and `/dashboard/brand/closings` for any `daily_closing`. Tenants also receive `SETTLEMENT_READY`, `SETTLEMENT_APPROVED`, `SETTLEMENT_PAID`, and `CLOSING_SUBMITTED` notifications. A tenant clicking these gets bounced by the page-level auth check (good, no IDOR), but the UX is broken.
- **Impact:** Tenants see notification bell with clickable items that 404/bounce them.
- **Fix sketch:** Pass `role` from the server (notifications row should include a recipient role), or expose a per-tenant page (`/dashboard/tenant/settlements/${id}`) and pick URL by `globalRole` at fetch time.
- **Confidence:** high

### P1-5: Notification bell uses `document.querySelector` (singular) — only the first bell initializes
- **File:** `apps/web/src/components/NotificationBell.astro:86`
- **Issue:** `const root = document.querySelector("[data-nb]")` returns the *first* match. Currently no page has two bells, so this works. If a future page embeds the bell twice (e.g., a sidebar), only the first one polls and only the first badge updates.
- **Impact:** Latent bug. None today.
- **Fix sketch:** Use `document.querySelectorAll("[data-nb]")` and run init for each, or scope by an explicit `id` prop.
- **Confidence:** high

---

## P2 — Medium / Low (nice to fix, not blocking)

### P2-1: PDF endpoint does separate `brands` + `tenants` lookups after `loadAccessibleSettlement`
- **File:** `apps/api/src/routes/settlements.ts:463-472`
- **Issue:** `loadAccessibleSettlement` already returns the partnership. The endpoint then issues 2 more SELECTs to fetch brand and tenant names. Two extra round-trips per PDF render. On the cold-cache path this is 3 D1 queries before rendering.
- **Impact:** Latency on first PDF render (~50-100ms extra). Cache hits avoid this.
- **Fix sketch:** Extend `loadAccessibleSettlement` (or add a sibling helper) to return brand+tenant rows.
- **Confidence:** high

### P2-2: PDF response is buffered, not streamed from R2
- **File:** `apps/api/src/routes/settlements.ts:488-499`
- **Issue:** `const buf = await cached.arrayBuffer(); return new Response(buf, ...)`. The full PDF sits in memory. PDFs here are small (a few KB), so this is fine in practice. But streaming the R2 body directly is one line and is the idiomatic Workers pattern.
- **Impact:** None at current scale.
- **Fix sketch:** `return new Response(cached.body, { headers: { ... } });`
- **Confidence:** high

### P2-3: Bell popover doesn't refetch on subsequent open
- **File:** `apps/web/src/components/NotificationBell.astro:196-201`
- **Issue:** Only the FIRST click of the bell triggers a `fetchAndRender`. If the user opens the bell 10 minutes later, they see the 10-minute-old list.
- **Impact:** Minor staleness in dropdown.
- **Fix sketch:** Move `fetchAndRender()` outside the `if (willOpen)` branch.
- **Confidence:** high

### P2-4: Bell `data-nb-id` attribute not escaped (latent XSS risk if server changes)
- **File:** `apps/web/src/components/NotificationBell.astro:148`
- **Issue:** `data-nb-id="${n.id}"` — `n.id` is interpolated raw into a template literal that becomes an HTML attribute. Today `n.id` is a UUID generated server-side, so safe. If the schema is ever changed to allow user-controlled ids, this becomes attribute injection.
- **Impact:** None today.
- **Fix sketch:** Wrap with a small attr-escape: `String(n.id).replace(/"/g, "&quot;")`.
- **Confidence:** low (defensive)

### P2-5: `auditLog.afterJson` for PDF render stores `size: bytes.byteLength` (number)
- **File:** `apps/api/src/routes/settlements.ts:541`
- **Issue:** Minor — `JSON.stringify({ r2Key: cacheKey, size: bytes.byteLength })` works, but consistency with other rows in the file (which all use `JSON.stringify({...})` of simple objects) is fine. Just noting that `bytes` is `Uint8Array`; if it's ever passed to JSON.stringify directly, it'd be `{0: 80, 1: 75, ...}`. Not the case here.
- **Impact:** None.
- **Confidence:** high (no issue, just observation)

### P2-6: Notification bell stops polling on 401 but does not stop fetching from other page scripts
- **File:** `apps/web/src/components/NotificationBell.astro:184`
- **Issue:** If session expires, the bell correctly stops. But the rest of the page (e.g., brand/index, brand/settlements/index) has its own fetches that will also 401 and silently swallow the error. The user sees stale data and the bell stays at "0" forever.
- **Impact:** Same root cause as P0-2 but lower severity. Worth solving together.
- **Fix sketch:** Add a global `window.addEventListener("kongsian:unauthorized", ...)` that the bell and the page scripts both fire/handle.
- **Confidence:** high

### P2-7: PDF content-disposition uses `inline`; user expected download
- **File:** `apps/api/src/routes/settlements.ts:495, 551`
- **Issue:** Returns `inline; filename=...`. The frontend blob-handler (settlements/[id].astro:177-187) manually creates an `<a download>` and clicks it, which works regardless of the `inline` directive. But a user who pastes the API URL in a browser address bar will see the PDF *displayed*, not downloaded. For an internal admin tool this might be intended; flagging for confirmation.
- **Impact:** UX.
- **Fix sketch:** Use `attachment; filename=...` if download is desired.
- **Confidence:** low

### P2-8: Bell `readAll` click doesn't disable the link or show progress
- **File:** `apps/web/src/components/NotificationBell.astro:207-213`
- **Issue:** User can double-click "Tandai semua dibaca" and fire two `read-all` POSTs. Both are idempotent server-side, so safe. But the user has no feedback until the next render completes.
- **Impact:** Cosmetic.
- **Confidence:** high

### P2-9: F0 R2 binding — no R2 access policy documented
- **File:** `apps/api/wrangler.toml:38-41`
- **Issue:** No CORS / public-access configuration on the bucket. The settlement PDF endpoint does not expose R2 publicly (good — PDFs are gated by API auth). But the bucket's `preview_bucket_name = "kongsian-media-dev"` means local dev uses a separate bucket; if it's empty, the upload `stub: true` path activates. Worth documenting for the team.
- **Impact:** Onboarding confusion.
- **Confidence:** low

---

## What's Solid

- **F0 fix is correctly applied**: `cron.ts:206` and `wrangler.toml:14` both use `"59 16 * * 7"`. R2 binding is uncommented. Docstring is the only thing stale (P1-1).
- **F1 IDOR is correctly closed**: The PDF route calls `loadAccessibleSettlement` (line 459), which checks the caller is brand owner, tenant member, or platform admin. A brand_member from brand A *cannot* download brand B's settlement.
- **F1 PDF content correctness**: IDR formatting uses `Rp1.250.000` (no decimal, dot thousands) — matches the rest of the app. Bahasa Indonesia date names + months are correct. IDOR-safe.
- **F1 audit logging**: `SETTLEMENT_PDF_RENDERED` is written to `auditLog` on every fresh render. Good compliance.
- **F1 cache key design**: `pdf/settlements/{id}.pdf` is a UUID-keyed R2 object — no collision possible.
- **F1 `loadAccessibleSettlement`** is a clean reusable helper that the F1 route correctly reuses from Week 3.
- **F2 XSS hardening**: `escapeHtml` is applied to every server-controlled string that lands in the dropdown (title, body, fallback kind label). Emoji icons come from a static map, not the network.
- **F2 polling hygiene**: Pauses on `document.hidden`, stops on 401, doesn't leak listeners across `innerHTML` rewrites.
- **F2 auth**: Server-side `eq(notifications.userId, userId)` filter on every list/read/read-all — no cross-user leakage.
- **Auth middleware** (`apps/api/src/lib/auth.ts`) is correctly used in `notifications.ts:20`, `settlements.ts:35` (and the new PDF route inherits the router-level middleware).
- **The `loadAccessibleSettlement` helper** is exemplary — it returns a discriminated union and the routes handle the error branch in one line.
- **Drizzle patterns** are consistent across the new code (use of `and`, `eq`, `inArray`, `innerJoin`).
- **Audit log pattern** is followed in the new PDF render path (UUID, action code, entity, before/after JSON, IP, UA, timestamp).

---

## Recommendations for Week 5

1. **Audit F3 (analytics dashboard) and review the IDOR/tenantId question carefully** before shipping. The `loadBrandOrAllAccess` pattern is a NEW helper that doesn't exist yet — design it to mirror `loadAccessibleSettlement` so brand_member A cannot pass `?tenantId=` of brand B's tenant. The CSV export also needs proper escaping (`"`, `,`, `\n` in product names). A string-typed column in D1 (e.g., `sku.name = 'Oat, Choco "Deluxe"'`) will break a naive `csv.split(",")`.

2. **Adopt a global 401 handler**: Introduce a `window` event (`kongsian:unauthorized`) that every fetch consumer (page scripts + NotificationBell) dispatches and listens to. A single handler redirects to `/login` and clears the session. Closes P0-2 and P2-6 in one go. This pattern is also where you'll plug in CSRF-token refresh later.

3. **Add a minimal integration test harness** for the PDF endpoint and the cron. You have zero `.test.ts` files. A 30-line `wrangler dev` + `fetch` smoke test that hits `/v1/settlements/{seed-id}/pdf` and asserts `content-type: application/pdf` and a non-empty body would catch the F0-P0-style "never fires" bug forever. Run it on every deploy.

---

## Files Read in Full

`apps/api/wrangler.toml`, `apps/api/src/cron.ts`, `apps/api/src/lib/pdf.ts`, `apps/api/src/routes/settlements.ts`, `apps/api/src/routes/notifications.ts`, `apps/web/src/components/NotificationBell.astro`, `apps/web/src/pages/dashboard/brand/settlements/[id].astro`, `apps/web/src/pages/dashboard/brand/settlements/index.astro`, `apps/web/src/pages/dashboard/brand/index.astro`, `apps/web/src/pages/dashboard/tenant/index.astro`, `apps/web/src/pages/dashboard/tenant/closing.astro` (partial), `apps/api/src/lib/auth.ts`, `apps/api/src/lib/settlement.ts`, `apps/api/src/routes/uploads.ts`, `apps/api/src/index.ts` (partial), `packages/db/src/schema/settlements.ts`, `packages/db/migrations/0003_week3_dispute_messages.sql`, `astro.config.mjs`.
