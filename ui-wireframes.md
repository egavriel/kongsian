# Kongsian — UI Wireframes

All wireframes are mobile-first (375px viewport, single column). ASCII boxes use `┌─┐│└┘├┤┬┴┼` for the mobile frame and `▣` for primary tap targets. Tap targets are min 44×44px. Bahasa Indonesia for user-facing copy, English in admin/code paths.

**Frame convention:**
```
┌──────────────────────────────────┐  ← status bar (44px)
│ 9:41            📶 100%   ⋯    │
├──────────────────────────────────┤
│  ← Back          Title     ⋯    │  ← app bar (56px)
├──────────────────────────────────┤
│                                  │
│           (content)              │
│                                  │
├──────────────────────────────────┤
│  🏠         📊          👤       │  ← bottom nav (56px)
└──────────────────────────────────┘
```

---

## a) Login — WA OTP

```
┌──────────────────────────────────┐
│ 9:41            📶 100%   ⋯    │
├──────────────────────────────────┤
│                                  │
│         [Kongsian logo]          │
│                                  │
│      Stok & Settlement           │
│      untuk cafe & brand          │
│                                  │
│  ┌────────────────────────────┐  │
│  │ 🇮🇩  +62  812 xxxx 7890   │  │  ← phone input, E.164
│  └────────────────────────────┘  │
│                                  │
│  ┌────────────────────────────┐  │
│  │       KIRIM KODE OTP       │  │  ← primary CTA, 48px tall
│  └────────────────────────────┘  │
│                                  │
│  Kami kirim kode via WhatsApp.   │
│  Tidak ada password.             │
│                                  │
└──────────────────────────────────┘

        (after request sent)

┌──────────────────────────────────┐
│ 9:41            📶 100%   ⋯    │
├──────────────────────────────────┤
│  ←  Verifikasi                   │
├──────────────────────────────────┤
│                                  │
│  Masukkan 6 digit kode           │
│  yang kami kirim ke WhatsApp     │
│  +62 812 xxxx 7890               │
│                                  │
│   ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐  │
│   │ 4│ │ 8│ │ 2│ │ 9│ │ 1│ │ 0│  │  ← 6 single-digit boxes
│   └──┘ └──┘ └──┘ └──┘ └──┘ └──┘  │
│                                  │
│  Kode kadaluarsa dalam 04:23     │
│                                  │
│  ┌────────────────────────────┐  │
│  │        VERIFIKASI          │  │  ← enabled when 6 digits
│  └────────────────────────────┘  │
│                                  │
│      Kirim ulang (00:47)         │  ← disabled countdown
│                                  │
└──────────────────────────────────┘
```

---

## b) Tenant dashboard

```
┌──────────────────────────────────┐
│ 9:41            📶 100%   ⋯    │
├──────────────────────────────────┤
│  Halo, Rina 👋                    │
│  Cafe Padel Jaksel               │
├──────────────────────────────────┤
│                                  │
│  ⚠️ Closing hari ini belum diisi  │  ← alert banner (red)
│     3 SKU belum diinput           │
│     [ISI SEKARANG →]             │  ← big tap
│                                  │
├──────────────────────────────────┤
│                                  │
│  📦 Stok Hanniel (3 SKU)         │
│  ┌────────────────────────────┐  │
│  │ Double Choco   Sisa: 6    │  │  ← per-SKU card
│  │ Rp 42.000                   │  │
│  │ Hari ini: 4 terjual        │  │
│  └────────────────────────────┘  │
│  ┌────────────────────────────┐  │
│  │ Strawberry     Sisa: 8    │  │
│  │ ...                         │  │
│  └────────────────────────────┘  │
│                                  │
├──────────────────────────────────┤
│  🏠 Beranda  📜 Riwayat  👤 Aku │
└──────────────────────────────────┘
```

---

## c) Tenant: input Terjual

```
┌──────────────────────────────────┐
│ ←  Closing · Sel, 2 Jun          │
├──────────────────────────────────┤
│                                  │
│  Step 1/2 · Terjual              │
│  Ketuk +/- untuk jumlah cup      │
│  yang terjual hari ini.          │
│                                  │
│  Double Choco  Rp 42.000          │
│  ┌──┐            ┌──┐            │
│  │− │     4      │+ │            │  ← large +/- buttons
│  └──┘            └──┘            │
│                                  │
│  Strawberry    Rp 42.000          │
│  ┌──┐            ┌──┐            │
│  │− │     2      │+ │            │
│  └──┘            └──┘            │
│                                  │
│  Tiramisu      Rp 45.000          │
│  ┌──┐            ┌──┐            │
│  │− │     0      │+ │            │
│  └──┘            └──┘            │
│                                  │
│  ┌────────────────────────────┐  │
│  │  LANJUT KE SISA FISIK →   │  │  ← next step
│  └────────────────────────────┘  │
│                                  │
└──────────────────────────────────┘
```

