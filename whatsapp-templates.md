# Kongsian — WhatsApp Templates

Templates are submitted to Meta for approval (the *24h customer service window* only allows free-form replies inside a session opened by the user; for proactive notifications we need pre-approved templates). Format follows WA Cloud API v18: `{{1}}` placeholders map to variables we fill in code.

**Type legend:**
- `TEXT` — sent inside a 24h user-initiated window, no template needed
- `TEMPLATE_NAME` — pre-approved template, sent proactively (settlement, alerts, OTPs)
- `TEMPLATE_AUTH` — special auth template category for OTP (cheaper, has its own approval lane)

**Variable format:** `{{1}}`, `{{2}}`, etc. Body text is what we submit for approval. *Char count* is the body as Meta counts it (English length; emoji count as 2).

---

## a) OTP code

- **Template name (Meta):** `kongsian_otp`
- **Template type:** `TEMPLATE_AUTH` (auth category)
- **Trigger:** `POST /api/v1/auth/otp/request`
- **Language:** `id` (Indonesian)
- **Variables:** `{{1}}` = 6-digit code
- **Body (submitted):**
  > Kode Kongsian Anda: *{{1}}*. Berlaku 5 menit. Jangan berikan ke siapa pun.
- **Char count:** 73
- **Notes:** Add a `button` of type `URL` with `https://kongsian.com/verify?otp={{1}}` for one-tap verification (optional, second pass).

---

## b) Daily reminder — Belum input Terjual (21:00)

- **Template name:** `kongsian_reminder_closing`
- **Template type:** `TEMPLATE_NAME` (utility)
- **Trigger:** Cron 21:00 WIB, only for PICs who haven't submitted today's closing
- **Language:** `id`
- **Variables:** `{{1}}` = cafe name, `{{2}}` = PIC first name, `{{3}}` = deep link
- **Body:**
  > Halo {{2}} 👋
  > Belum input closing {{1}} hari ini.
  > Ketuk untuk isi 30 detik:
  > {{3}}
- **Char count:** 121
- **Cap:** Max 1 per PIC per day; cron dedupes.

---

## c) Low-stock alert to brand

- **Template name:** `kongsian_low_stock`
- **Template type:** `TEMPLATE_NAME` (utility)
- **Trigger:** After tenant submits closing, if any SKU `sisa_fisik <= 2` cups (configurable per SKU in Phase 2)
- **Language:** `id`
- **Variables:** `{{1}}` = brand owner first name, `{{2}}` = cafe name, `{{3}}` = SKU list, `{{4}}` = deep link
- **Body:**
  > {{1}}, stok menipis di {{2}}:
  > {{3}}
  > Restock sekarang? {{4}}
- **Char count:** 95
- **Cap:** Max 1 per brand per cafe per day.

---

## d) Pullback window reminder (Day 5)

- **Template name:** `kongsian_pullback_reminder`
- **Template type:** `TEMPLATE_NAME` (utility)
- **Trigger:** Cron 06:00 WIB, for `TITIP` movements where day_diff(now, movement_date) === 5 and no subsequent `TITIP` for same `(partnership, sku)`.
- **Language:** `id`
- **Variables:** `{{1}}` = brand owner name, `{{2}}` = cafe name, `{{3}}` = SKU + qty, `{{4}}` = remaining days, `{{5}}` = link
- **Body:**
  > {{1}}, *{{2}}* belum restock {{3}} dalam 5 hari.
  > Batas simpan hampir habis ({{4}} hari lagi).
  > Tarik atau restock? {{5}}
- **Char count:** 138
- **Cap:** Once per `(partnership, sku, titip-movement-id)`.

---

## e) Weekly settlement ready

- **Template name:** `kongsian_settlement_ready`
- **Template type:** `TEMPLATE_NAME` (utility)
- **Trigger:** Sunday 20:00 WIB, after cron generates settlements
- **Language:** `id`
- **Variables:** `{{1}}` = brand owner name, `{{2}}` = week range, `{{3}}` = total omzet, `{{4}}` = brand share, `{{5}}` = open dispute count, `{{6}}` = link
- **Body:**
  > Hai {{1}} 👋
  > Settlement minggu {{2}} sudah siap.
  > Omzet: *Rp {{3}}*
  > Bagimu: *Rp {{4}}*{{5}}
  > Setujui: {{6}}
- **`{{5}}` snippet when disputes > 0:** ` · {{5}} dispute perlu dilihat`
- **Char count:** 130 (no disputes), 158 (with disputes)
- **Cap:** Once per settlement.

---

## f) Settlement approved

- **Template name:** `kongsian_settlement_approved`
- **Template type:** `TEMPLATE_NAME` (utility)
- **Trigger:** Brand taps Approve
- **Language:** `id`
- **Variables:** `{{1}}` = PIC first name, `{{2}}` = cafe name, `{{3}}` = week range, `{{4}}` = tenant share, `{{5}}` = brand payout instructions
- **Body:**
  > {{1}}, settlement {{2}} untuk {{3}} sudah disetujui.
  > Bagian cafe: *Rp {{4}}*.
  > {{5}}
