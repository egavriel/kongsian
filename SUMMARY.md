# Kongsian — Ringkasan Proyek (untuk Erwin)

📅 Generated: 2 Juni 2026 · Owner: Eeveeon (MiniMax M3)

---

*Executive Summary*

Kongsian = SaaS konsinyasi multi-tenant buat brand (Hanniel) & cafe. Tujuannya: ganti Excel+WA group Hanniel jadi web app: brand catat Titip/Tarik, tenant catat Terjual+Sisa Fisik, system hitung Sisa Sistem & Selisih otomatis, Settlement mingguan di-generate Senin pagi brand approve 1-tap. MVP 4 minggu, 1 brand × 2 cafe dulu, produksi stable — bukan demo. Value portfolio: full-stack judgment di domain nyata (bukan todo list), edge cases beneran (selisih, dispute, audit trail).

---

*Tech Stack — Final*

• *Astro 4* (server output) — HTML ringan, 0KB JS default buat PIC cafe di 3G
• *Cloudflare Workers + D1 (SQLite)* — free tier cukup bertahun-tahun, <50ms cold start
• *Drizzle ORM* — edge-native, zero runtime, type-safe
• *Lucia v3* — auth session, di-extend ke phone+OTP (bukan email+password)
• *R2* — PDF settlement & logo brand
• *Workers Cron Triggers* — settlement generator Senin 00:00 WIB, reminder 21:00 WIB

*Why not Next.js / SvelteKit / Supabase?* Next.js edge+D1 masih kasar, RSC overkill buat 5 halaman. Supabase = vendor lock-in, kita mau own data. Astro menang karena showcase page juga Astro & mental model React-ish.

---

*MVP Features (compact)*

• Auth WA OTP (no password, no app, no onboarding)
• 3 dashboard: Brand / Tenant / Admin — mobile-first, single-column
• Brand: CRUD SKU, invite tenant by phone, catat Titip & Tarik harian
• Tenant: lihat SKU yg di-titip, catat Terjual + Sisa Fisik per-SKU per-hari
• Auto-compute: Sisa Sistem, Selisih, dispute flag (selisih≠0)
• Settlement auto-generate Senin 00:00 WIB, brand approve 1-tap, tenant read-only
• WA notification: OTP, daily reminder, settlement ready, selisih alert
• Audit log (siapa edit apa kapan — penting buat dispute)
• Public showcase page + PDF export settlement (R2)
• TZ: Asia/Jakarta hard-coded, currency: IDR no decimals

*OUT of MVP:* multi-currency, invoice/billing, mobile native, payment integration, multi-warehouse.

---

*Data Model — 7 Entity Inti*

• *User* — phone (e164), role (BRAND|TENANT|ADMIN), global_role
• *Brand* — owner (User), name, slug, logo (R2)
• *Tenant* — cafe, name, slug, address, PIC phone
• *SKU* — code, name, price_idr (integer), cost_idr, active
• *Partnership* — brand↔tenant, revenue_split (basis points, default 70:30), status
• *StockMovement* — append-only ledger (TITIP|TARIK|TERJUAL|ADJUSTMENT), qty signed, idempotency_key
• *Settlement* — week range, total_omzet, brand_share, tenant_share, status (DRAFT→PENDING_BRAND→APPROVED→PAID)

Plus: *PartnershipSku* (price override), *DailyClosing* + *DailyClosingLine* (per-SKU closing), *Dispute*, *OTP*, *Session*, *AuditLog*.

*Invariant kunci:* settlement Senin–Minggu hard-coded (never user-entered), idempotency_key unique (anti double-submit), stock movement append-only (audit trail = debug trail).

---

*4-Week Milestone*

• *Week 1* — Repo setup, Astro+CF+D1+Drizzle scaffolding, schema migration, Lucia+OTP stub, showcase page di kongsian.app
• *Week 2* — Brand dashboard (SKU CRUD, invite tenant), Tenant dashboard (view SKU), Titip/Tarik form, audit log
• *Week 3* — Daily closing flow (Terjual+Sisa Fisik), auto-compute Sisa Sistem+Selisih, dispute flag, WA notification (manual+cron)
• *Week 4* — Settlement generator (cron Senin 00:00), approval 1-tap, PDF export R2, admin dashboard, end-to-end test 13 acceptance criteria

---

*Keputusan Sudah Diambil (2 Jun 2026)*

• *Domain:* `kongsian.app` + vanity URL `kongsian.app/<brand>` (bukan .com, bukan subdomain)
• *Pricing:* Free trial 1–2 minggu per brand → paid tier (angka paid tier TBD setelah trial selesai)
• *WA Business:* Manual + Workers cron job untuk MVP — Meta Cloud API ditunda, tidak dipakai dulu

---

*Open Questions Kritis (masih pending)*

• *#4 Foto bukti selisih:* wajib atau opsional kalau selisih > 1 cup? (default: wajib)
• *#5 Settlement payout:* brand upload bukti transfer manual dulu, atau langsung integrasi Xendit? (default: manual MVP, Xendit v2)
• *#12 Cancellation cycle:* kalau brand Tarik semua stock, settlement close 5 hari kemudian atau beda? (default: 5 hari)
• *#14 Dispute escalation:* L1 brand (48h SLA) → L2 admin (Erwin) → L3 in-person — confirm?
• *#7 Brand KYC:* stub aja dulu (nama, NPWP opsional) atau skip sampai post-pilot?

---

*Next Action*

🟢 *Mulai Week 1 sekarang:* setup repo kongsian (monorepo apps/web + packages/shared), init Astro 4 + Cloudflare Workers + D1, generate Drizzle schema dari data-model.md, deploy showcase page ke kongsian.app. Butuh konfirmasi Erwin: apakah saya boleh push ke GitHub baru (private repo) atau mau dibuat manual dulu?

---

*File terkait di vault:*
• `implementation-plan.md` — full plan 4 minggu
• `data-model.md` — schema Drizzle + ERD + 10 invariant
• `open-questions.md` — 15 keputusan (3 sudah dijawab)
