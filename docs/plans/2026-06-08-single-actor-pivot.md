# Single-Actor Pivot — Implementation Plan

> **For Hermes (M3):** This plan is shaped for the subagent-driven-development skill, but Erwin is single-user + single-agent here, so M3 implements it task-by-task, verifying on disk (P1) between each.

**Goal:** Let Ervina (brand owner) run the full Titip → Tarik → Closing → Settlement cycle alone on her phone, by reshaping the brand-side UI around a "Daily Ops" combined input form. The data model and partnership records stay unchanged. Cafe-partner invite flow stays parked.

**Architecture:** Brand-side dashboard gains a "Catat Hari Ini" hub with one combined form (date + cafe + 3 sections stacked: Titip / Tarik / Terjual + Save). Each section calls the canonical `POST /v1/movements/batch` (Titip/Tarik) or the existing tenant-scoped `POST /:tenantId/.../closings/:date/terjual` + `/submit` (Terjual) — after small API loosening (Task 0). Idempotency keys are deterministic per (kind, partnership, date), sent in the **body** (`batchIdempotencyKey` for batch, `idempotencyKey` for single) — the server does **not** read the `Idempotency-Key` header. A "Stok tersisa" widget on the dashboard reads `GET /v1/movements/sisa-sistem` per partnership.

**Tech Stack:** Astro 4 (frontend), Hono (API), Cloudflare Workers + D1 (storage), `pnpm` workspaces, `wrangler` for deploys, `dev` env worker (`kongsian-api-dev`) for testing.

---

## Plan revision history

**v2 (2026-06-08, post-M3 review):** Caught 6 critical bugs in v1 that would have failed at runtime. See "Investigation findings — corrections to Opus's v1 claims" below. Added Task 0 (API gate loosening) and corrected Tasks 2, 5. **v1's T5 was unshippable as written.**

## Investigation findings (verified 2026-06-08)

Opus 4.8 (Claude Code OAuth) ran the investigation pass; key findings, all re-verified:

1. **Closings page bug is a JS field-path bug, not a table name issue.** `dashboard/brand/closings/index.astro:81` reads `me.data?.brand?.id` (undefined), but `getRole()` (`apps/api/src/routes/brands.ts:79`) returns flat `data.brandId`. The actual API route exists at `apps/api/src/routes/closings.ts:1-18` (`GET /v1/brands/:brandId/closings`). One-line fix.

2. **The existing new-titip form is silently broken.** It POSTs to `/v1/brands/:id/partnerships/:pid/movements/titip` (`new-titip.astro:208,228`) — that route does not exist. The canonical endpoint is `POST /v1/movements/batch` (`apps/api/src/routes/movements.ts:182` single, `:batch` plural). The 404 fallback at `:223` re-posts to the same non-existent URL, so titip submissions all silently 404 today. **Verify on disk first per P1.**

3. **new-tarik page doesn't exist** — referenced in `dashboard/brand/index.astro:117` and `dashboard/brand/movements/index.astro:60` (as the "+ Tarik" button) but no `new-tarik.astro` file in `dashboard/brand/movements/`.

4. **Brand users are NOT blocked from submitting `TERJUAL_*` movements.** `apps/api/src/routes/movements.ts:194` only gates `TENANT` (line: `if (access.role === "TENANT" && ...)`). The `assertPartnershipAccess` helper at `:79-108` returns `{ ok: true, role: "BRAND" }` for the partnership's brand owner, which then skips the tenant block. So the brand-side Terjual form CAN hit `/v1/movements/batch` with `kind: "TERJUAL_OPENING"`.

5. **Settlements read from `daily_closings` (tenant-only workflow), NOT from `stock_movements`.** The cron derives weekly revenue from `daily_closings` joined to `daily_closing_lines.terjual` where status is `SUBMITTED` or `LOCKED`. A closing left `OPEN` (terjual entered, never submitted) is INVISIBLE to settlement. **Two viable paths** for the single-actor pivot:
   - **T4a (recommended, frictionless):** Have the Daily Ops form's "Terjual" section call the existing tenant-scoped `POST /:tenantId/.../closings/:date/terjual` + `POST .../submit` endpoints. **REQUIRES Task 0** (API gate loosening — see below) to allow BRAND role. Zero schema change, zero new API endpoint.
   - **T4b (YAGNI-avoid):** Wire settlement to derive from `stock_movements` too. This is a bigger surgery and risks double-counting. Skip for now.

   The plan uses T4a + Task 0.

6. **Settlement cron runs `59 16 * * 7` UTC (Sun 23:59 WIB)**, processes last completed Mon–Sun, every ACTIVE partnership, no input. Only `SUBMITTED`/`LOCKED` closings count; zero-closing → `NO_CLOSINGS` status. **A Daily Ops form that fills Terjual but doesn't call `/submit` will not generate settlement rows.** The submit endpoint is at `POST /v1/admin/settlements/generate` per settlements.ts:435 (cron or admin).

7. **Idempotency is in the BODY, not the HTTP header.** `BatchSchema` (movements.ts:53-68) requires `batchIdempotencyKey` in the body; handler (`:263`) does `\`${v.batchIdempotencyKey}-${item.skuId}\``. The single-movement `MovementSchema` (`:42-51`) requires `idempotencyKey` in the body too. The server does NOT read an `Idempotency-Key` header (auth middleware at `lib/auth.ts` only reads `Authorization`). **v1's T2/T5 sending `Idempotency-Key: titip-...` in the header was wrong — header is ignored, body field missing → handler reads `undefined`, key becomes `-<skuId>` for all items → idempotency breaks. CORRECTED in v2 Tasks 2 and 5.**

8. **Terjual body field is `terjual`, not `qty`.** `TerjualSchema` (closings.ts:89-91) is `{ lines: [{ skuId, terjual }] }`. v1's T5 sending `{ skuId, qty }` was wrong — would 400 with INVALID_INPUT. CORRECTED in v2 T5.

9. **OTP paste UX (P12) applies to qty inputs.** WhatsApp-pasted quantities come wrapped in formatting (`*12*`, `12 pcs`, `12,`). Strip non-digits on `input` event for every numeric field, same pattern as commit `2a73e6b` / `d908ca2`.

10. **Tenant-scoped closings URL** is mounted at `/v1/tenants/:tenantId/...` (per `closings.ts:5-12` docblock + `index.ts:54` import). The Daily Ops form must look up the partnership's `tenantId` from `/v1/brands/:brandId` response — confirmed: `partnerships: [{...partnership, tenant: tenants}]` (`brands.ts:160-175`), so `partnership.tenant.id` is available. Pass the tenantId into the Terjual save calls.

11. **Auth gate PENDING_VERIFICATION** is already auto-`VERIFIED` for trial (commit `5086f47`). OTP rate limit already disabled (commit `85904d1`). No new auth work needed.

## Investigation findings — corrections to Opus's v1 claims (M3 caught)

**C1 (CRITICAL — v1 T5 would have hit 403):** `closings.ts` lines 204, 305, 383, 464, 530 each have:
```ts
if (access.role !== "TENANT") return c.json({ ok: false, error: { code: "TENANT_ONLY" } }, 403);
```
on every tenant-scoped POST (create closing, upsert terjual, upsert sisa-fisik, add photo, submit). v1's claim that "assertPartnershipAccess already allows BRAND role" was true at the helper layer, but the handlers then check `access.role !== "TENANT"` on top. **Brand user gets 403 on every closing write.** Fix: Task 0 loosens these gates to `!== "TENANT" && !== "BRAND"`.

**C2 (CRITICAL — v1 T5 would have hit 422 PHOTO_REQUIRED):** `closings.ts:550-551`:
```ts
if (photos.length === 0) return c.json({ ok: false, error: { code: "PHOTO_REQUIRED" } }, 422);
```
Submit requires ≥1 photo. v1's Daily Ops form did not upload any photo. Fix: Task 0 removes this check for the trial; real photo enforcement re-added post-trial.

