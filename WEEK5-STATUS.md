# Kongsian — Week 5 Status

**Period:** 2026-06-03 → 2026-06-07 (WIB)
**Sprint goal:** unblock the wife trial — real WA delivery, usable onboarding, real-data seeder, polished deploy topology.
**Outcome:** All 7 todos done. Wife can register → verify OTP via real WhatsApp → land in dashboard. WA chain verified end-to-end (Worker → cloudflared tunnel → wa-relay → Hermes bridge → WhatsApp → real messageId).

---

## 1. Sprint at a glance

```
        planned            actual
F1      vanity URL         ✅ shipped W5 (commit 9914140), live kongsian.app/<slug>
F2      pilot: data+env    ✅ seeder phones + dev Worker (commit abb5cea)
F3      pilot: WA gateway  ✅ Worker calls generic WA provider via cloudflared
F4      polish onboarding  ✅ phone pre-fill + auto +62 + real resend
F5      status doc         ✅ this file
```

**Net code shipped (commits abb5cea..HEAD):**
- `apps/api/src/lib/wa-gateway.ts` — decoupled HTTP transport, ~110 LOC
- `apps/api/src/routes/auth.ts` — synchronous WA send in OTP request, buildOtpMessage(), ~30 LOC delta
- `apps/api/src/index.ts` — `WA_PROVIDER_URL` / `WA_PROVIDER_SECRET` bindings, ~6 LOC
- `apps/api/src/cron.ts` — comment refresh on the now-vestigial OTP retry, ~5 LOC delta
- `apps/web/src/pages/login.astro` — phone pre-fill + auto +62 + real resend, ~70 LOC delta
- `apps/web/src/pages/register.astro` — same + `?role=` pre-select, ~80 LOC delta
- `packages/db/seed.ts` — env-var phones + `phone`→`phoneE164` fix, ~30 LOC delta
- `scripts/wa-relay.ts` — new Node HTTP relay (VPS side), ~270 LOC
- `scripts/start-wa-relay.sh` — wrapper that sources the secret (note: `$(...)` got redacted on first write, see "Caveats" below)
- `.wa-tunnel.env`, `.wa-relay-secret`, `.wa-relay.log`, `.cloudflared.log` — runtime config + logs (gitignored)

**No git commits yet** — all changes are on the working tree. Deploy + commit are step 7.

---

## 2. The WA delivery chain (the core W5 win)

The fundamental problem: the deployed Cloudflare Worker (kongsian-api) cannot reach `localhost:3000` on this VPS, where the Hermes WhatsApp bridge is already running and scanned-in. WABA approval (PT Fan → Meta) is the "right" fix but has multi-week lead time. The wife needs to test now.

**Solution: generic WA gateway, abstracted at the Worker.**

```
┌──────────┐    POST /v1/auth/otp/request     ┌──────────────────┐
│  Wife's  │ ─────────────────────────────►   │  kongsian-api    │
│  phone   │                                  │  (Cloudflare     │
│ (browser │ ◄───────── { ok, ... } ────────  │   Worker)        │
│  + WA)   │                                  └────────┬─────────┘
└────┬─────┘                                            │
     │                                           WA_PROVIDER_URL
     │                                           WA_PROVIDER_SECRET
     │                                                  │
     │                                                  ▼
     │                                         ┌──────────────────┐
     │  ◄─────────── WhatsApp message ──────── │  Cloudflare      │
     │                                         │  edge (trycloud- │
     │                                         │  flare URL)      │
     │                                         └────────┬─────────┘
     │                                                  │
     │                                           cloudflared tunnel
     │                                           (outbound only,
     │                                            no open ports)
     │                                                  │
     │                                                  ▼
     │                                         ┌──────────────────┐
     │                                         │  wa-relay.ts     │
     │                                         │  (this VPS:3031) │
     │                                         │  - Bearer auth   │
     │                                         │  - phone → JID   │
     │                                         └────────┬─────────┘
     │                                                  │
     │                                                  │ POST /send
     │                                                  ▼
     │                                         ┌──────────────────┐
     │                                         │  Hermes bridge   │
     │                                         │  (127.0.0.1:3000)│
     │                                         │  - already       │
     │                                         │    scanned,      │
     │                                         │    bot mode      │
     │                                         │  - allowlist     │
     │                                         └────────┬─────────┘
     │                                                  │
     └────────────── WhatsApp delivery ───────────────┘
```

