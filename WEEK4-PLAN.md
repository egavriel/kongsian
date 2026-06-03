# Kongsian — Week 4 Plan

> Planner: Opus 4.8 · Tanggal: 2026-06-03 · Base commit: `1026c98`
> Fokus: bikin **money-flow real & visible** untuk first real settlement cycle Bu Ervina (Hanniel bakery).

---

## ⚠️ Pre-flight: 2 latent bug ditemukan saat audit (HARUS dibaca dulu)

1. **Settlement cron MATI di prod.** `apps/api/wrangler.toml:12` kirim `"59 16 * * 7"`, tapi `apps/api/src/cron.ts:206` cuma branch `if (cron === "59 16 * * 0")`. String literal nggak match → `generateWeeklySettlements` **tidak pernah jalan** lewat cron. Kemungkinan besar **0 settlement ter-generate otomatis di prod sampai sekarang**. (Commit `e099c0b` "fix CF cron 0→7" cuma ganti wrangler, lupa update branch di cron.ts.)

2. **R2 tidak ter-bind di prod.** `apps/api/wrangler.toml` cuma punya `[[d1_databases]]`, **tidak ada `[[r2_buckets]]`**. Code expect `c.env.KONGSIAN_BUCKET` (`apps/api/src/routes/uploads.ts:73`, `index.ts:60`). Artinya **semua upload (titip foto, tarik foto, dispute foto, bukti bayar) jalan di stub/503 mode di production**. Step "tenant upload bukti bayar" yang katanya jalan — sebenernya belum nyimpen file beneran.

Kedua hal ini jadi fondasi sprint Week 4.

---

## A) RANKED FEATURE LIST

| # | Feature | Impact untuk Bu Ervina | Complexity | Tier |
|---|---------|------------------------|-----------|------|
| F0 | **Fix settlement cron + R2 provisioning** (2 bug di atas) | Tanpa ini, settlement mingguan & bukti bayar nggak real. Pondasi. | S | **MUST** |
| F1 | **Settlement PDF export** (`pdfR2Key` udah ada) | Brand bisa print/share rekap settlement ke WA buat akunting. Hal pertama yang Ervina butuh tiap Senin. | M | **MUST** |
| F2 | **Notification bell (frontend)** | API udah ada, UI belum. Ervina lihat "settlement ready / dispute opened" tanpa harus cek WA. | S/M | **MUST** |
| F3 | **Analytics: top SKU + tren penjualan per cafe** | Bantu Ervina putusin jumlah produksi (keputusan bakery nyata: bikin berapa banyak besok). | M | SHOULD |
| F4 | **Auto-open dispute rule** (selisih > threshold → auto OPEN) | Kurangi kerja manual flag; dispute kebuka otomatis pas closing aneh. | M | NICE |
| F5 | **Super-admin support dashboard** | Erwin nggak perlu buka sqlite buat support. Erwin-facing, bukan Ervina. | M | NICE |
| F6 | **E2E smoke harness** (Playwright/Vitest) | Quality gate sebelum makin banyak cafe. | M | NICE |

**Justifikasi ranking:** F0–F2 semuanya nempel ke satu loop kritis — *brand titip → tenant closing → settlement Senin → brand approve → tenant bayar → semua kelihatan*. Itu yang harus solid untuk real use. F3 nilai bisnisnya tinggi tapi read-only (nggak blocking). F4–F6 efisiensi/quality, bisa Week 5.

---

## B) DETAIL PER FEATURE

### F0 — Fix settlement cron + R2 provisioning  · **S**

**User story:** Sebagai Ervina, tiap Senin pagi settlement minggu lalu sudah otomatis ter-generate; dan saat tenant upload bukti bayar, file-nya benar-benar tersimpan & bisa dilihat brand.

**Acceptance criteria:**
- [ ] `cron.ts:206` branch cocok dgn string di wrangler.toml (samakan jadi `"59 16 * * 7"`, atau normalisasi keduanya). Verifikasi via `wrangler tail` ada log `[CRON-SETTLEMENT]` hari Minggu.
- [ ] `[[r2_buckets]] binding = "KONGSIAN_BUCKET"` ada di `wrangler.toml`, bucket dibuat (`wrangler r2 bucket create kongsian-media`).
- [ ] `POST /v1/uploads/presign` → `PUT /v1/uploads/proxy` nyimpen objek real (bukan stub), `GET` balikin file.
- [ ] One-off backfill: jalankan `generateSettlements` manual untuk minggu-minggu yang kelewat (admin endpoint / script) supaya history nggak bolong.