**C3 (CRITICAL — v1 T2/T5 idempotency silently broken):** See finding #7 above. v1 sent `Idempotency-Key` header; server reads from body. Server computed `\`${undefined}-${skuId}\`` = `"-skuId"` for every call → idempotency keys collided across SKUs. Fix: v2 sends `batchIdempotencyKey` in body for batch endpoint, `idempotencyKey` in body for single endpoint.

**C4 (CRITICAL — v1 T5 Terjual would 400 INVALID_INPUT):** See finding #8 above. v1 sent `qty`; server expects `terjual`. Fix: v2 sends `terjual`.

**C5 (UX GOTCHA — v1 T5 would 400 for dates > 7 days old):** `isValidClosingDate` (closings.ts:73-79) restricts closing dates to today + past 7 days. If Ervina tries to record a closing for last Wednesday on the following Thursday, the form silently fails. Fix: Task 0 widens to past 30 days.

**C6 (DATA INCONSISTENCY — out of scope but worth flagging):** The brand dashboard's "Omzet minggu ini" stat (index.astro:243-260) derives from `GET /v1/movements` (TERJUAL_OPENING rows summed). The settlement report (Sundays, cron-derived) derives from `daily_closings` joined to `daily_closing_lines.terjual`. These two numbers will differ because the cron only counts SUBMITTED closings, while movements are immediate. For the single-actor pivot where Ervina is the sole submitter, the numbers should match. **Add to pitfalls so she isn't confused if they differ.**

---

## Tasks (sequential)

### Task 0: Loosen closings API gates for the single-actor trial

**Objective:** Remove the three tenant-only gates on the closings endpoints so the brand owner can drive the full Titip → Tarik → Closing → Submit cycle alone. This is a server-side change in `apps/api/src/routes/closings.ts` only. No schema, no auth, no other routes.

**Files:**
- Modify: `apps/api/src/routes/closings.ts` (5 one-line gate changes + 1 helper + 1 date-range change)

**The 6 changes (all surgical):**

**Change A — line 204 (create draft closing), replace:**
```ts
  if (access.role !== "TENANT") return c.json({ ok: false, error: { code: "TENANT_ONLY" } }, 403);
```
**with:**
```ts
  if (access.role !== "TENANT" && access.role !== "BRAND") return c.json({ ok: false, error: { code: "FORBIDDEN" } }, 403);
```

**Change B — line 305 (upsert terjual), same replacement.**

**Change C — line 383 (upsert sisa-fisik), same replacement.** (We still need the form to optionally update sisaFisik from the brand side, since the Daily Ops form does not call this endpoint — keep the gate loosening for future use.)

**Change D — line 464 (add photo), same replacement.**

**Change E — line 530 (submit), same replacement.**

**Change F — line 550-551 (PHOTO_REQUIRED), replace the entire `if (photos.length === 0)` block with:**
```ts
  // Trial: brand owner = sole actor, photo skipped. Re-enable post-trial.
  if (false && photos.length === 0)
    return c.json({ ok: false, error: { code: "PHOTO_REQUIRED", message: "At least one photo is required." } }, 422);
```
The `false &&` keeps the check as dead code that we can flip back to `true` after the trial. Add a `// TODO(trial): re-enable PHOTO_REQUIRED after real cafe partners onboard` comment on the line above.

**Change G — `isValidClosingDate` (lines 73-79), replace the body with:**
```ts
function isValidClosingDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const today = new Date().toISOString().slice(0, 10);
  const pastWindow = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return date >= pastWindow && date <= today;
}
```
Changed from 7 days to 30 days. Future dates still rejected.

**Step 1: Verify on disk**
```bash
grep -n "TENANT_ONLY\|PHOTO_REQUIRED\|sevenDaysAgo\|pastWindow" apps/api/src/routes/closings.ts
```
Expected:
- 5 occurrences of `if (access.role !== "TENANT" && access.role !== "BRAND")` (at the original 5 line numbers)
- 1 occurrence of `false && photos.length === 0`
- 1 occurrence of `30 * 24 * 60 * 60` in `pastWindow`
- Zero occurrences of `if (access.role !== "TENANT") return` without the `&& access.role !== "BRAND"` clause

**Step 2: Typecheck**
```bash
cd /root/kongsian
pnpm --filter @kongsian/api typecheck
```
Expected: 0 errors.

**Step 3: Curl smoke — brand can now create a closing**
```bash
# Get a brand session token via OTP (dev worker):
curl -s -X POST "https://kongsian-api-dev.thegavriel-co.workers.dev/v1/auth/otp/request" \
  -H "Content-Type: application/json" \
  -d '{"phone":"+628****0001","purpose":"LOGIN"}'
# Extract devCode, then verify to get sessionToken

# Get the brand's first ACTIVE partnership + its tenantId
SESSION=...; BRANDID=...
PID=$(curl -s "https://kongsian-api-dev.thegavriel-co.workers.dev/v1/brands/$BRANDID" \
  -H "Authorization: Bearer *** | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['partnerships'][0]['id'])")
TID=$(curl -s "https://kongsian-api-dev.thegavriel-co.workers.dev/v1/brands/$BRANDID" \
  -H "Authorization: Bearer *** | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['partnerships'][0]['tenant']['id'])")

# Create draft closing (should now succeed, not 403)
curl -s -X POST "https://kongsian-api-dev.thegavriel-co.workers.dev/v1/tenants/$TID/partnerships/$PID/closings" \
  -H "Authorization: Bearer *** \
  -H "Content-Type: application/json" \
  -d '{"closingDate":"2026-06-08"}'
```
Expected: `{ ok: true, data: { closing: { ..., status: "OPEN" } } }`. Pre-Task-0 this returned 403 TENANT_ONLY.

**Step 4: Deploy dev + verify on prod-of-dev**
```bash
cd /root/kongsian/apps/api
pnpm exec wrangler deploy --env dev
```
Curl the same POST again — should succeed.

**Commit:**
```bash
git add apps/api/src/routes/closings.ts
git commit -m "feat(closings): allow BRAND role on tenant-scoped POSTs (single-actor trial)"
```

---

### Task 1: Fix the closings page brandId bug

**Objective:** `dashboard/brand/closings/index.astro` reads the wrong field path from `/v1/brands/me` and silently shows "Brand tidak ditemukan."

**Files:**
- Modify: `apps/web/src/pages/dashboard/brand/closings/index.astro:81` (and `:77` for consistency)

**Step 1: Read the current line**
The script block (line 80) does:
```js
let brandId = null;
const me = await jget("/v1/brands/me");
if (me.ok && me.data?.brand?.id) brandId = me.data.brand.id;
else { showErr("Brand tidak ditemukan."); listEl.innerHTML = ""; }
```

**Step 2: Patch to the correct field path**
Replace the snippet above with:
```js
let brandId = null;
const me = await jget("/v1/brands/me");
if (me.ok && me.data?.brandId) brandId = me.data.brandId;
else { showErr("Brand tidak ditemukan."); listEl.innerHTML = ""; }
```

**Step 3: Verify on disk**
```bash
grep -n "brandId\|brand?.id" apps/web/src/pages/dashboard/brand/closings/index.astro
```
Expected: only the new `me.data?.brandId` reference, no `brand?.id` left.

**Step 4: Curl smoke**
```bash
# With a dev session token
curl -s "https://kongsian-api-dev.thegavriel-co.workers.dev/v1/brands/me" \
  -H "Authorization: Bearer <sessionToken>" | python3 -m json.tool
```
Expected: `data.brandId` is a non-empty string, not nested under `data.brand`.