- **Char count:** 115
- **Cap:** Once per settlement.

---

## g) Selisih alert (|selisih| > 1)

- **Template name:** `kongsian_selisih_alert`
- **Template type:** `TEMPLATE_NAME` (utility)
- **Trigger:** Closing submitted, `|selisih| > 1` for any line
- **Language:** `id`
- **Variables:**
  - **To brand:** `{{1}}` = brand name, `{{2}}` = cafe name, `{{3}}` = SKU, `{{4}}` = selisih (signed), `{{5}}` = link
  - **To tenant PIC:** `{{1}}` = PIC name, `{{2}}` = cafe name, `{{3}}` = SKU, `{{4}}` = selisih, `{{5}}` = link
- **Body (brand version):**
  > {{1}}, selisih *{{4}} cup {{3}}* di {{2}}.
  > Mohon cek dispute thread: {{5}}
- **Body (tenant version):**
  > {{1}}, closing {{2}} sore ini ada selisih *{{4}} cup {{3}}*.
  > Diskusi dengan brand di: {{5}}
- **Char count:** 96
- **Cap:** One per dispute, but a single closing can fire multiple (one per SKU with selisih).

---

## h) Welcome (first login)

- **Template name:** `kongsian_welcome`
- **Template type:** `TEMPLATE_NAME` (utility)
- **Trigger:** First successful OTP verify (user record newly created)
- **Language:** `id`
- **Variables:** `{{1}}` = first name, `{{2}}` = role (brand/tenant/admin), `{{3}}` = deep link to dashboard
- **Body:**
  > Selamat datang di Kongsian, {{1}} 🎉
  > Anda terdaftar sebagai *{{2}}*.
  > Mulai dari dashboard: {{3}}
- **Char count:** 105
- **Cap:** Once per user (track via `users.welcomed_at` flag).

---

## i) Partnership invite (brand → tenant)

- **Template name:** `kongsian_partnership_invite`
- **Template type:** `TEMPLATE_NAME` (marketing utility — utility category, but with promotional tone for the brand)
- **Trigger:** Brand submits new partnership with PIC phone
- **Language:** `id`
- **Variables:** `{{1}}` = PIC name, `{{2}}` = brand name, `{{3}}` = cafe name (if brand typed it), `{{4}}` = link with pre-filled phone
- **Body:**
  > Hai {{1}}, *{{2}}* mengundang *{{3}}* untuk gabung di Kongsian.
  > Catat stok titip & closing harian via WhatsApp. Tanpa install app.
  > Daftar: {{4}}
- **Char count:** 156
- **Cap:** Once per `(partnership, otp_purpose='INVITE')`. Resend button in UI triggers a *different* template `kongsian_invite_resend` with a softer body.

---

## Operational notes

- **All templates submitted to Meta in `id` first.** Submit English (`en`) fallback in the same template to avoid locale issues for non-Indonesian devices.
- **Template quality rating:** Meta downgrades templates that users mark as spam / block. We monitor via Cloudflare Analytics + WA `messages` webhook on `block`/`spam_report` events; auto-pause a template if quality drops to `RED`.
- **Free-form replies (TEXT) are only allowed within 24h of a user's last inbound message.** Settlement disputes and brand chat can be handled as free-form once a user has opened the dispute thread.
- **Locale fallback chain:** `id-ID` → `id` → `en`. WA picks first available; we always submit in the user's UWP `language` if it matches, else default to `id`.
- **Char count includes variable substitution length** (Meta measures rendered length). Templates that risk >1024 chars split into a header (medium) + body (text) structure.
- **Per-template cost (Meta):** Auth $0.0, Utility ~$0.005, Marketing ~$0.012 (SG pricing; ID is lower). Budget assumes < 2,000 msgs/month during pilot.

---

## Variables-glossary (canonical naming in code)

| Code var | Meaning | Example |
|----------|---------|---------|
| `picFirstName` | First name from `users.name`, split on space | `Rina` |
| `brandName` | `brands.name` | `Hanniel Overnight Oats` |
| `cafeName` | `tenants.name` | `Cafe Padel Jaksel` |
| `skuName` | `skus.name` | `Double Choco` |
| `qtyIdr` | Money formatted with `Rp` + thousand sep, no decimals | `Rp 1.260.000` |
| `qtyNumber` | Integer | `12` |
| `weekRange` | `26 Mei–1 Jun` (Indonesian month abbreviations) | `2 Jun–8 Jun` |
| `deepLink` | `https://kongsian.com/...?phone=...` | `https://kongsian.com/login?phone=6281234567890` |
| `signedSelisih` | `+1` / `−1` (uses Unicode minus) | `−1` |