**Files:**
- `apps/api/wrangler.toml` (tambah `[[r2_buckets]]`, samakan cron string)
- `apps/api/src/cron.ts` (fix branch)
- `apps/api/src/routes/uploads.ts` (verifikasi path non-stub, R2 metadata)
- `scripts/backfill-settlements.ts` (baru — panggil `generateSettlements` per minggu yang kosong)

**Migration:** Tidak ada.
**Dependencies:** Tidak ada. **Prereq untuk F1.**

---

### F1 — Settlement PDF export  · **M**

**User story:** Sebagai brand (Ervina), setelah settlement BRAND_APPROVED, saya klik "Download PDF" dan dapat rekap rapi (minggu, per-SKU terjual, omzet, split brand/tenant, total bayar) untuk di-share ke WhatsApp / arsip.

**Acceptance criteria:**
- [ ] `GET /v1/settlements/:id/pdf` → balikin PDF (IDR tanpa desimal, format `Rp1.250.000`, tanggal WIB, Bahasa Indonesia).
- [ ] PDF di-cache di R2 pakai `settlements.pdf_r2_key` (kolom **sudah ada**, `settlements.ts:35`). Generate sekali, re-serve dari R2.
- [ ] IDOR scoping: hanya member partnership (brand atau tenant) yang boleh akses (pakai pola scoping yang sama dengan `routes/settlements.ts`).
- [ ] Frontend: tombol "Download PDF" di `dashboard/brand/settlements/[id].astro` dan `dashboard/tenant/...`.
- [ ] PDF generation **murni JS** (lihat Risk: Workers nggak bisa puppeteer).

**Files:**
- `apps/api/src/lib/pdf.ts` (baru — render via `pdf-lib` atau `pdfmake`)
- `apps/api/src/routes/settlements.ts` (tambah route `/:id/pdf`)
- `apps/api/package.json` (dep `pdf-lib`)
- `apps/web/src/pages/dashboard/brand/settlements/[id].astro`
- `apps/web/src/lib/api.ts` (helper download)

**Migration:** Tidak ada (kolom `pdf_r2_key` sudah ada). *Opsional:* `ALTER disputes ADD pdf_r2_key` kalau mau dispute print juga (defer ke Week 5).
**Dependencies:** **F0** (butuh R2 hidup).

---

### F2 — Notification bell (frontend)  · **S/M**

**User story:** Sebagai user (brand/tenant), saya lihat lonceng dengan badge jumlah unread di header; klik → list notif; klik item → ke entity terkait (settlement/dispute/closing); auto mark-read.

**Acceptance criteria:**
- [ ] Komponen lonceng di `Layout.astro`, poll `GET /v1/notifications` tiap ~45 dtk (Workers/Pages — polling, bukan SSE).
- [ ] Badge = count `readAt IS NULL`. Klik item → `POST /v1/notifications/:id/read` lalu navigate via `entityType`/`entityId` (`notifications.ts:36-37`).
- [ ] Mapping `kind` → ikon + teks Bahasa (9 kind: CLOSING_REMINDER, SETTLEMENT_READY, DISPUTE_OPENED, dst — `notifications.ts:21-33`).
- [ ] Empty state jelas ("Belum ada notifikasi") — UI self-explanatory untuk non-teknis.

**Files:**
- `apps/web/src/components/NotificationBell.astro` (baru, + island JS)
- `apps/web/src/layouts/Layout.astro` (mount lonceng)
- `apps/web/src/lib/api.ts` (`getNotifications`, `markRead`)

**Migration:** Tidak ada (API & tabel `notifications` sudah ada).
**Dependencies:** Tidak ada.

---

### F3 — Analytics: top SKU + tren per cafe  · **M** *(SHOULD)*

**User story:** Sebagai brand, saya lihat dashboard "minggu ini vs minggu lalu": SKU terlaris, total terjual per cafe, tren 4 minggu — biar tahu mau produksi berapa.

**Acceptance criteria:**
- [ ] `GET /v1/brands/:brandId/analytics?weeks=4` → agregasi dari `stock_movements` (kind TERJUAL*) + `settlement_lines`, scoped ke brand.
- [ ] Top-5 SKU by qty & omzet; breakdown per tenant; sparkline 4 minggu.
- [ ] Angka konsisten dgn settlement (sumber: `daily_closing_lines` / `settlement_lines`).

**Files:**
- `apps/api/src/routes/brands.ts` (route analytics) atau `routes/analytics.ts` baru
- `apps/api/src/lib/analytics.ts` (baru — query agregasi)
- `apps/web/src/pages/dashboard/brand/index.astro` (kartu analytics)

**Migration:** Tidak ada tabel baru. *Opsional* index: `idx_mov_kind_date` di `stock_movements` kalau query lambat (data masih kecil, kemungkinan nggak perlu).
**Dependencies:** F0 (data settlement lengkap).

---

### F4 — Auto-open dispute rule  · **M** *(NICE)*