**Step 5: Deploy dev, then UI check**
```bash
cd /root/kongsian/apps/web
PUBLIC_API_URL=https://kongsian-api-dev.thegavriel-co.workers.dev \
  pnpm exec astro build && \
  pnpm exec wrangler pages deploy ./dist --project-name=kongsian-web --commit-dirty=true
```
Open `https://kongsian-web.pages.dev/dashboard/brand/closings` (login first if needed) — should show the "Belum ada closing" empty state, not the "Brand tidak ditemukan" error.

**Commit:**
```bash
git add apps/web/src/pages/dashboard/brand/closings/index.astro
git commit -m "fix(closings): read brandId from /v1/brands/me correctly"
```

---

### Task 2: Fix the new-titip form's broken POST URL + idempotency key

**Objective:** The existing titip form posts to a non-existent endpoint and uses a random uuid() idempotency key (double-Save bug).

**Files:**
- Modify: `apps/web/src/pages/dashboard/brand/movements/new-titip.astro:208-244` (the submit handler)

**Step 1: Confirm the canonical endpoint**
```bash
grep -n "router\.\(get\|post\)\|app\.\(get\|post\)" /root/kongsian/apps/api/src/routes/movements.ts
```
Expected: `router.post("/", ...)` at `:182` (single) and `router.post("/batch", ...)` (batch). No `/titip` subroute exists.

**Step 2: Replace the POST call**
Replace the body of the click handler from `document.getElementById("submit-btn").addEventListener("click", async () => {` through the catch block with:

```js
document.getElementById("submit-btn").addEventListener("click", async () => {
  errEl.style.display = "none"; okEl.style.display = "none";
  if (!state.partnershipId) { showErr("Pilih partnership dulu."); return; }
  const date = document.getElementById("date").value;
  if (!date) { showErr("Tanggal wajib."); return; }
  const rows = document.querySelectorAll("#sku-section input[data-sku]");
  const items = [];
  for (const inp of rows) {
    const v = parseInt((inp.value || "0").replace(/\D/g, ""), 10) || 0;
    if (v > 0) items.push({ skuId: inp.dataset.sku, kind: "TITIP", qty: v });
  }
  if (items.length === 0) { showErr("Isi minimal 1 SKU dengan qty > 0."); return; }

  const btn = document.getElementById("submit-btn");
  btn.disabled = true; btn.textContent = "Menyimpan…";
  try {
    // Deterministic idempotency key — server suffixes -<skuId> per row.
    // Goes in BODY (not header) per BatchSchema in movements.ts:53-68.
    const batchIdempotencyKey = `titip-${state.partnershipId}-${date}`;
    const r = await fetch(API + "/v1/movements/batch", {
      method: "POST",
      headers: { ...authH },
      body: JSON.stringify({
        partnershipId: state.partnershipId,
        movementDate: date,
        items,
        batchIdempotencyKey,
        fotoR2Key: uploadedFotoUrl || undefined,
      }),
    });
    const json = await r.json().catch(() => ({}));
    if (r.ok && json.ok) {
      showOk(`Berhasil: ${items.length} SKU dititipkan.`);
      setTimeout(() => { window.location.href = "/dashboard/brand/movements"; }, 800);
      return;
    }
    showErr("Gagal: " + (json?.error?.code || `HTTP ${r.status}`));
  } catch (e) {
    showErr("Tidak bisa konek ke server.");
  } finally {
    btn.disabled = false; btn.textContent = "Simpan Titip";
  }
});
```