---

## d) Tenant: input Sisa Fisik

```
┌──────────────────────────────────┐
│ ←  Closing · Sel, 2 Jun          │
├──────────────────────────────────┤
│                                  │
│  Step 2/2 · Sisa Fisik           │
│  Hitung cup yang masih ada       │
│  di chiller.                     │
│                                  │
│  Double Choco                     │
│  Sisa Sistem: 6    Selisih: ?    │
│  ┌────────────────────────────┐  │
│  │          6                 │  │  ← numeric input, big
│  └────────────────────────────┘  │
│  📷 Foto chiller (opsional)      │
│  ┌────────────────────────────┐  │
│  │     [KAMERA]                │  │
│  └────────────────────────────┘  │
│                                  │
│  Strawberry                       │
│  Sisa Sistem: 8    Selisih: ?    │
│  ┌────────────────────────────┐  │
│  │          8                 │  │
│  └────────────────────────────┘  │
│                                  │
│  Tiramisu                         │
│  Sisa Sistem: 10   Selisih: ?    │
│  ┌────────────────────────────┐  │
│  │          10                │  │
│  └────────────────────────────┘  │
│                                  │
│  ┌────────────────────────────┐  │
│  │  ⚠ 1 selisih terdeteksi   │  │  ← live warning
│  │  Tenang, tinggal submit.   │  │
│  └────────────────────────────┘  │
│                                  │
│  ┌────────────────────────────┐  │
│  │      KUNCI & SUBMIT        │  │  ← primary
│  └────────────────────────────┘  │
│                                  │
└──────────────────────────────────┘
```

---

## e) Brand dashboard

```
┌──────────────────────────────────┐
│ 9:41            📶 100%   ⋯    │
├──────────────────────────────────┤
│  Hanniel Overnight Oats  ⚙️      │
├──────────────────────────────────┤
│                                  │
│  📊 Minggu ini (2-8 Jun)         │
│  ┌────────────────────────────┐  │
│  │ Omzet      Rp 1.260.000   │  │  ← big number
│  │ Bagiku     Rp   882.000   │  │  ← 70%
│  │ Partner    Rp   378.000   │  │
│  └────────────────────────────┘  │
│                                  │
│  ⚠️ 2 alert                      │
│  ┌────────────────────────────┐  │
│  │ 🔴 Stok rendah:            │  │
│  │   Cafe Padel · DC tinggal 2│  │
│  ├────────────────────────────┤  │
│  │ 🟡 Settlement belum        │  │
│  │   diapprove: 1 partner     │  │
│  └────────────────────────────┘  │
│                                  │
│  ☕ Partner (2)                   │
│  ┌────────────────────────────┐  │
│  │ Cafe Padel Jaksel         │  │
│  │ Stok total: 16 · Not yet   │  │
│  ├────────────────────────────┤  │
│  │ Kopi Kenangan Senopati    │  │
│  │ Stok total: 22 · Submitted│  │
│  └────────────────────────────┘  │
│                                  │
├──────────────────────────────────┤
│  🏠 Beranda  📦 SKU  📜 Settle │
└──────────────────────────────────┘
```

---

## f) Brand: input Titip

```
┌──────────────────────────────────┐
│ ←  Titip · Cafe Padel            │
├──────────────────────────────────┤
│                                  │
│  Tanggal: 2 Juni 2025            │
│  Partner: Cafe Padel Jaksel      │
│                                  │
│  SKU          Harga   Qty        │
│  ┌────────────────────────────┐  │
│  │ Double Choco   42k  [ 10 ]│  │
│  ├────────────────────────────┤  │
│  │ Strawberry     42k  [  8 ]│  │
│  ├────────────────────────────┤  │
│  │ Tiramisu       45k  [  6 ]│  │
│  └────────────────────────────┘  │
│                                  │
│  Total cup: 24                   │
│  Total nilai: Rp 1.086.000       │
│                                  │
│  Catatan (opsional):             │
│  ┌────────────────────────────┐  │
│  │                            │  │
│  └────────────────────────────┘  │
│                                  │
│  ┌────────────────────────────┐  │
│  │      KIRIM TITIP           │  │  ← primary
│  └────────────────────────────┘  │
│                                  │
└──────────────────────────────────┘
```

---

## g) Brand: input Tarik