**User story:** Saat tenant submit closing dan selisih (sistem hitung vs fisik) lewat threshold, dispute OPEN otomatis — nggak nunggu flag manual.

**Acceptance criteria:**
- [ ] Saat `daily_closings` → SUBMITTED, untuk tiap line dgn `|selisih| ≥ threshold` → insert `disputes` (status OPEN, `openedByRole='ADMIN'`/system) + notif DISPUTE_OPENED.
- [ ] Threshold per partnership, configurable, default mis. 2 qty.
- [ ] Idempotent: nggak dobel dispute untuk `daily_closing_line_id` yang sama (`disputes.dailyClosingLineId` udah ada, `disputes.ts:19`).

**Files:**
- `apps/api/src/routes/closings.ts` (hook di submit)
- `apps/api/src/lib/stock.ts` atau `lib/dispute.ts` baru
- `packages/db/src/schema/partnerships.ts` (kolom threshold)

**Migration:** `ALTER partnerships ADD COLUMN dispute_auto_threshold_qty integer DEFAULT 2`.
**Dependencies:** Tidak ada, tapi pegang invariant I9 (post-SUBMITTED cuma ADJUSTMENT).

---

### F5 — Super-admin support dashboard  · **M** *(NICE)*

**User story:** Sebagai Erwin (admin), saya lihat read-only daftar user/brand/tenant/partnership + filter, tanpa buka sqlite, untuk handle support.

**Acceptance criteria:** read-only listing + search; reuse `routes/admin.ts` (sudah ada `/users`, `/pending-count`); halaman admin baru; tetap di belakang verification/role gate.

**Files:** `apps/web/src/pages/admin/index.astro` (+ sub-pages), `apps/api/src/routes/admin.ts` (endpoint list tambahan).
**Migration:** Tidak ada. **Dependencies:** Tidak ada.

---

### F6 — E2E smoke harness  · **M** *(NICE)*

Playwright untuk golden path: login OTP (dev 123456) → titip → closing → settlement → approve → upload bukti. Files: `apps/web/tests/e2e/*.spec.ts`, `playwright.config.ts`. No migration.

---

## C) RECOMMENDED WEEK 4 SPRINT (1 minggu)

**MUST-HAVE (commit ini):**
- **F0** — fix settlement cron + R2 provisioning *(S)*
- **F1** — settlement PDF export *(M)*
- **F2** — notification bell frontend *(S/M)*

**SHOULD (kalau waktu sisa):**
- **F3** — analytics top SKU + tren *(M)*

**Rationale:** F0→F1→F2 = bikin satu loop uang **benar-benar jalan + kelihatan** untuk first real cycle Ervina. F0 dulu (pondasi: tanpa R2, F1 nggak bisa; tanpa cron fix, nggak ada settlement buat di-PDF). F2 paralel (frontend, no dep). F3 ditarik hanya jika F0–F2 selesai sebelum hari ke-4.

**Defer ke Week 5:** F4 (auto-dispute), F5 (admin dash), F6 (E2E), + WA Cloud API real, email fallback, multi-bahasa, backup/restore D1.

**Urutan kerja:** F0 (hari 1) → F1 backend+lib (hari 2-3) → F1 frontend + F2 (hari 3-4) → F3 jika sempat (hari 4-5) → smoke manual + deploy (hari 5).

---

## D) RISKS / EDGE CASES

1. **Workers ≠ Puppeteer.** Cloudflare Workers nggak bisa headless Chrome di runtime biasa. PDF **harus** pakai lib JS murni (`pdf-lib` / `pdfmake`) atau Browser Rendering binding (berbayar, perlu binding). → pilih `pdf-lib`. Lihat Open Q1.
2. **Settlement history bolong.** Karena cron mati, prod mungkin **belum punya settlement sama sekali**. Backfill manual wajib sebelum demo ke Ervina (F0 script).
3. **R2 binding nyalain bug tersembunyi.** Selama ini stub path nutupin error. Pas binding aktif, presign/proxy (`uploads.ts`) bisa munculin signing/CORS/content-type bug. Test titip foto end-to-end.
4. **IDOR di endpoint PDF.** `GET /:id/pdf` wajib scoping member-partnership — jangan bocorin settlement antar tenant. Reuse pola scoping `routes/settlements.ts`. **P0 contract, jangan dilanggar.**
5. **IDR & font.** PDF: `Rp` + ribuan titik, no desimal; pastikan font embed dukung karakter Bahasa. Timezone semua WIB.
6. **Verification gate.** Bell & PDF tetap di belakang auth + verification gate; jangan render untuk user unverified.
7. **Polling cost.** Bell poll 45s × banyak tab = beban. Pause saat tab hidden (`visibilitychange`).
8. **Cron `7` vs `0` Minggu.** CF terima 0–7 (0 & 7 = Minggu) di *parsing*, tapi `event.cron` adalah **string literal** dari wrangler.toml → branch harus identik string. Asia/Jakarta no DST, aman.
9. **PDF cache invalidation.** Kalau settlement berubah status (PAID), `pdf_r2_key` lama jadi stale. Regenerate saat status berubah, atau stamp status di PDF.