**Key v2 corrections:**
- `batchIdempotencyKey` is in the **JSON body**, NOT the `Idempotency-Key` header. Server reads body.
- No more `Idempotency-Key` header (it's silently ignored).

**Step 3: Add input stripping helper (P12)**
Insert just below the `fmtRp` function definition:
```js
function attachQtyStrip() {
  document.querySelectorAll("#sku-section input[data-sku]").forEach(el => {
    el.addEventListener("input", () => {
      const cleaned = el.value.replace(/\D/g, "").slice(0, 4);
      if (el.value !== cleaned) el.value = cleaned;
    });
  });
}
```
Then call `attachQtyStrip();` at the end of `renderSkus()` (right after `document.getElementById("submit-btn").disabled = false;`).

**Step 4: Verify on disk**
```bash
grep -n "/v1/movements\|Idempotency-Key\|batchIdempotencyKey\|kind: \"" apps/web/src/pages/dashboard/brand/movements/new-titip.astro
```
Expected:
- `"/v1/movements/batch"` (correct endpoint)
- `batchIdempotencyKey:` in body (NOT a header line)
- `kind: "TITIP"` per item
- No `movements/titip` path
- No `"Idempotency-Key"` header (grep should NOT find it on its own line — if it appears, it's a bug)

**Step 5: Curl smoke (dev env)**
```bash
SESSION=<token>
PID=<partnershipId>
SKU=<skuId>
# First call — should insert
curl -s -X POST "https://kongsian-api-dev.thegavriel-co.workers.dev/v1/movements/batch" \
  -H "Authorization: Bearer *** \
  -H "Content-Type: application/json" \
  -d "{\"partnershipId\":\"$PID\",\"movementDate\":\"2026-06-08\",\"items\":[{\"skuId\":\"$SKU\",\"kind\":\"TITIP\",\"qty\":3}],\"batchIdempotencyKey\":\"titip-$PID-2026-06-08\"}"
```
Expected: `{ ok: true, data: { movementIds: [<id>], count: 1 } }`. Repeat with the exact same `batchIdempotencyKey` — server should dedupe via `${batchIdempotencyKey}-${skuId}` collision check, return same movementIds, NOT insert a duplicate. Verify with:
```bash
cd /root/kongsian/apps/api
pnpm exec wrangler d1 execute kongsian-db --remote --command "SELECT COUNT(*) as cnt FROM stock_movements WHERE idempotency_key = 'titip-$PID-2026-06-08-$SKU'"
```
Expected: `cnt = 1`, not 2.

**Step 6: Deploy + UI test**
Same deploy command as Task 1. Open the titip form on mobile, fill 1 SKU qty=3, hit Save twice quickly — verify exactly 1 row in `/v1/movements?partnershipId=...` (not 2).

**Commit:**
```bash
git add apps/web/src/pages/dashboard/brand/movements/new-titip.astro
git commit -m "fix(titip): post to /v1/movements/batch + deterministic idempotency key + qty strip"
```

---

### Task 3: Build new-tarik.astro (mirror of new-titip, kind=TARIK)

**Objective:** The "+ Tarik" button in the brand dashboard is a 404. Build the page.

**Files:**
- Create: `apps/web/src/pages/dashboard/brand/movements/new-tarik.astro`

**Step 1: Create the file** with this content (mirror of new-titip, kind flipped to TARIK):

```astro
---
import { APP_NAME } from "@kongsian/shared/constants";
import { API_BASE_URL } from "../../../../lib/api";
const title = `Catat Tarik — ${APP_NAME}`;
---
<!doctype html>
<html lang="id">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{title}</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      body { margin:0; background:#0b1220; color:#f1f5f9; font-family:ui-sans-serif,system-ui,-apple-system,sans-serif; line-height:1.5; -webkit-font-smoothing:antialiased; }
      a { color:#38bdf8; text-decoration:none; }
      .shell { max-width:480px; margin:0 auto; padding:0 0 80px; }
      header.top { display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid #1e293b; position:sticky; top:0; background:rgba(11,18,32,.92); backdrop-filter:blur(6px); z-index:5; }
      .back { color:#94a3b8; font-size:14px; }
      h1 { font-size:20px; margin:0; }
      main { padding:20px; }
      label { display:flex; flex-direction:column; gap:6px; margin-bottom:14px; font-size:13px; }
      .lbl { font-weight:600; }
      select, input { background:#0b1220; border:1px solid #1e293b; color:#f1f5f9; padding:12px; border-radius:10px; font-size:16px; font-family:inherit; width:100%; min-height:48px; }
      select:focus, input:focus { outline:none; border-color:#fbbf24; }
      .btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; padding:14px 20px; border-radius:10px; font-weight:600; border:1px solid transparent; cursor:pointer; font-size:16px; min-height:48px; }
      .btn-primary { background:#fbbf24; color:#0b1220; width:100%; }
      .btn-primary:hover { background:#f59e0b; }
      .btn-primary:disabled { opacity:.5; cursor:not-allowed; }
      .sku-table { background:#0f172a; border:1px solid #1e293b; border-radius:12px; padding:12px; margin-bottom:16px; }
      .sk-row { display:grid; grid-template-columns:1fr 100px; gap:10px; align-items:center; padding:8px 0; border-bottom:1px solid #1e293b; }
      .sk-row:last-child { border-bottom:none; }
      .sk-label .code { color:#fbbf24; font-weight:700; margin-right:6px; }
      .sk-label .name { color:#f1f5f9; }
      .sk-label .meta { color:#94a3b8; font-size:12px; }
      .sk-row input { padding:10px; text-align:center; font-size:16px; min-height:48px; }
      .empty { background:#0f172a; border:1px dashed #1e293b; border-radius:12px; padding:24px; text-align:center; color:#94a3b8; }
      .err { background:rgba(251,113,133,.12); color:#fb7185; border:1px solid rgba(251,113,133,.3); padding:10px 12px; border-radius:10px; font-size:13px; margin-bottom:12px; }
      .ok { background:rgba(52,211,153,.12); color:#34d399; border:1px solid rgba(52,211,153,.3); padding:10px 12px; border-radius:10px; font-size:13px; margin-bottom:12px; }
      .section-title { font-size:13px; color:#94a3b8; text-transform:uppercase; letter-spacing:0.06em; font-weight:700; margin:20px 0 8px; }
      .stok-hint { font-size:12px; color:#94a3b8; margin-top:4px; }
    </style>
  </head>
  <body>
    <div class="shell">
      <header class="top">
        <a class="back" href="/dashboard/brand/movements">← Movements</a>
        <h1>Catat Tarik</h1>
        <span></span>
      </header>
      <main>
        <div id="err" class="err" style="display:none"></div>
        <div id="ok" class="ok" style="display:none"></div>
        <label>
          <span class="lbl">Pilih partnership (cafe)</span>
          <select id="partnership"></select>
        </label>
        <label>
          <span class="lbl">Tanggal tarik</span>
          <input id="date" type="date" required />
        </label>
        <div class="section-title">SKU yang ditarik (max = sisa sistem)</div>
        <div id="sku-section" class="sku-table">
          <div class="empty">Pilih partnership dulu.</div>
        </div>
        <button id="submit-btn" class="btn btn-primary" type="button" disabled>Simpan Tarik</button>
      </main>
    </div>
    <script define:vars={{ API_BASE_URL }}>
      const API = API_BASE_URL.replace(/\/$/, "");
      const tok = localStorage.getItem("kongsian_session");
      if (!tok) { window.location.href = "/login"; }
      const authH = { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" };
      async function jget(p) { return (await fetch(API+p, { headers: authH })).json().catch(()=>({})); }
      async function jpost(p, b) { return (await fetch(API+p, { method:"POST", headers: authH, body: JSON.stringify(b) })).json().catch(()=>({})); }

      const errEl = document.getElementById("err");
      const okEl = document.getElementById("ok");
      const showErr = m => { errEl.textContent = m; errEl.style.display="block"; okEl.style.display="none"; };
      const showOk = m => { okEl.textContent = m; okEl.style.display="block"; errEl.style.display="none"; };

      const state = { brandId: null, partnerships: [], skus: [], sisaSistem: {}, partnershipId: null };
      document.getElementById("date").value = new Date().toISOString().slice(0, 10);
      function fmtRp(n) { return new Intl.NumberFormat("id-ID", { style:"currency", currency:"IDR", maximumFractionDigits:0 }).format(n); }

      async function loadPartnerships() {
        const me = await jget("/v1/brands/me");
        if (!me.ok || !me.data.brandId) { window.location.href = "/dashboard/brand"; return; }
        state.brandId = me.data.brandId;
        const b = await jget(`/v1/brands/${state.brandId}`);
        if (!b.ok) { showErr("Gagal muat partnerships: " + (b.error?.code || "?")); return; }
        const active = (b.data.partnerships || []).filter(p => p.status === "ACTIVE");
        if (active.length === 0) {
          document.getElementById("partnership").innerHTML = `<option value="">— Belum ada cafe aktif —</option>`;
          return;
        }
        document.getElementById("partnership").innerHTML = `<option value="">— Pilih cafe —</option>` +
          active.map(p => `<option value="${p.id}">${p.tenant?.name || "(tenant?)"}</option>`).join("");
        state.partnerships = active;
      }

      function attachQtyStrip() {
        document.querySelectorAll("#sku-section input[data-sku]").forEach(el => {
          el.addEventListener("input", () => {
            const cleaned = el.value.replace(/\D/g, "").slice(0, 4);
            if (el.value !== cleaned) el.value = cleaned;
          });
        });
      }

      async function renderSkus() {
        const sec = document.getElementById("sku-section");
        if (!state.partnershipId) { sec.innerHTML = `<div class="empty">Pilih partnership dulu.</div>`; document.getElementById("submit-btn").disabled = true; return; }
        if (state.skus.length === 0) { sec.innerHTML = `<div class="empty">Belum ada SKU di brand ini.</div>`; document.getElementById("submit-btn").disabled = true; return; }
        // Pull sisa-sistem to show max qty per SKU
        const upTo = document.getElementById("date").value;
        const sisaR = await jget(`/v1/movements/sisa-sistem?partnershipId=${state.partnershipId}&upTo=${upTo}`);
        state.sisaSistem = {};
        if (sisaR.ok) {
          for (const row of sisaR.data || []) state.sisaSistem[row.skuId] = row.qty;
        }
        sec.innerHTML = state.skus.map(s => {
          const sisa = state.sisaSistem[s.id] ?? 0;
          return `
            <div class="sk-row">
              <div class="sk-label">
                <div><span class="code">${s.code}</span><span class="name">${s.name}</span></div>
                <div class="meta">${fmtRp(s.priceIdr)} · Sisa: <strong>${sisa}</strong></div>
              </div>
              <input type="number" min="0" max="${sisa}" step="1" data-sku="${s.id}" placeholder="0" inputmode="numeric" ${sisa<=0?'disabled':''} />
            </div>
          `;
        }).join("");
        document.getElementById("submit-btn").disabled = false;
        attachQtyStrip();
      }

      document.getElementById("partnership").addEventListener("change", async (e) => {
        const pid = e.target.value;
        state.partnershipId = pid || null;
        if (!pid) { state.skus = []; renderSkus(); return; }
        const r = await jget(`/v1/skus?brandId=${state.brandId}`);
        state.skus = r.ok ? (r.data || []) : [];
        renderSkus();
      });
      document.getElementById("date").addEventListener("change", () => { if (state.partnershipId) renderSkus(); });

      document.getElementById("submit-btn").addEventListener("click", async () => {
        errEl.style.display = "none"; okEl.style.display = "none";
        if (!state.partnershipId) { showErr("Pilih partnership dulu."); return; }
        const date = document.getElementById("date").value;
        if (!date) { showErr("Tanggal wajib."); return; }
        const rows = document.querySelectorAll("#sku-section input[data-sku]");
        const items = [];
        for (const inp of rows) {
          const v = parseInt((inp.value || "0").replace(/\D/g, ""), 10) || 0;
          const sisa = state.sisaSistem[inp.dataset.sku] ?? 0;
          if (v > 0) {
            if (v > sisa) { showErr(`Qty untuk SKU melebihi sisa sistem (${sisa}).`); return; }
            items.push({ skuId: inp.dataset.sku, kind: "TARIK", qty: v });
          }
        }
        if (items.length === 0) { showErr("Isi minimal 1 SKU dengan qty > 0."); return; }
        const btn = document.getElementById("submit-btn");
        btn.disabled = true; btn.textContent = "Menyimpan…";
        try {
          // v2: idempotency in BODY (batchIdempotencyKey), not header
          const batchIdempotencyKey = `tarik-${state.partnershipId}-${date}`;
          const r = await fetch(API + "/v1/movements/batch", {
            method: "POST",
            headers: { ...authH },
            body: JSON.stringify({
              partnershipId: state.partnershipId,
              movementDate: date,
              items,
              batchIdempotencyKey,
            }),
          });
          const json = await r.json().catch(() => ({}));
          if (r.ok && json.ok) {
            showOk(`Berhasil: ${items.length} SKU ditarik.`);
            setTimeout(() => { window.location.href = "/dashboard/brand/movements"; }, 800);
            return;
          }
          showErr("Gagal: " + (json?.error?.code || `HTTP ${r.status}`));
        } catch (e) {
          showErr("Tidak bisa konek ke server.");
        } finally {
          btn.disabled = false; btn.textContent = "Simpan Tarik";
        }
      });

      loadPartnerships();
    </script>
  </body>
</html>
```

**Step 2: Verify on disk + Curl smoke**
Same as Task 2, but with `kind: "TARIK"`. Verify `/v1/movements?partnershipId=...` shows negative qty rows.

**Step 3: Deploy + UI test**
Open `/dashboard/brand/movements/new-tarik`. The "+ Tarik" button on `/dashboard/brand/movements` should now resolve.

**Commit:**
```bash
git add apps/web/src/pages/dashboard/brand/movements/new-tarik.astro
git commit -m "feat(tarik): new-tarik form (mirror of titip, kind=TARIK, sisa-sistem check)"
```

---

### Task 4: Add "Stok tersisa" widget to brand dashboard

**Objective:** At-a-glance visibility into how many of each SKU are at each cafe right now.

**Files:**
- Modify: `apps/web/src/pages/dashboard/brand/index.astro` (add a section between the stat tiles and the actions grid)

**Step 1: Add HTML container**
After the closing `</div>` of the `.stats` block (line 108), insert:
```astro
<h2>Stok tersisa di cafe</h2>
<div id="sisa-list" class="sisa-list">
  <div class="loading">Memuat…</div>
</div>
```

**Step 2: Add CSS**
Add inside the `<style>` block (anywhere):
```css
.sisa-list { display:flex; flex-direction:column; gap:10px; margin-bottom:24px; }
.sisa-card { background:#0f172a; border:1px solid #1e293b; border-radius:12px; padding:14px; }
.sisa-card .cafe { font-weight:600; margin-bottom:8px; }
.sisa-rows { display:flex; flex-wrap:wrap; gap:6px; }
.sisa-pill { background:#1e293b; padding:4px 8px; border-radius:6px; font-size:12px; }
.sisa-pill.zero { color:#94a3b8; }
.sisa-pill.low { color:#fb7185; font-weight:700; }
.sisa-pill.ok { color:#34d399; }
```

**Step 3: Add JS to populate**
Insert inside the `(async () => { ... })()` IIFE, after the partnerships/SKUs rendering and before the weekly-revenue loop:

```js
// Stok tersisa per cafe
const sisaEl = document.getElementById("sisa-list");
if (active.length === 0) {
  sisaEl.innerHTML = `<div class="empty">Belum ada cafe aktif.</div>`;
} else {
  const today = new Date().toISOString().slice(0, 10);
  const cards = [];
  for (const p of active) {
    const r = await jget(`/v1/movements/sisa-sistem?partnershipId=${p.id}&upTo=${today}`);
    const rows = r.ok ? (r.data || []) : [];
    if (rows.length === 0) {
      cards.push(`<div class="sisa-card"><div class="cafe">${p.tenant?.name || "(tenant?)"}</div><div class="loading" style="padding:8px 0">Belum ada stok.</div></div>`);
      continue;
    }
    const pills = rows.map(row => {
      const sku = brand.skus.find(s => s.id === row.skuId);
      if (!sku) return "";
      const cls = row.qty <= 0 ? "zero" : row.qty < 5 ? "low" : "ok";
      return `<span class="sisa-pill ${cls}">${sku.code}: ${row.qty}</span>`;
    }).join("");
    cards.push(`<div class="sisa-card"><div class="cafe">${p.tenant?.name || "(tenant?)"}</div><div class="sisa-rows">${pills}</div></div>`);
  }
  sisaEl.innerHTML = cards.join("");
}
```

**Step 4: Verify on disk + Deploy + UI test**
```bash
grep -n "sisa-sistem\|sisa-list\|sisa-pill" apps/web/src/pages/dashboard/brand/index.astro
```
Open dashboard on mobile — should show per-cafe stock counts below the stat tiles.

**Commit:**
```bash
git add apps/web/src/pages/dashboard/brand/index.astro
git commit -m "feat(dashboard): stok tersisa per cafe widget"
```

---

### Task 5: Build the "Catat Hari Ini" combined form (THE KILLER FEATURE)

**Objective:** One mobile screen — pick a date + cafe, then one scrollable form with three sections (Titip / Tarik / Terjual) and one Save. Closest to the Excel pattern (one row per day per cafe).

**Files:**
- Create: `apps/web/src/pages/dashboard/brand/ops/new.astro`

**Architecture decisions baked in:**
- **Section A (Titip):** POSTs `POST /v1/movements/batch` with `kind: "TITIP"` items, deterministic key `titip-PID-DATE`
- **Section B (Tarik):** POSTs `POST /v1/movements/batch` with `kind: "TARIK"` items, key `tarik-PID-DATE`
- **Section C (Terjual):** Two-step — first `POST /v1/tenants/:tenantId/partnerships/:pid/closings/:date/terjual` with `{ lines: [{ skuId, qty }] }` (upsert), then `POST .../submit` (OPEN → SUBMITTED). Required for settlement cron to count this week.
- The `tenantId` is fetched from `/v1/brands/:id` response (the partnership's `tenant.id` field).
- One Save button runs all three sections in sequence; the Terjual submit failure aborts the whole save and shows the error (Titip/Tarik are idempotent on retry).

**Step 1: Create the file** — full content (mirrors the styling of the existing dashboard pages, mobile-first 480px shell):

```astro
---
import { APP_NAME } from "@kongsian/shared/constants";
import { API_BASE_URL } from "../../../../lib/api";
const title = `Catat Hari Ini — ${APP_NAME}`;
---
<!doctype html>
<html lang="id">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{title}</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      body { margin:0; background:#0b1220; color:#f1f5f9; font-family:ui-sans-serif,system-ui,-apple-system,sans-serif; line-height:1.5; -webkit-font-smoothing:antialiased; }
      a { color:#38bdf8; text-decoration:none; }
      .shell { max-width:480px; margin:0 auto; padding:0 0 80px; }
      header.top { display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid #1e293b; position:sticky; top:0; background:rgba(11,18,32,.92); backdrop-filter:blur(6px); z-index:5; }
      .back { color:#94a3b8; font-size:14px; }
      h1 { font-size:20px; margin:0; }
      main { padding:20px; }
      label { display:flex; flex-direction:column; gap:6px; margin-bottom:14px; font-size:13px; }
      .lbl { font-weight:600; }
      select, input { background:#0b1220; border:1px solid #1e293b; color:#f1f5f9; padding:12px; border-radius:10px; font-size:16px; font-family:inherit; width:100%; min-height:48px; }
      select:focus, input:focus { outline:none; border-color:#fbbf24; }
      .btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; padding:14px 20px; border-radius:10px; font-weight:600; border:1px solid transparent; cursor:pointer; font-size:16px; min-height:48px; }
      .btn-primary { background:#fbbf24; color:#0b1220; width:100%; }
      .btn-primary:disabled { opacity:.5; cursor:not-allowed; }
      .section { background:#0f172a; border:1px solid #1e293b; border-radius:12px; padding:14px; margin-bottom:16px; }
      .section h2 { margin:0 0 4px; font-size:16px; display:flex; align-items:center; gap:8px; }
      .section h2 .ic { font-size:18px; }
      .section .hint { font-size:12px; color:#94a3b8; margin:0 0 10px; }
      .sk-row { display:grid; grid-template-columns:1fr 90px; gap:10px; align-items:center; padding:8px 0; border-bottom:1px solid #1e293b; }
      .sk-row:last-child { border-bottom:none; }
      .sk-label .code { color:#fbbf24; font-weight:700; margin-right:6px; }
      .sk-label .name { color:#f1f5f9; }
      .sk-label .meta { color:#94a3b8; font-size:12px; }
      .sk-row input { padding:10px; text-align:center; font-size:16px; min-height:48px; }
      .empty { padding:16px; text-align:center; color:#94a3b8; font-size:13px; }
      .err { background:rgba(251,113,133,.12); color:#fb7185; border:1px solid rgba(251,113,133,.3); padding:10px 12px; border-radius:10px; font-size:13px; margin-bottom:12px; }
      .ok { background:rgba(52,211,153,.12); color:#34d399; border:1px solid rgba(52,211,153,.3); padding:10px 12px; border-radius:10px; font-size:13px; margin-bottom:12px; }
    </style>
  </head>
  <body>
    <div class="shell">
      <header class="top">
        <a class="back" href="/dashboard/brand">← Brand</a>
        <h1>Catat Hari Ini</h1>
        <span></span>
      </header>
      <main>
        <div id="err" class="err" style="display:none"></div>
        <div id="ok" class="ok" style="display:none"></div>
        <label>
          <span class="lbl">Tanggal</span>
          <input id="date" type="date" required />
        </label>
        <label>
          <span class="lbl">Cafe</span>
          <select id="partnership"></select>
        </label>

        <div class="section">
          <h2><span class="ic">📦</span> Titip (stok masuk)</h2>
          <p class="hint">Isi berapa banyak tiap SKU yang kamu titipkan ke cafe hari ini.</p>
          <div id="titip-section"><div class="empty">Pilih cafe dulu.</div></div>
        </div>

        <div class="section">
          <h2><span class="ic">↩️</span> Tarik (stok kembali)</h2>
          <p class="hint">Stok yang tidak terjual dan kamu bawa kembali. Max = sisa sistem.</p>
          <div id="tarik-section"><div class="empty">Pilih cafe dulu.</div></div>
        </div>

        <div class="section">
          <h2><span class="ic">💵</span> Terjual (closing)</h2>
          <p class="hint">Berapa cup/pack terjual hari ini per SKU. Ini yang dihitung untuk settlement.</p>
          <div id="terjual-section"><div class="empty">Pilih cafe dulu.</div></div>
        </div>

        <button id="submit-btn" class="btn btn-primary" type="button" disabled>Simpan Semua</button>
      </main>
    </div>
    <script define:vars={{ API_BASE_URL }}>
      const API = API_BASE_URL.replace(/\/$/, "");
      const tok = localStorage.getItem("kongsian_session");
      if (!tok) { window.location.href = "/login"; }
      const authH = { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" };
      async function jget(p) { return (await fetch(API+p, { headers: authH })).json().catch(()=>({})); }
      async function jpost(p, b) { return (await fetch(API+p, { method:"POST", headers: authH, body: JSON.stringify(b) })).json().catch(()=>({})); }

      const errEl = document.getElementById("err");
      const okEl = document.getElementById("ok");
      const showErr = m => { errEl.textContent = m; errEl.style.display="block"; okEl.style.display="none"; window.scrollTo({ top: 0, behavior: "smooth" }); };
      const showOk = m => { okEl.textContent = m; okEl.style.display="block"; errEl.style.display="none"; };
      function fmtRp(n) { return new Intl.NumberFormat("id-ID", { style:"currency", currency:"IDR", maximumFractionDigits:0 }).format(n); }

      const state = { brandId: null, partnershipId: null, tenantId: null, skus: [], sisaSistem: {} };
      document.getElementById("date").value = new Date().toISOString().slice(0, 10);

      function attachQtyStrip(sel) {
        document.querySelectorAll(sel + " input[data-sku]").forEach(el => {
          el.addEventListener("input", () => {
            const cleaned = el.value.replace(/\D/g, "").slice(0, 4);
            if (el.value !== cleaned) el.value = cleaned;
          });
        });
      }

      function renderSections() {
        const disabled = !state.partnershipId || state.skus.length === 0;
        document.getElementById("submit-btn").disabled = disabled;
        if (!state.partnershipId) {
          for (const id of ["titip-section","tarik-section","terjual-section"]) {
            document.getElementById(id).innerHTML = `<div class="empty">Pilih cafe dulu.</div>`;
          }
          return;
        }
        if (state.skus.length === 0) {
          for (const id of ["titip-section","tarik-section","terjual-section"]) {
            document.getElementById(id).innerHTML = `<div class="empty">Belum ada SKU.</div>`;
          }
          return;
        }
        // Titip: any positive qty
        document.getElementById("titip-section").innerHTML = state.skus.map(s => skuRow(s, "titip")).join("");
        // Tarik: bounded by sisa-sistem
        document.getElementById("tarik-section").innerHTML = state.skus.map(s => {
          const sisa = state.sisaSistem[s.id] ?? 0;
          return skuRow(s, "tarik", { max: sisa, disabled: sisa <= 0, hint: `Sisa: ${sisa}` });
        }).join("");
        // Terjual: same as titip
        document.getElementById("terjual-section").innerHTML = state.skus.map(s => skuRow(s, "terjual")).join("");
        attachQtyStrip("#titip-section"); attachQtyStrip("#tarik-section"); attachQtyStrip("#terjual-section");
      }
      function skuRow(s, kind, opts = {}) {
        const max = opts.max != null ? `max="${opts.max}"` : "";
        const dis = opts.disabled ? "disabled" : "";
        const hint = opts.hint ? `<div class="meta">${opts.hint}</div>` : `<div class="meta">${fmtRp(s.priceIdr)}</div>`;
        return `
          <div class="sk-row">
            <div class="sk-label">
              <div><span class="code">${s.code}</span><span class="name">${s.name}</span></div>
              ${hint}
            </div>
            <input type="number" min="0" ${max} step="1" data-sku="${s.id}" data-kind="${kind}" placeholder="0" inputmode="numeric" ${dis} />
          </div>
        `;
      }

      async function refreshSisa() {
        if (!state.partnershipId) { state.sisaSistem = {}; return; }
        const upTo = document.getElementById("date").value;
        const r = await jget(`/v1/movements/sisa-sistem?partnershipId=${state.partnershipId}&upTo=${upTo}`);
        state.sisaSistem = {};
        if (r.ok) for (const row of r.data || []) state.sisaSistem[row.skuId] = row.qty;
      }

      async function init() {
        const me = await jget("/v1/brands/me");
        if (!me.ok || !me.data.brandId) { window.location.href = "/dashboard/brand"; return; }
        state.brandId = me.data.brandId;
        const b = await jget(`/v1/brands/${state.brandId}`);
        if (!b.ok) { showErr("Gagal muat brand: " + (b.error?.code || "?")); return; }
        const active = (b.data.partnerships || []).filter(p => p.status === "ACTIVE");
        const sel = document.getElementById("partnership");
        if (active.length === 0) {
          sel.innerHTML = `<option value="">— Belum ada cafe aktif —</option>`;
        } else {
          sel.innerHTML = `<option value="">— Pilih cafe —</option>` +
            active.map(p => `<option value="${p.id}" data-tenant="${p.tenant?.id || ""}">${p.tenant?.name || "(tenant?)"}</option>`).join("");
          state.partnerships = active;
        }
        sel.addEventListener("change", async (e) => {
          const opt = e.target.selectedOptions[0];
          state.partnershipId = e.target.value || null;
          state.tenantId = opt ? opt.dataset.tenant : null;
          if (!state.partnershipId) { renderSections(); return; }
          const r = await jget(`/v1/skus?brandId=${state.brandId}`);
          state.skus = r.ok ? (r.data || []) : [];
          await refreshSisa();
          renderSections();
        });
        document.getElementById("date").addEventListener("change", async () => {
          if (state.partnershipId) { await refreshSisa(); renderSections(); }
        });
      }

      function readSectionItems(sectionSel, kind) {
        // For movements/batch: each item is { skuId, kind, qty }
        const items = [];
        document.querySelectorAll(sectionSel + " input[data-sku]").forEach(inp => {
          if (inp.disabled) return;
          const v = parseInt((inp.value || "0").replace(/\D/g, ""), 10) || 0;
          if (v > 0) items.push({ skuId: inp.dataset.sku, kind, qty: v });
        });
        return items;
      }
      function readTerjualLines(sectionSel) {
        // For closings/:date/terjual: each line is { skuId, terjual } (not qty!)
        const lines = [];
        document.querySelectorAll(sectionSel + " input[data-sku]").forEach(inp => {
          if (inp.disabled) return;
          const v = parseInt((inp.value || "0").replace(/\D/g, ""), 10) || 0;
          if (v > 0) lines.push({ skuId: inp.dataset.sku, terjual: v });
        });
        return lines;
      }

      document.getElementById("submit-btn").addEventListener("click", async () => {
        errEl.style.display = "none"; okEl.style.display = "none";
        if (!state.partnershipId) { showErr("Pilih cafe dulu."); return; }
        if (!state.tenantId) { showErr("Tenant ID tidak ditemukan di partnership ini."); return; }
        const date = document.getElementById("date").value;
        if (!date) { showErr("Tanggal wajib."); return; }
        // Sections: items per (kind) for movements, lines per (terjual) for closing.
        const titipItems = readSectionItems("#titip-section", "TITIP");
        const tarikItems = readSectionItems("#tarik-section", "TARIK");
        const terjualLines = readTerjualLines("#terjual-section");
        // Validate tarik vs sisa
        for (const it of tarikItems) {
          const sisa = state.sisaSistem[it.skuId] ?? 0;
          if (it.qty > sisa) { showErr(`Tarik SKU melebihi sisa sistem (${sisa}).`); return; }
        }
        if (titipItems.length + tarikItems.length + terjualLines.length === 0) {
          showErr("Minimal isi satu kolom (Titip, Tarik, atau Terjual)."); return;
        }

        const btn = document.getElementById("submit-btn");
        btn.disabled = true; btn.textContent = "Menyimpan…";
        try {
          // 1) Titip batch — v2: idempotency in body
          if (titipItems.length > 0) {
            const r = await fetch(API + "/v1/movements/batch", {
              method: "POST",
              headers: { ...authH },
              body: JSON.stringify({
                partnershipId: state.partnershipId,
                movementDate: date,
                items: titipItems,
                batchIdempotencyKey: `titip-${state.partnershipId}-${date}`,
              }),
            });
            if (!r.ok) { const j = await r.json().catch(()=>({})); throw new Error("Titip gagal: " + (j?.error?.code || r.status)); }
          }
          // 2) Tarik batch — v2: idempotency in body
          if (tarikItems.length > 0) {
            const r = await fetch(API + "/v1/movements/batch", {
              method: "POST",
              headers: { ...authH },
              body: JSON.stringify({
                partnershipId: state.partnershipId,
                movementDate: date,
                items: tarikItems,
                batchIdempotencyKey: `tarik-${state.partnershipId}-${date}`,
              }),
            });
            if (!r.ok) { const j = await r.json().catch(()=>({})); throw new Error("Tarik gagal: " + (j?.error?.code || r.status)); }
          }
          // 3) Terjual via closings: create draft → upsert lines → submit
          if (terjualLines.length > 0) {
            // 3a) Create/return draft closing (idempotent on (partnership,date))
            const createUrl = `/v1/tenants/${state.tenantId}/partnerships/${state.partnershipId}/closings`;
            const cr = await jpost(createUrl, { closingDate: date });
            if (!cr.ok) throw new Error("Closing buat gagal: " + (cr.error?.code || "?"));
            // 3b) Upsert terjual lines — v2: field is `terjual` not `qty`
            const tjUrl = `/v1/tenants/${state.tenantId}/partnerships/${state.partnershipId}/closings/${date}/terjual`;
            const tr = await jpost(tjUrl, { lines: terjualLines });
            if (!tr.ok) throw new Error("Terjual upsert gagal: " + (tr.error?.code || "?"));
            // 3c) Submit — Task 0 loosened PHOTO_REQUIRED for the trial
            const subUrl = `/v1/tenants/${state.tenantId}/partnerships/${state.partnershipId}/closings/${date}/submit`;
            const sr = await jpost(subUrl, {});
            if (!sr.ok) throw new Error("Submit closing gagal: " + (sr.error?.code || "?"));
          }
          showOk(`Berhasil disimpan. Mengarahkan…`);
          setTimeout(() => { window.location.href = "/dashboard/brand/movements"; }, 1000);
        } catch (e) {
          showErr(e.message || "Tidak bisa konek ke server.");
        } finally {
          btn.disabled = false; btn.textContent = "Simpan Semua";
        }
      });

      init();
    </script>
  </body>
</html>
```

**Step 2: Add the "Catat Hari Ini" tile to the brand dashboard**
In `apps/web/src/pages/dashboard/brand/index.astro`, in the `.actions` grid (around line 110-147), add a new tile at the very top of the grid (before the "Catat Titip" tile):
```astro
<a class="action" href="/dashboard/brand/ops/new" style="border-color:#fbbf24;background:rgba(251,191,36,.08)">
  <span class="ic">⚡</span>
  <span class="tt">Catat Hari Ini</span>
  <span class="sub">Titip + Tarik + Terjual dalam 1 layar</span>
</a>
```

**Step 3: Verify on disk + Deploy + UI test**
```bash
grep -n "/v1/tenants/.*closings\|ops/new\|Catat Hari Ini" apps/web/src/pages/dashboard/brand/ops/new.astro apps/web/src/pages/dashboard/brand/index.astro
```
Open `/dashboard/brand/ops/new` on mobile, fill 2 SKU qty=5 across all three sections, hit Save. Verify in D1:
```bash
cd /root/kongsian/apps/api
pnpm exec wrangler d1 execute kongsian-db --remote --command "SELECT kind, qty, movement_date FROM stock_movements ORDER BY submitted_at DESC LIMIT 6"
pnpm exec wrangler d1 execute kongsian-db --remote --command "SELECT id, closing_date, status FROM daily_closings ORDER BY submitted_at DESC LIMIT 3"
```
Expected: 5 TITIP rows (qty=5), 5 TARIK rows (qty=5), 1 SUBMITTED daily_closing with 2 daily_closing_lines (qty=5 each). The SUBMITTED closing means the Sunday 23:59 WIB cron will pick it up for settlement.

**Step 4: Double-Save test**
Fill the form, hit Save twice quickly (within 1 second). Re-query D1 — should still be the same row count (idempotency keys dedupe).

**Commit:**
```bash
git add apps/web/src/pages/dashboard/brand/ops/new.astro apps/web/src/pages/dashboard/brand/index.astro
git commit -m "feat(ops): Catat Hari Ini combined form (Titip+Tarik+Closing in one screen)"
```

---

### Task 6: Verify settlement cron still works with single-actor data

**Objective:** The Sunday 23:59 WIB cron (`59 16 * * 7` UTC) should now correctly process a week that has SUBMITTED closings from the Daily Ops form.

**Files:** None — verification only.

**Step 1: Check the cron is actually scheduled**
Read `apps/api/wrangler.toml` and confirm the `59 16 * * 7` schedule exists for settlement generation.

**Step 2: Manual settlement run for a past week (if there's a dev tool)**
```bash
# Look for a manual trigger endpoint or a CLI script
grep -rn "settlement" /root/kongsian/apps/api/src/cron* 2>/dev/null
grep -rn "triggerSettlement\|generateSettlement" /root/kongsian/apps/api/src 2>/dev/null
```

If a manual trigger exists, run it for the test week. Otherwise, wait for the next Sunday cron or seed a backdated closing in D1 and re-run the cron handler manually via `wrangler dev`.

**Step 3: Verify settlement row created**
```bash
pnpm exec wrangler d1 execute kongsian-db --remote --command "SELECT id, week_start_date, week_end_date, total_terjual_idr, brand_share_idr, tenant_share_idr, status FROM settlements ORDER BY week_start_date DESC LIMIT 3"
```
Expected: a settlement row with non-zero `total_terjual_idr` derived from the SUBMITTED closings.

**Step 4: Verify the brand dashboard's settlement page renders it**
Open `/dashboard/brand/settlements` — should show the new week with omzet + split.

**No commit (verification only).**

---

## Out of scope (explicit YAGNI)

- **Cafe invite flow / tenant user accounts.** Parked. Single-actor for now.
- **Partnership setup wizard (Phase 2 — Erwin 2026-06-08 spec).** The user described the future on-boarding flow as: *after brand + SKU is registered, the add-partner function needs a partnership setup wizard that captures (a) which SKUs are active in this partnership, (b) per-SKU price override, (c) settlement split %, (d) settlement cadence (WEEKLY | MONTHLY), (e) cycle start day (e.g. Friday-to-next-Thursday).* **NOT building in this plan.** Deferred to Phase 2 (post-pivot validation). Spec captured here for the Phase 2 planner:
  - **Schema additions needed** (Drizzle migration):
    - `partnerships.settlement_cadence` text enum('WEEKLY','MONTHLY') default 'WEEKLY'
    - `partnerships.cycle_start_day_of_week` integer 0-6 default 1 (Mon — current cron behavior) for WEEKLY
    - `partnerships.cycle_start_day_of_month` integer 1-28 for MONTHLY
  - **UI changes** (rebuild `dashboard/brand/partnerships.astro`):
    - Invite form: add multi-step wizard (cafe → SKUs → pricing per SKU → split + cadence → review)
    - Edit partnership page (split %, cadence, SKU list)
    - Per-SKU price override input (writes to `partnership_skus.price_override_idr`)
  - **Cron rewrite** (`apps/api/src/cron.ts`): currently hardcoded `59 16 * * 7` UTC (Sun 23:59 WIB). Needs to:
    - Run daily (e.g. `5 0 * * *` UTC = 07:05 WIB), not weekly
    - Query partnerships grouped by cadence, compute per-partnership cycle window
    - For WEEKLY partnerships where `cycle_start_day_of_week = today.dayOfWeek - 1`, generate the just-completed cycle
    - For MONTHLY partnerships where `cycle_start_day_of_month = today.date`, generate the just-completed month
  - **Estimated effort**: 6-8 more tasks. Sequence after pivot validates.
- **Dispute chat.** Parked.
- **R2 photo upload on the Daily Ops form.** Each section can have it later, but skip for v1 — the titip/tarik rows are not the primary photo target (the closing photo is, and that's already in `closing_photos` table).
- **Editing past closings.** The `isValidClosingDate` helper in closings.ts:74-79 already restricts to today + past 7 days (widened to 30 in T0). Out of scope to widen further.
- **CSV export of the daily ops.** YAGNI — the settlement PDF export (W4 F1) covers reporting.
- **Re-deriving settlements from stock_movements** (T4b). The T4a path is sufficient.
- **Offline / PWA support.** YAGNI for trial.
- **Multi-day batch entry.** One day at a time — same as the Excel pattern Erwin described.

---

## Pitfalls (re-stated for the executor)

1. **Verify on disk before "done" (P1).** Two of the three new pages reference non-existent routes in the current codebase. Don't trust "the form looks right" — grep + curl every URL.
2. **Task 0 must be deployed BEFORE Task 5.** Without the closings API gate loosening, the Daily Ops form's terjual section gets 403 on every call. Sequence is T0 → T1 → T2 → T3 → T4 → T5 → T6.
3. **Daily Ops MUST call `.../submit` after `.../terjual`.** Otherwise settlement cron won't count the row. T5 step 1 includes the submit call; do not remove it.
4. **Idempotency keys go in the BODY (`batchIdempotencyKey` for batch, `idempotencyKey` for single) — NOT the `Idempotency-Key` header.** The server does not read that header. Header is silently ignored. v1 of this plan got this wrong; v2 is correct.
5. **Terjual body field is `terjual`, not `qty`.** The closings terjual schema is `{ lines: [{ skuId, terjual }] }`. Sending `qty` returns 400 INVALID_INPUT. v1 got this wrong; v2 uses the right field via `readTerjualLines()`.
6. **WhatsApp-pasted quantities get non-digits stripped** (P12). Every numeric input needs the `attachQtyStrip` listener.
7. **`/v1/brands/me` returns flat `data.brandId`, not nested.** T1 fixes the closings page bug. Don't introduce the wrong field path elsewhere.
8. **The tenant-scoped closings URL requires `tenantId`**, not `brandId`. The Daily Ops form must extract `tenantId` from the partnership select option's `data-tenant` attribute (T5 does this).
9. **PHOTO_REQUIRED was disabled in Task 0 for the trial.** Re-enable (flip `false &&` to `true`) before onboarding real cafe partners. Search for `PHOTO_REQUIRED` to find the dead code.
10. **isValidClosingDate widened from 7 to 30 days in Task 0.** Future dates still rejected.
11. **CORS apex already in allowlist** (commit `48e098e`). No CORS work needed for this pivot.
12. **Auth gate is auto-VERIFIED for trial** (commit `5086f47`). No new user verification work needed.
13. **OTP rate limit is disabled for trial** (commit `85904d1`). No re-auth work needed.
14. **"Omzet minggu ini" stat vs settlement report can differ.** The brand dashboard's stat derives from `GET /v1/movements` (immediate TERJUAL_OPENING sums). The settlement report (Sun cron) derives from SUBMITTED daily_closings. For single-actor usage they should match; if they don't, the most likely cause is a closing that was started (OPEN) but not submitted. Audit with: `SELECT id, status FROM daily_closings WHERE partnership_id IN (...) AND closing_date BETWEEN '...' AND '...'`.

---

## Execution handoff

This plan is sized for M3 (me) to implement task-by-task in this session, verifying on disk between each. Expected total: ~6 commits, ~5 file changes (one new file, 2 modifications, one new dashboard tile, one new ops page). Deploy is dev-first (`kongsian-api-dev` + `kongsian-web.pages.dev`), with prod swap after Ervina confirms the flow on her phone.

When all tasks are done, ping Erwin with:
- The git log of new commits
- The deploy URLs (dev first)
- A 60-second test script he can run on his phone