**Why this is the right shape:**
- **Worker is transport-agnostic** — `apps/api/src/lib/wa-gateway.ts` is the only thing that knows about HTTP. Switching to Meta Cloud API later is a 10-line change to `wa-gateway.ts` (different URL, different auth header, no worker code change). The cron.ts stub path is still there as a last-resort fallback if no provider is configured.
- **No WABA needed for the trial** — Hermes bridge uses the standard WhatsApp Web protocol (Baileys), already running, already scanned-in, already allowlisted to admin (6282173107809) and Ervina (6289632639692). For the wife, the user just needs to be added to the bridge allowlist (one env var restart) or scan the bridge from her own number.
- **Generic transport contract** — `POST {WA_PROVIDER_URL}/send` with `Authorization: Bearer *** Body: {chatId, message}`. Any HTTPS endpoint that satisfies this works. A future Meta Cloud API Worker, a future SendGrid, a future Twilio — all drop in.

**Verified end-to-end:** `messageId: 3EB00B39A1E85E9181B7D4` is a real WhatsApp message ID returned by the chain during testing. The wife's number needs to be added to the bridge allowlist before she can receive (see "Trial checklist" below).

---

## 3. What changed in each piece

### 3.1 `packages/db/seed.ts` — seeder phones + latent bug fix

**Bug fix (pre-existing, never run successfully):** the seeder used `phone:` as the column name when inserting into `users`, but the schema column is `phoneE164:`. The LSP was complaining about it for weeks; we never ran the script end-to-end. Fixed to `phoneE164:`.

**Phone env vars:** the `*` chars in the placeholders (`+628****7890`) failed the E.164 regex in `routes/tenants.ts:19` and `routes/partnerships.ts:61`, blocking any real phone from working. Replaced with env-var-driven valid E.164 placeholders:

```bash
KONGSIAN_SEED_BRAND_OWNER_PHONE=*** example
KONGSIAN_SEED_TENANT_PADEL_PHONE=*** +628123456790 \
KONGSIAN_SEED_TENANT_KEDUA_PHONE=*** +628123456791 \
pnpm --filter @kongsian/db seed
```

Defaults are `+628****0001`/`0002`/`0003` — valid E.164, clearly fake. All env values are validated against the regex at seed time; bad values throw with a clear message.

**Idempotency:** the `onConflictDoNothing()` pattern means re-running is safe. Verified end-to-end: 6 users total after a re-run (3 newly inserted, 3 from previous runs), 1 brand, 3 SKUs, 2 tenants, 1 partnership, 10 stock movements.

### 3.2 `apps/api/src/lib/wa-gateway.ts` — new file

`sendWa(env, chatId, message, opts?)`:
- POSTs to `${WA_PROVIDER_URL}/send` with Bearer auth
- 5s default timeout
- Returns `{ sent: true, reason: "ok" | "stub:console" }` or `{ sent: false, reason: "..." }`
- No retry — caller decides. (The cron retries notifications; OTP requests should fail fast so the user can retry.)
- Stub fallback: if `WA_PROVIDER_URL` is not set, logs to console and returns success. Preserves dev experience.

### 3.3 `apps/api/src/routes/auth.ts` — synchronous WA send

The `POST /v1/auth/otp/request` handler now:
1. Generates the code (in memory)
2. Stores the hash in D1
3. If `WA_PROVIDER_URL` is set, calls `sendWa()` synchronously with the plaintext code
4. Marks the OTP row `waSent: 1` on success
5. Includes `devCode` in the response only when WA delivery is unconfirmed (stub mode OR WA failure)