```
┌──────────────────────────────────┐
│ ←  Tarik · Cafe Padel            │
├──────────────────────────────────┤
│                                  │
│  ⚠️ Tarik = stok ditarik dari    │
│  cafe (expired, recall, dll).    │
│  Akan masuk hitungan settlement. │
│                                  │
│  Tanggal: 2 Juni 2025            │
│  Partner: Cafe Padel Jaksel      │
│                                  │
│  SKU          Qty                │
│  ┌────────────────────────────┐  │
│  │ Double Choco    [  2 ]  −  │  │  ← show current stock
│  │ Stok saat ini: 6            │  │
│  ├────────────────────────────┤  │
│  │ Strawberry      [  0 ]  −  │  │
│  │ Stok saat ini: 8            │  │
│  ├────────────────────────────┤  │
│  │ Tiramisu        [  0 ]  −  │  │
│  │ Stok saat ini: 10           │  │
│  └────────────────────────────┘  │
│                                  │
│  Alasan:                         │
│  ┌────────────────────────────┐  │
│  │ Expired 2 cup DC pagi ini  │  │
│  └────────────────────────────┘  │
│                                  │
│  ┌────────────────────────────┐  │
│  │      KIRIM TARIK           │  │
│  └────────────────────────────┘  │
│                                  │
└──────────────────────────────────┘
```

---

## h) Brand: settlement review

```
┌──────────────────────────────────┐
│ ←  Settlement · 26 Mei-1 Jun     │
├──────────────────────────────────┤
│                                  │
│  Cafe Padel Jaksel               │
│  ┌────────────────────────────┐  │
│  │ Omzet       Rp  840.000    │  │
│  │ Hanniel 70% Rp  588.000    │  │
│  │ Partner 30% Rp  252.000    │  │
│  │ Total cup: 20              │  │
│  └────────────────────────────┘  │
│                                  │
│  Per SKU:                        │
│  ┌────────────────────────────┐  │
│  │ Double Choco  12 × 42k    │  │
│  │  →  Rp 504.000             │  │
│  ├────────────────────────────┤  │
│  │ Strawberry    4 × 42k     │  │
│  │  →  Rp 168.000             │  │
│  ├────────────────────────────┤  │
│  │ Tiramisu      4 × 42k     │  │
│  │  →  Rp 168.000             │  │
│  └────────────────────────────┘  │
│                                  │
│  ⚠️ 1 dispute terbuka            │
│  ┌────────────────────────────┐  │
│  │ Selisih −1 DC              │  │
│  │ "Barang tumpah" · [LIHAT]  │  │
│  │ ☐ Saya sudah review         │  │
│  └────────────────────────────┘  │
│                                  │
│  ┌────────────────────────────┐  │
│  │ 📄 Lihat PDF               │  │
│  └────────────────────────────┘  │
│  ┌────────────────────────────┐  │
│  │      ✓ SETUJUI             │  │  ← primary, full width
│  └────────────────────────────┘  │
│                                  │
└──────────────────────────────────┘
```

---

## i) Disputes

```
┌──────────────────────────────────┐
│ ←  Dispute · 2 Jun · DC          │
├──────────────────────────────────┤
│                                  │
│  Status: OPEN                    │
│  Selisih: −1 cup Double Choco     │
│  Closing: 2 Jun 2025 · Cafe Padel│
│                                  │
│  ┌─ Timeline ─────────────────┐   │
│  │                             │   │
│  │  📷 Rina (PIC) · 22:15     │   │
│  │  [foto chiller]             │   │
│  │  "Pagi ada tumpah, sisanya │   │
│  │   sudah aku hitung ulang."  │   │
│  │                             │   │
│  │  💬 Hanniel · 22:42        │   │
│  │  "Ok noted, gw tanggung 1.  │   │
│  │   Settlement udah aku koreksi.│  │
│  │   Thanks ya 🙏"             │   │
│  │                             │   │
│  └─────────────────────────────┘   │
│                                  │
│  ┌────────────────────────────┐  │
│  │  Tulis pesan...            │  │  ← text input
│  └────────────────────────────┘  │
│  [📷]                         [→] │  ← photo + send
│                                  │
│  ┌────────────────────────────┐  │
│  │  ◯ Aku terima (RESOLVE)    │  │  ← tenant can resolve
│  └────────────────────────────┘  │
│                                  │
└──────────────────────────────────┘
```

---

## Empty states (shown when data is empty)

| Screen | Empty state |
|--------|-------------|
| Brand partnerships | `🤝 Belum ada partner. [Undang cafe pertama →]` |
| Brand SKUs | `📦 Belum ada SKU. [+ Tambah SKU]` |
| Tenant closing (no SKU today) | `☕ Belum ada titip hari ini. Tunggu konfirmasi Hanniel.` |
| Disputes | `✅ Tidak ada dispute terbuka.` |
| Settlement history | `📭 Belum ada settlement minggu lalu.` |
| Audit (admin) | `📭 Tidak ada aktivitas sesuai filter.` |