---

## E) MIGRATION 0004 PLAN

**Untuk sprint MUST (F0–F2): TIDAK ADA migration.** F0=config, F1 pakai `settlements.pdf_r2_key` yang sudah ada, F2 pakai tabel `notifications` yang sudah ada. Risiko DB nol.

**Jika F3 masuk:** opsional index only —
```sql
-- 0004_week4.sql (opsional, hanya jika query analytics lambat)
CREATE INDEX IF NOT EXISTS idx_mov_kind_date ON stock_movements (kind, movement_date);
```

**Jika F4 (auto-dispute) ditarik ke sprint:**
```sql
ALTER TABLE partnerships ADD COLUMN dispute_auto_threshold_qty integer DEFAULT 2;
ALTER TABLE disputes      ADD COLUMN pdf_r2_key text;   -- opsional, untuk dispute print
```
Semua additive (ADD COLUMN nullable / DEFAULT) — **tidak breaking**, tidak nyentuh P0 contract (OTP HMAC, IDOR scoping, verification gate). Tabel & enum lama tidak diubah.

> Tabel existing yang relevan (Drizzle, `packages/db/src/schema/`): `settlements`, `settlement_lines`, `daily_closings`, `daily_closing_lines`, `disputes`, `dispute_messages`, `stock_movements`, `partnerships`, `partnership_skus`, `notifications`, `closing_photos`, `skus`, `tenant_memberships`. Tidak ada tabel baru di sprint.

---

## F) DEPLOYMENT PLAN

- **Cron: tetap 3 schedule, TIDAK ada cron baru.** Yang berubah: **perbaiki** schedule #3 (samakan string wrangler.toml ↔ cron.ts). PDF di-generate **on-demand** di request handler (bukan cron) → lazy + cache R2. (Opsi pre-warm PDF lewat cron Minggu = over-engineering untuk 2 partnership, skip.)
- **R2:** `wrangler r2 bucket create kongsian-media` → tambah `[[r2_buckets]] binding="KONGSIAN_BUCKET"` di wrangler.toml → `wrangler deploy`.
- **Secrets:** tidak ada baru untuk sprint (presign reuse `OTP_HMAC_KEY`). WA secrets (`WA_PHONE_ID`/`WA_TOKEN`) tetap stub — di luar sprint.
- **Migration:** sprint MUST = tidak perlu `wrangler d1 migrations apply`. Kalau F4 ditarik, baru jalankan 0004.
- **Web:** Pages deploy seperti biasa (`apps/web`).
- **Urutan deploy:** (1) R2 bucket → (2) wrangler.toml (binding + cron fix) → (3) `wrangler deploy` API → (4) backfill settlements → (5) smoke (PDF, bell, upload foto) → (6) Pages deploy web.
- **Rollback:** R2 binding & cron fix additive/idempotent; PDF route baru tidak ganggu route lama. Aman.

---

## G) OPEN QUESTIONS UNTUK ERWIN

1. **PDF engine:** `pdf-lib` (programmatic, ringan, layout manual) **vs** Cloudflare Browser Rendering binding (HTML→PDF, cantik, berbayar + perlu binding)? Rekomendasi: `pdf-lib` dulu. → **decision needed.**
2. **R2 bucket:** OK provision sekarang? Nama bucket `kongsian-media`? Biaya R2 OK?
3. **Backfill:** Mau generate ulang settlement minggu-minggu yang kelewat (karena cron mati), atau mulai bersih dari minggu depan?
4. **WA Cloud API:** Provision Meta sekarang (notif real ke WA) atau tetap stub Week 4? Tanpa ini, bell jadi satu-satunya kanal notif in-app.
5. **Analytics (F3):** Metrik mana yang paling Ervina pengen lihat — top SKU, tren mingguan, atau perbandingan antar cafe? (biar nggak bikin chart yang nggak kepake)
6. **Auto-dispute threshold (kalau F4):** Selisih dalam **qty absolut** (mis. ≥2 pcs) atau **persentase**? Berapa default-nya?
7. **PDF isi:** Cukup rekap settlement, atau Ervina butuh juga invoice format (header brand, nomor, tanggal jatuh tempo) untuk akunting?
8. **Multi-bahasa:** Tetap Bahasa Indonesia saja Week 4? (asumsi ya — Ervina & cafe lokal)