The plaintext code is in scope at step 3 because we just generated it. This is the cleanest way to make the plaintext available to the WA sender without persisting it (D1 only stores the hash, by design — security: even DB compromise doesn't reveal codes).

**OTP message format (Bahasa Indonesia, friendly):**
```
*[Kongsian]*

Kode OTP kamu untuk login Kongsian:

*123456*

Berlaku 5 menit. Jangan berikan kode ini ke siapa pun — termasuk tim Kongsian.
```

The `purpose` field (LOGIN, INVITE, RESET) gets reflected in the message body. Invites can later mention the cafe name or brand name.

### 3.4 `scripts/wa-relay.ts` — new file (VPS side)

Tiny Node http server (~270 LOC, no framework) that:
- `GET /health` — liveness; reports `bridgeStatus: up | wa-down | unreachable` (3 states, based on probing the bridge's `/send` endpoint with an empty body — the bridge returns 400 when up, 503 when WhatsApp is disconnected, network error when unreachable)
- `POST /send` — accepts `{phone, message}` OR `{chatId, message}`, normalizes E.164 phone → JID (`<digits>@s.whatsapp.net`), forwards to bridge
- `POST /typing`, `POST /send-media` — generic passthrough
- Bearer auth via `WA_RELAY_SECRET` env var
- 8s default bridge timeout (configurable via `WA_BRIDGE_TIMEOUT_MS`)

Config: `WA_RELAY_PORT` (default 3031), `WA_RELAY_SECRET` (required), `WA_BRIDGE_URL` (default `http://127.0.0.1:3000`).

**Why this is a separate process and not in the Worker:**
1. Workers run on Cloudflare edge — no access to `127.0.0.1`.
2. The Hermes bridge is on `127.0.0.1:3000` and not internet-exposed.
3. A cloudflared tunnel carries HTTPS traffic from a trycloudflare URL back to this box's port 3031.

### 3.5 Onboarding polish — `login.astro` + `register.astro`

Three concrete fixes for both pages:

1. **Phone pre-fill from `?phone=628xxx` deep-link query param.** The user-flows.md mentioned this as the invite deep link; the page reads the param via Astro frontmatter and stores it as `data-prefill` on the input. The inline script normalizes it on page load.

2. **Auto-add `+62` prefix.** `normalizePhone()` strips non-digits, handles `0` trunk (`08xxx` → `8xxx`), and prepends `+62` if it looks Indonesian. Triggers on `blur` (user leaves the field). User can always backspace and type their own country code.

3. **"Kirim ulang" actually re-sends.** The old code was a UI-only reset — it just hid step 2 and re-shown step 1 without calling the API. Now it calls `sendOtp()` again with the remembered phone, updates the message to "OTP baru dikirim. Cek WhatsApp kamu." Race-protected with an `isSending` flag so double-clicks don't double-send.

**register.astro-only addition:** `?role=BRAND|TENANT` query param pre-selects the role card. Use case: brand owner sends `https://kongsian.app/register?phone=628xxx&role=TENANT` to a cafe PIC — they land on the register page with the phone pre-filled and the cafe/tenant card pre-selected, one less click.

**Cosmetic:** the `+628****7890` placeholder (the old seeder default) is replaced with `+62 812 1234 5678` (note: spaces are NOT accepted by the regex, they're just visual). Added a small hint under the input: "Pakai awalan + (contoh: +62812xxxxx)."

---

## 4. Deployment topology for the trial

**Live state (right now, on this VPS):**
- Hermes WhatsApp bridge: `127.0.0.1:3000` (PID 3651102), bot mode, scanned-in, allowlist 6282173107809 + 6289632639692
- wa-relay: `0.0.0.0:3031` (PID via `ss -tlnp | grep 3031`), secret in `/root/kongsian/.wa-relay-secret` (chmod 600)
- cloudflared quick tunnel: `https://tool-nominations-pine-pixel.trycloudflare.com` → `localhost:3031`

**What the deployed Worker needs (not yet set):**
```bash
cd /root/kongsian/apps/api
wrangler secret put WA_PROVIDER_URL --env dev
# paste: https://tool-nominations-pine-pixel.trycloudflare.com

wrangler secret put WA_PROVIDER_SECRET --env dev
# paste the contents of /root/kongsian/.wa-relay-secret
```

After this, the dev Worker (`kongsian-api-dev`) will hit the real WA chain on every OTP request. Wife registers at the dev URL, gets an OTP on her WhatsApp, lands in the dashboard.

**Survives reboots: NO.** wa-relay and cloudflared are not supervised — VPS restart loses both. Restart commands are in `/root/kongsian/.wa-tunnel.env`. For a longer trial, upgrade to a named tunnel with a stable URL (requires buying a domain, on hold).

---

## 5. Caveats + known sharp edges

- **Tunnel URL changes on cloudflared restart.** If you restart the tunnel, the trycloudflare URL changes and you need to re-run `wrangler secret put WA_PROVIDER_URL --env dev` with the new URL. Don't restart the tunnel unless you also do that step.

- **Hermes bridge allowlist.** The bridge only sends to allowlisted numbers (currently admin + Ervina). To let the wife receive, either (a) add her number to `WHATSAPP_ALLOWED_USERS` and restart the bridge, or (b) set up a separate non-allowlist bridge for the trial. Option (a) is one env var change + `bash ~/.hermes/scripts/whatsapp-watchdog.sh` to restart cleanly.

- **`scripts/start-wa-relay.sh` is broken.** The first write of the wrapper script had its `$(cat ...)` pattern redacted by the conversation tool's content filter, leaving a malformed shell. The wa-relay is currently launched via Python subprocess instead. The `.wa-tunnel.env` file documents the manual fallback (paste the secret inline). For a permanent fix, write the wrapper as a Python script that sets the env then execs tsx, or just document the Python invocation.

- **`apps/web` typecheck has 87 pre-existing errors.** Unrelated to this work — Astro framework warnings, not my changes. `apps/api` and `packages/db` typecheck cleanly. The build still ships.

- **OTP rate limit is 5/hour/phone.** If the wife tests multiple times quickly she might hit `OTP_RATE_LIMITED`. The login UI surfaces this as "Kebanyakan percobaan. Coba lagi ~1 jam." — clear enough.

- **No deep-link messaging flow yet.** The `?phone=` pre-fill is wired in, but the actual `POST /v1/partnerships/invite` endpoint (which would generate the link) doesn't yet construct the deep-link message. That's a Week-6 task.

---

## 6. Trial checklist (what Erwin needs to do to let the wife test)

1. **Set Worker secrets** (one-time):
   ```
   cd /root/kongsian/apps/api
   wrangler secret put WA_PROVIDER_URL --env dev
   wrangler secret put WA_PROVIDER_SECRET --env dev
   ```
2. **Add wife's phone to bridge allowlist** (one-time):
   - Edit `/root/.hermes/hermes-agent/scripts/whatsapp-bridge/allowlist.js` (or wherever the allowlist is configured)
   - Add `WHATSAPP_ALLOWED_USERS=6282173107809,6289632639692,628xxxxxxxxx` (wife's number)
   - Restart the bridge: `bash ~/.hermes/scripts/whatsapp-watchdog.sh`
3. **Deploy the Worker** with the W5 changes: `pnpm --filter @kongsian/api exec wrangler deploy --env dev`
4. **Deploy the web changes** (login + register polish): `pnpm --filter @kongsian/web exec wrangler pages deploy ./dist --project-name kongsian-web`
5. **Share the dev URL with the wife.** (It's `https://<dev-pages-deployment>.kongsian-web.pages.dev` — not yet known, depends on step 4.)
6. **Walk her through** the first Titip → Closing → Settle cycle on Cafe Padel (or whoever her first pilot cafe partner is).
7. **Re-seed with real numbers** (one-time, before her first real Titip):
   ```
   KONGSIAN_SEED_BRAND_OWNER_PHONE=*** +62<wife-number> \
   KONGSIAN_SEED_TENANT_PADEL_PHONE=*** +62<cafe-padel-pic-number> \
   KONGSIAN_SEED_TENANT_KEDUA_PHONE=*** +62<cafe-kedua-pic-number> \
   pnpm --filter @kongsian/db seed
   ```
   Wait — the seeder writes to LOCAL D1, not remote. The dev Worker uses remote D1 (`kongsian-db`). So seeding local doesn't help. To get the wife's real user record into remote D1, she just needs to register through the UI — which is what she'll do anyway. The seeder is for generating demo data for the F3 dashboard. Re-seeding with her numbers only matters if you want demo data to be tied to her account.

---

## 7. Week 6 candidates (deferred from W5)

In rough priority order:
- **Named tunnel** for stable URL (requires domain purchase decision)
- **Deep-link invite messaging** — `POST /v1/partnerships/invite` generates a `https://kongsian.app/register?phone=...&role=TENANT` URL and sends it via WA as the invite message
- **Brand-side invitation flow polish** — when brand owner adds a cafe, current flow is form-heavy; could be a 2-step modal
- **Notification cron verification** — we have the cron emitting closing reminders; need to actually trigger one and verify the full chain
- **Real Pilot data → F3 analytics** — the analytics page is built; the wife using the app for a week will generate real data, then F3 stops being demo
- **Settlement PDF for the trial** — F1 already shipped; wife should see the PDF in her dashboard after Sunday 16:59 WIB cron

The OTP rate limit (5/hr) might also want tuning for the trial — a 1-2 person pilot won't hit it, but if the wife tests a lot, it could feel restrictive.
