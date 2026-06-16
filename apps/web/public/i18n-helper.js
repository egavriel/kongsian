(function() {
  const SESSION_LANG_KEY = "kongsian_lang";
  
  const DICTIONARY = {
    en: {
      // Global Header & Shared
      "brand dashboard": "Brand Dashboard",
      "kembali": "Back",
      "keluar": "Logout",
      "memuat": "Loading",
      "memuat…": "Loading...",
      "memuat...": "Loading...",
      "tunggu max 1x24 jam": "Please wait up to 24 hours. We will notify you via WhatsApp after approval.",
      "akun kamu belum diverifikasi admin": "Your account is pending admin verification",
      "tunggu max 1x24 jam. kami kabari via whatsapp setelah approve.": "Please wait up to 24 hours. We will notify you via WhatsApp after approval.",
      "verifikasi admin": "Admin Verification",
      "kembali ke beranda": "Back to Home",
      "opsional": "optional",
      
      // Role Tags
      "arsenal": "SKU REGISTRY",
      "alliance": "PARTNERSHIPS",
      "treasury": "TREASURY",
      "oracle": "ANALYTICS",
      
      // Login / Register
      "masuk": "Login",
      "daftar": "Register",
      "selamat datang kembali": "Welcome Back",
      "masukin nomor whatsapp kamu. kami kirim otp 6 digit.": "Enter your WhatsApp number. We will send a 6-digit OTP.",
      "nomor hp / whatsapp": "Phone / WhatsApp Number",
      "kirim otp via whatsapp": "Send OTP via WhatsApp",
      "masukkan 6 digit kode yang dikirim ke nomor:": "Enter the 6-digit code sent to:",
      "verifikasi & masuk": "Verify & Login",
      "belum punya akun? daftar gratis": "Don't have an account? Register free",
      "sudah punya akun? masuk": "Already have an account? Login",
      "daftar akun baru": "Register New Account",
      "nama lengkap": "Full Name",
      "nama bisnis / brand": "Business / Brand Name",
      "daftar & kirim otp": "Register & Send OTP",
      "mengirim…": "Sending...",
      "mengirim...": "Sending...",
      "memverifikasi…": "Verifying...",
      "memverifikasi...": "Verifying...",
      "otp dikirim. cek whatsapp kamu.": "OTP sent. Please check your WhatsApp.",
      "tidak bisa konek ke server": "Unable to connect to the server.",
      "kode otp salah": "Incorrect OTP code.",
      "nomor hp sudah terdaftar": "Phone number is already registered.",
      "nama lengkap & nama bisnis wajib": "Full name and business name are required.",
      "nomor hp tidak valid": "Invalid phone number.",
      "otp terkirim": "OTP sent",
      "masuk — kongsian": "Login — Kongsian",
      "daftar — kongsian": "Register — Kongsian",
      
      // Brand Dashboard Homepage
      "catat hari ini": "Record Daily Sales",
      "kelola sku": "Manage SKUs",
      "undang partner": "Invite Partner",
      "omset": "Sales Revenue",
      "omset kotor": "Gross Sales",
      "pembagian hasil": "Revenue Share",
      "dispute": "Disputes",
      "terjual": "Sold",
      "hari ini": "Today",
      "kemarin": "Yesterday",
      "minggu ini": "This Week",
      "bulan ini": "This Month",
      "cafe aktif": "Active Cafes",
      "belum ada partner aktif. undang partner di bawah untuk mendirikan cafe baru di peta kerajaanmu!": "No active partners yet. Invite a partner below to establish a new Cafe!",
      "belum ada partner aktif. undang partner di bawah untuk mendirikan cafe baru!": "No active partners yet. Invite a partner below to establish a new Cafe!",
      "quest tracker": "Operations Tracker",
      "daily quests: catat hari ini": "Daily Closing Entries",
      "catat harian": "Daily Closings",
      "item smithy / forge & upgrade sku": "SKU Registry & Pricing",
      "guild registry / draft & manage alliances": "Partner Registry & Contracts",
      "arsip kerajaan / oracle chamber": "Data Archives & Analytics",
      "oracle chamber / analytics & trend": "Analytics & Trends",
      "treasury ledger / gold registry": "Sales Treasury Ledger",
      "aktivitas harian": "Daily Operations Activity",
      "lihat semua": "View All",
      "belum ada closing hari ini.": "No closings recorded today.",
      
      // SKU Management
      "forge new artifact": "Add New SKU",
      "item smithy": "SKU Registry",
      "forge & upgrade sku": "Manage & Update SKUs",
      "item code": "SKU Code",
      "cost (rp)": "Sale Price (Rp)",
      "artifact name": "SKU Name",
      "shelf life (days)": "Shelf Life (Days)",
      "forge sku": "Save SKU",
      "inventory arsenal": "Active SKU Inventory",
      "upgrade": "Change Price",
      "scrap": "Delete",
      "hapus sku": "Delete SKU?",
      "harga baru untuk sku (rp):": "New price for SKU (Rp):",
      "harga tidak valid.": "Invalid price.",
      "harga diupdate.": "Price updated.",
      "sku ditambah.": "SKU added.",
      "sku sudah ada.": "SKU already exists.",
      "belom ada sku. tambah di atas.": "No SKUs yet. Add one above.",
      "gagal memuat sku.": "Failed to load SKUs.",
      "kode, nama, harga wajib.": "Code, name, and price are required.",
      "sku dinonaktifkan.": "SKU deactivated.",
      "memuat…": "Loading...",
      "live forge preview": "LIVE PREVIEW",
      
      // Partnerships / Undang Partner
      "draft alliance pact": "Invite New Cafe Partner",
      "guild registry": "Partner Registry",
      "draft & manage alliances": "Draft & Manage Partnerships",
      "guild / cafe name": "Cafe Name",
      "pic phone": "PIC WhatsApp",
      "territory / address": "Cafe Address / Location",
      "cycle start day": "Settlement Start Day",
      "cycle end day (cut-off)": "Settlement End Day (Cut-off)",
      "draft pact invitation": "Send Invitation",
      "alliance guilds": "Cafe Partnerships",
      "edit alliance terms": "Edit Partnership Terms",
      "brand share (%)": "Brand Revenue Share (%)",
      "cafe share (%)": "Cafe Revenue Share (%)",
      "save terms": "Save Terms",
      "cancel": "Cancel",
      "active alliance guild": "Active Partnership",
      "draft contract pending": "Pending Invitation",
      "alliance suspended": "Suspended",
      "cycle: minggu - sabtu": "Cycle: Sunday - Saturday",
      "pic: ": "PIC: ",
      "split ": "Split ",
      "siklus settlement": "Settlement Cycle",
      "split bagi hasil": "Revenue Split",
      "suspend partnership ini?": "Suspend this partnership?",
      "siklus settlement berhasil diupdate.": "Settlement cycle successfully updated.",
      "nomor hp tidak valid.": "Invalid phone number.",
      "invite terkirim ke": "Invitation sent to",
      "belok ada partnership. invite partner pertama di atas.": "No partnerships yet. Invite your first partner above.",
      "belum ada partnership. invite partner pertama di atas.": "No partnerships yet. Invite your first partner above.",
      "gagal memuat.": "Failed to load.",
      "gagal aktifkan: ": "Failed to activate: ",
      "gagal suspend: ": "Failed to suspend: ",
      "partnership diaktifkan.": "Partnership activated.",
      "partnership disuspend.": "Partnership suspended.",
      "total split harus 100% (contoh: 70% dan 30%).": "Total split must equal 100% (e.g. 70% and 30%).",
      "brand": "Brand",
      "cafe": "Cafe",
      
      // Daily Closing Operations (ops/new.astro)
      "quest: inisiasi labirin (stok awal)": "1. Initial Stock Today",
      "quest: pasok logistik (titip)": "2. Add Consigned Stock",
      "quest: tarik kembali (tarik)": "3. Recall Remaining Stock",
      "quest: catatan kemenangan (terjual)": "4. Record Items Sold",
      "stok awal": "Initial Stock",
      "titip": "Consign",
      "tarik": "Recall",
      "jual": "Sold",
      "simpan semua": "Save All",
      "sekali": "Once",
      "isi minimal 1 sku.": "Fill in at least 1 SKU.",
      "pilih partner cafe dahulu.": "Select a cafe partner first.",
      "berhasil disimpan. mengarahkan…": "Successfully saved. Redirecting...",
      
      // Revenue Ledger (revenue.astro)
      "daily sales ledger": "Daily Sales Ledger",
      "pembagian pendapatan": "Revenue Distribution",
      "omset kotor cafe": "Cafe Gross Omzet",
      "bagian brand": "Brand Share",
      "bagian cafe": "Cafe Share",
      "total kuantitas": "Total Quantity",
      "pilih partner cafe": "Select Cafe Partner",
      "pilih siklus mingguan": "Select Weekly Cycle",
      "tidak ada data penjualan pada siklus ini.": "No sales records found in this cycle.",
      "kosong": "Empty",
      
      // Analytics (analytics.astro)
      "kingdom treasury statistics": "Brand Financial Statistics",
      "total revenue": "Total Revenue",
      "items dispatched": "Units Sold",
      "scrolls recorded": "Closings Recorded",
      "skirmishes occurred": "Disputes Occurred",
      "historical gold chart": "Historical Sales Chart",
      "most replicable alchemy recipes": "Top Selling SKUs",
      "export scroll": "Export CSV",
      "rank": "Rank",
      "sku name": "SKU Name",
      "units sold": "Units Sold",
      "revenue": "Revenue",
      "alchemy recipes": "SKUs",
      
      // Disputes
      "skirmish details": "Dispute Details",
      "raised by": "Raised By",
      "disputed line": "Disputed Line",
      "original closing date": "Closing Date",
      "status": "Status",
      "resolution note": "Resolution Note",
      "bukti foto": "Photo Evidence",
      "ajukan dispute": "Submit Dispute",
      "alasan dispute wajib diisi.": "Dispute reason is required.",
      "dispute berhasil diajukan.": "Dispute successfully submitted.",
      "tutup dispute": "Resolve Dispute",
      "tutup dispute ini?": "Resolve this dispute?",
      "dispute berhasil diselesaikan.": "Dispute resolved successfully.",
      
      // Tenant Pages
      "daily closing report": "Daily Closing Report",
      "catat penjualan harian": "Record Daily Sales",
      "pilih partnership": "Select Partnership",
      "stok sisa kemarin": "Yesterday's Remaining",
      "stok baru masuk": "New Consignment Today",
      "terjual hari ini": "Units Sold Today",
      "sisa fisik di rak": "Physical Remaining on Shelf",
      "selisih sistem": "Difference (Stock vs Shelf)",
      "kamera": "Camera",
      "kirim laporan": "Submit Report",
      "closing berhasil disimpan.": "Closing successfully saved.",
      "dispute terbuka": "Open Disputes",
      "belum ada dispute": "No disputes found.",
      
      // Tiers / Rarity (de-gamified Tiers)
      "legendary": "Tier 4 (Premium)",
      "epic": "Tier 3 (High)",
      "rare": "Tier 2 (Medium)",
      "common": "Tier 1 (Basic)",
      
      // New prompt/alert/confirm translations
      "hapus stok awal confirm message": "Delete {count} saved Initial Stock entries for date {date}?\n\nThis action will affect System Remaining. This cannot be undone (unless you re-enter them).",
      "approve settlement ini? tenant akan di-notify.": "Approve this settlement? The tenant will be notified.",
      "tandai settlement sudah dibayar? (bukti transfer harus sudah di-upload manual via wa)": "Mark settlement as paid? (Proof of transfer must have been uploaded manually via WA)",
      "tandai dispute ini resolved?": "Mark this dispute as resolved?",
      "pesan kosong.": "Message is empty.",
      "gagal kirim pesan.": "Failed to send message.",
      "pesan terkirim ✓": "Message sent ✓",
      "tulis resolusi dulu.": "Please write a resolution first.",
      "gagal resolve.": "Failed to resolve.",
      "dispute resolved ✓": "Dispute resolved ✓",
      "gagal memuat dispute.": "Failed to load dispute.",
      "membuat pdf…": "Generating PDF...",
      "download pdf rekap": "Download PDF Summary",
      "gagal": "Failed",
      "pdf diunduh ✓": "PDF downloaded ✓",
      "gagal download: ": "Failed to download: ",
      "gagal approve.": "Failed to approve.",
      "gagal mark paid. ": "Failed to mark as paid. ",
      "settlement paid ✓": "Settlement paid ✓",
      "settlement di-approve ✓": "Settlement approved ✓",
      "unknown": "Unknown"
    },
    id: {
      // Global Header & Shared
      "brand dashboard": "Dashboard Brand",
      "kembali": "Kembali",
      "keluar": "Keluar",
      "memuat": "Memuat",
      "memuat…": "Memuat…",
      "memuat...": "Memuat…",
      "tunggu max 1x24 jam": "Tunggu maks. 24 jam. Kami kabari via WhatsApp setelah disetujui.",
      "akun kamu belum diverifikasi admin": "Akun Anda belum diverifikasi admin",
      "tunggu max 1x24 jam. kami kabari via whatsapp setelah approve.": "Tunggu maks. 24 jam. Kami kabari via WhatsApp setelah disetujui.",
      "verifikasi admin": "Verifikasi Admin",
      "kembali ke beranda": "Kembali ke Beranda",
      "opsional": "opsional",
      
      // Role Tags
      "arsenal": "KELOLA SKU",
      "alliance": "KEMITRAAN",
      "treasury": "LAPORAN KAS",
      "oracle": "ANALISIS",
      
      // Login / Register
      "masuk": "Masuk",
      "daftar": "Daftar",
      "selamat datang kembali": "Selamat Datang Kembali",
      "masukin nomor whatsapp kamu. kami kirim otp 6 digit.": "Masukkan nomor WhatsApp Anda. Kami kirim OTP 6 digit.",
      "nomor hp / whatsapp": "Nomor HP / WhatsApp",
      "kirim otp via whatsapp": "Kirim OTP via WhatsApp",
      "masukkan 6 digit kode yang dikirim ke nomor:": "Masukkan 6 digit kode yang dikirim ke nomor:",
      "verifikasi & masuk": "Verifikasi & Masuk",
      "belum punya akun? daftar gratis": "Belum punya akun? Daftar gratis",
      "sudah punya akun? masuk": "Sudah punya akun? Masuk",
      "daftar akun baru": "Daftar Akun Baru",
      "nama lengkap": "Nama Lengkap",
      "nama bisnis / brand": "Nama Bisnis / Brand",
      "daftar & kirim otp": "Daftar & Kirim OTP",
      "mengirim…": "Mengirim…",
      "mengirim...": "Mengirim…",
      "memverifikasi…": "Memverifikasi…",
      "memverifikasi...": "Memverifikasi…",
      "otp dikirim. cek whatsapp kamu.": "OTP terkirim. Silakan cek WhatsApp Anda.",
      "tidak bisa konek ke server": "Tidak dapat terhubung ke server.",
      "kode otp salah": "Kode OTP salah.",
      "nomor hp sudah terdaftar": "Nomor HP sudah terdaftar.",
      "nama lengkap & nama bisnis wajib": "Nama lengkap dan nama bisnis wajib diisi.",
      "nomor hp tidak valid": "Nomor HP tidak valid.",
      "otp terkirim": "OTP terkirim",
      "masuk — kongsian": "Masuk — Kongsian",
      "daftar — kongsian": "Daftar — Kongsian",
      
      // Brand Dashboard Homepage
      "catat hari ini": "Catat Penjualan Harian",
      "kelola sku": "Kelola SKU",
      "undang partner": "Undang Partner",
      "omset": "Omset Penjualan",
      "omset kotor": "Penjualan Kotor",
      "pembagian hasil": "Bagi Hasil",
      "dispute": "Dispute",
      "terjual": "Terjual",
      "hari ini": "Hari Ini",
      "kemarin": "Kemarin",
      "minggu ini": "Minggu Ini",
      "bulan ini": "Bulan Ini",
      "cafe aktif": "Cafe Aktif",
      "belum ada partner aktif. undang partner di bawah untuk mendirikan cafe baru di peta kerajaanmu!": "Belum ada partner aktif. Undang partner di bawah untuk mendirikan Cafe baru!",
      "belum ada partner aktif. undang partner di bawah untuk mendirikan cafe baru!": "Belum ada partner aktif. Undang partner di bawah untuk mendirikan Cafe baru!",
      "quest tracker": "Pelacak Operasional",
      "daily quests: catat hari ini": "Pencatatan Operasional Harian",
      "catat harian": "Catat Harian",
      "item smithy / forge & upgrade sku": "Registrasi SKU & Harga",
      "guild registry / draft & manage alliances": "Daftar Partner & Kontrak",
      "arsip kerajaan / oracle chamber": "Arsip Data & Analitik",
      "oracle chamber / analytics & trend": "Analisis & Tren",
      "treasury ledger / gold registry": "Laporan Omset Harian",
      "aktivitas harian": "Aktivitas Harian",
      "lihat semua": "Lihat Semua",
      "belum ada closing hari ini.": "Belum ada closing hari ini.",
      
      // SKU Management
      "forge new artifact": "Tambah SKU Baru",
      "item smithy": "Registrasi SKU",
      "forge & upgrade sku": "Kelola & Ubah SKU",
      "item code": "Kode SKU",
      "cost (rp)": "Harga Jual (Rp)",
      "artifact name": "Nama SKU",
      "shelf life (days)": "Masa Simpan (Hari)",
      "forge sku": "Simpan SKU",
      "inventory arsenal": "Daftar SKU Aktif",
      "upgrade": "Ubah Harga",
      "scrap": "Hapus",
      "hapus sku": "Hapus SKU?",
      "harga baru untuk sku (rp):": "Harga baru untuk SKU (Rp):",
      "harga tidak valid.": "Harga tidak valid.",
      "harga diupdate.": "Harga diupdate.",
      "sku ditambah.": "SKU ditambah.",
      "sku sudah ada.": "SKU sudah ada.",
      "belom ada sku. tambah di atas.": "Belum ada SKU. Tambah di atas.",
      "gagal memuat sku.": "Gagal memuat SKU.",
      "kode, nama, harga wajib.": "Kode, nama, dan harga wajib.",
      "sku dinonaktifkan.": "SKU dinonaktifkan.",
      "memuat…": "Memuat…",
      "live forge preview": "PRATINJAU LANGSUNG",
      
      // Partnerships / Undang Partner
      "draft alliance pact": "Undang Partner Cafe Baru",
      "guild registry": "Daftar Partner",
      "draft & manage alliances": "Kelola & Buat Kemitraan",
      "guild / cafe name": "Nama Cafe",
      "pic phone": "WhatsApp PIC",
      "territory / address": "Alamat Cafe / Lokasi",
      "cycle start day": "Siklus Mulai Hari",
      "cycle end day (cut-off)": "Siklus Selesai Hari",
      "draft pact invitation": "Kirim Undangan",
      "alliance guilds": "Daftar Mitra Cafe",
      "edit alliance terms": "Ubah Ketentuan Partner",
      "brand share (%)": "Bagi Hasil Brand (%)",
      "cafe share (%)": "Bagi Hasil Cafe (%)",
      "save terms": "Simpan Ketentuan",
      "cancel": "Batal",
      "active alliance guild": "Kemitraan Aktif",
      "draft contract pending": "Menunggu Persetujuan",
      "alliance suspended": "Ditangguhkan",
      "cycle: minggu - sabtu": "Siklus: Minggu - Sabtu",
      "pic: ": "PIC: ",
      "split ": "Split ",
      "siklus settlement": "Siklus Pembayaran",
      "split bagi hasil": "Bagi Hasil",
      "suspend partnership ini?": "Suspend partnership ini?",
      "siklus settlement berhasil diupdate.": "Siklus settlement berhasil diupdate.",
      "nomor hp tidak valid.": "Nomor HP tidak valid.",
      "invite terkirim ke": "Undangan terkirim ke",
      "belok ada partnership. invite partner pertama di atas.": "Belum ada partnership. Undang partner pertama di atas.",
      "belum ada partnership. invite partner pertama di atas.": "Belum ada partnership. Undang partner pertama di atas.",
      "gagal memuat.": "Gagal memuat.",
      "gagal aktifkan: ": "Gagal aktifkan: ",
      "gagal suspend: ": "Gagal suspend: ",
      "partnership diaktifkan.": "Partnership diaktifkan.",
      "partnership disuspend.": "Partnership disuspend.",
      "total split harus 100% (contoh: 70% dan 30%).": "Total split harus 100% (contoh: 70% dan 30%).",
      "brand": "Brand",
      "cafe": "Cafe",
      
      // Daily Closing Operations (ops/new.astro)
      "quest: inisiasi labirin (stok awal)": "1. Stok Awal Hari Ini",
      "quest: pasok logistik (titip)": "2. Tambah Barang Titipan (Titip)",
      "quest: tarik kembali (tarik)": "3. Tarik Barang Sisa (Tarik)",
      "quest: catatan kemenangan (terjual)": "4. Catat Jumlah Terjual",
      "stok awal": "Stok Awal",
      "titip": "Titip",
      "tarik": "Tarik",
      "jual": "Jual",
      "simpan semua": "Simpan Semua",
      "sekali": "Sekali",
      "isi minimal 1 sku.": "Isi minimal 1 SKU.",
      "pilih partner cafe dahulu.": "Pilih partner cafe dahulu.",
      "berhasil disimpan. mengarahkan…": "Berhasil disimpan. Mengarahkan...",
      
      // Revenue Ledger (revenue.astro)
      "daily sales ledger": "Laporan Omset Harian",
      "pembagian pendapatan": "Pembagian Pendapatan",
      "omset kotor cafe": "Omset Kotor Cafe",
      "bagian brand": "Bagian Brand",
      "bagian cafe": "Bagian Cafe",
      "total kuantitas": "Total Kuantitas",
      "pilih partner cafe": "Pilih Partner Cafe",
      "pilih siklus mingguan": "Pilih Siklus Mingguan",
      "tidak ada data penjualan pada siklus ini.": "Tidak ada data penjualan pada siklus ini.",
      "kosong": "Kosong",
      
      // Analytics (analytics.astro)
      "kingdom treasury statistics": "Statistik Keuangan Brand",
      "total revenue": "Total Omset",
      "items dispatched": "Total Terjual",
      "scrolls recorded": "Closing Tercatat",
      "skirmishes occurred": "Dispute Terjadi",
      "historical gold chart": "Grafik Penjualan Historis",
      "most replicable alchemy recipes": "SKU Terlaris",
      "export scroll": "Ekspor CSV",
      "rank": "Peringkat",
      "sku name": "Nama SKU",
      "units sold": "Kuantitas Terjual",
      "revenue": "Pendapatan",
      "alchemy recipes": "Daftar SKU",
      
      // Disputes
      "skirmish details": "Rincian Dispute",
      "raised by": "Diajukan Oleh",
      "disputed line": "Baris yang Didispute",
      "original closing date": "Tanggal Closing",
      "status": "Status",
      "resolution note": "Catatan Penyelesaian",
      "bukti foto": "Foto Bukti",
      "ajukan dispute": "Ajukan Dispute",
      "alasan dispute wajib diisi.": "Alasan dispute wajib diisi.",
      "dispute berhasil diajukan.": "Dispute berhasil diajukan.",
      "tutup dispute": "Selesaikan Dispute",
      "tutup dispute ini?": "Selesaikan dispute ini?",
      "dispute berhasil diselesaikan.": "Dispute berhasil diselesaikan.",
      
      // Tenant Pages
      "daily closing report": "Laporan Kasir Harian",
      "catat penjualan harian": "Catat Penjualan Harian",
      "pilih partnership": "Pilih Kerjasama",
      "stok sisa kemarin": "Sisa Kemarin",
      "stok baru masuk": "Stok Baru Masuk",
      "terjual hari ini": "Terjual Hari Ini",
      "sisa fisik di rak": "Sisa Fisik di Rak",
      "selisih sistem": "Selisih Sistem",
      "kamera": "Kamera",
      "kirim laporan": "Kirim Laporan",
      "closing berhasil disimpan.": "Closing berhasil disimpan.",
      "dispute terbuka": "Dispute Terbuka",
      "belum ada dispute": "Belum ada dispute.",
      
      // Tiers / Rarity (de-gamified Tiers)
      "legendary": "Tier 4 (Premium)",
      "epic": "Tier 3 (Tinggi)",
      "rare": "Tier 2 (Menengah)",
      "common": "Tier 1 (Biasa)",
      
      // New prompt/alert/confirm translations
      "hapus stok awal confirm message": "Hapus {count} entri Stok Awal yang tersimpan untuk tanggal {date}?\n\nTindakan ini akan mempengaruhi Sisa Sistem. Tidak bisa di-undo (kecuali kamu input ulang).",
      "approve settlement ini? tenant akan di-notify.": "Approve settlement ini? Tenant akan di-notify.",
      "tandai settlement sudah dibayar? (bukti transfer harus sudah di-upload manual via wa)": "Tandai settlement sudah dibayar? (Bukti transfer harus sudah di-upload manual via WA)",
      "tandai dispute ini resolved?": "Tandai dispute ini resolved?",
      "pesan kosong.": "Pesan kosong.",
      "gagal kirim pesan.": "Gagal kirim pesan.",
      "pesan terkirim ✓": "Pesan terkirim ✓",
      "tulis resolusi dulu.": "Tulis resolusi dulu.",
      "gagal resolve.": "Gagal resolve.",
      "dispute resolved ✓": "Dispute resolved ✓",
      "gagal memuat dispute.": "Gagal memuat dispute.",
      "membuat pdf…": "Membuat PDF…",
      "download pdf rekap": "Download PDF Rekap",
      "gagal": "Gagal",
      "pdf diunduh ✓": "PDF diunduh ✓",
      "gagal download: ": "Gagal download: ",
      "gagal approve.": "Gagal approve.",
      "gagal mark paid. ": "Gagal mark paid. ",
      "settlement paid ✓": "Settlement paid ✓",
      "settlement di-approve ✓": "Settlement di-approve ✓",
      "unknown": "Tidak Diketahui"
    }
  };
  
  // ---- Helper translation routines ----
  function getLang() {
    return localStorage.getItem(SESSION_LANG_KEY) || "en";
  }
  
  function setLang(lang) {
    localStorage.setItem(SESSION_LANG_KEY, lang);
    applyTranslations(lang);
  }
  
  function translateText(text, lang) {
    if (!text) return null;
    const clean = text.trim().toLowerCase().replace(/\s+/g, ' ');
    if (clean === "") return null;
    
    // Safety check: do not translate values that contain no alphabetic letters
    // E.g., numbers, icons only, math formulas, currency sums
    if (!/[a-zA-Z]/.test(clean)) return null;
    
    // Look up in dictionary
    if (DICTIONARY[lang] && DICTIONARY[lang][clean] !== undefined) {
      return DICTIONARY[lang][clean];
    }
    
    return null;
  }
  
  function translateDom(node, lang) {
    if (!node) return;
    
    if (node.nodeType === Node.TEXT_NODE) {
      if (node._originalValue === undefined) {
        node._originalValue = node.nodeValue;
      }
      const val = node._originalValue;
      // Skip if parent node has data-no-i18n
      if (node.parentElement && node.parentElement.hasAttribute("data-no-i18n")) return;
      
      const translated = translateText(val, lang);
      if (translated !== null) {
        const leading = val.match(/^\s*/)[0];
        const trailing = val.match(/\s*$/)[0];
        node.nodeValue = leading + translated + trailing;
      } else {
        node.nodeValue = val;
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = node.tagName;
      if (tag === "SCRIPT" || tag === "STYLE") return;
      if (node.hasAttribute("data-no-i18n")) return;
      
      // Translate inputs placeholder
      if (node.hasAttribute("placeholder")) {
        if (!node.hasAttribute("data-orig-placeholder")) {
          node.setAttribute("data-orig-placeholder", node.getAttribute("placeholder"));
        }
        const ph = node.getAttribute("data-orig-placeholder");
        const translated = translateText(ph, lang);
        if (translated !== null) {
          node.setAttribute("placeholder", translated);
        } else {
          node.setAttribute("placeholder", ph);
        }
      }
      
      // Recursively do child nodes
      for (let i = 0; i < node.childNodes.length; i++) {
        translateDom(node.childNodes[i], lang);
      }
    }
  }
  
  function translateTitle(lang) {
    if (!document._originalTitle) {
      document._originalTitle = document.title;
    }
    const t = document._originalTitle;
    if (!t) return;
    const parts = t.split("—");
    if (parts.length > 0) {
      const pageName = parts[0].trim();
      const translated = translateText(pageName, lang);
      if (translated !== null) {
        document.title = translated + (parts[1] ? " — " + parts[1].trim() : "");
      } else {
        document.title = t;
      }
    }
  }

  // Define global t translation helper
  window.t = function(key) {
    if (!key) return "";
    const lang = getLang();
    const clean = String(key).trim().toLowerCase().replace(/\s+/g, ' ');
    if (DICTIONARY[lang] && DICTIONARY[lang][clean] !== undefined) {
      return DICTIONARY[lang][clean];
    }
    return key;
  };
  
  let observer = null;
  function startObserver(lang) {
    if (observer) observer.disconnect();
    
    observer = new MutationObserver((mutations) => {
      observer.disconnect(); // Prevent infinite loops
      for (let mutation of mutations) {
        for (let addedNode of mutation.addedNodes) {
          translateDom(addedNode, lang);
        }
      }
      observer.observe(document.body, { childList: true, subtree: true });
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
  }
  
  function injectStyles() {
    const styleId = "i18n-style-injected";
    if (document.getElementById(styleId)) return;
    
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      .lang-switch-container {
        display: flex;
        border: 2px solid #1e293b;
        border-radius: 8px;
        overflow: hidden;
        background: #090d16;
        height: 28px;
        box-sizing: border-box;
      }
      .lang-btn {
        background: transparent;
        color: #94a3b8;
        border: none;
        padding: 0 10px;
        font-size: 11px;
        font-family: inherit;
        font-weight: 800;
        cursor: pointer;
        transition: all 0.15s ease;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
      }
      .lang-btn.active {
        background: #fbbf24;
        color: #0b1220;
      }
      .lang-btn:focus {
        outline: none;
      }
      .floating-lang-switch {
        position: fixed;
        top: 16px;
        right: 16px;
        z-index: 1000;
        box-shadow: 3px 3px 0px 0px #020617;
        border-radius: 8px;
      }
    `;
    document.head.appendChild(style);
  }
  
  function injectLanguageSwitcher() {
    const selectorId = "i18n-switcher-injected";
    if (document.getElementById(selectorId)) return;
    
    const lang = getLang();
    
    const container = document.createElement("div");
    container.id = selectorId;
    container.className = "lang-switch-container";
    
    const enBtn = document.createElement("button");
    enBtn.type = "button";
    enBtn.className = "lang-btn" + (lang === "en" ? " active" : "");
    enBtn.textContent = "EN";
    enBtn.addEventListener("click", function(e) {
      e.preventDefault();
      setLang("en");
    });
    
    const idBtn = document.createElement("button");
    idBtn.type = "button";
    idBtn.className = "lang-btn" + (lang === "id" ? " active" : "");
    idBtn.textContent = "ID";
    idBtn.addEventListener("click", function(e) {
      e.preventDefault();
      setLang("id");
    });
    
    container.appendChild(enBtn);
    container.appendChild(idBtn);
    
    // Position it in page top-header if exists, else float it
    const header = document.querySelector("header.top");
    if (header) {
      // Create a wrapper or append it right before the role-tag/logout link
      const roleTag = header.querySelector(".role-tag") || header.querySelector(".logout") || header.lastElementChild;
      if (roleTag) {
        // Insert right before it
        roleTag.parentNode.insertBefore(container, roleTag);
        
        // Add styling support to flex container
        container.style.marginRight = "10px";
        container.style.flexShrink = "0";
      } else {
        header.appendChild(container);
      }
    } else {
      // Float it in body
      container.classList.add("floating-lang-switch");
      document.body.appendChild(container);
    }
  }
  
  function applyTranslations(lang) {
    // Translate the original DOM
    translateDom(document.body, lang);
    translateTitle(lang);
    
    // Update active class state in selectors
    const selectors = document.querySelectorAll(".lang-switch-container");
    selectors.forEach(sel => {
      const buttons = sel.querySelectorAll(".lang-btn");
      buttons.forEach(btn => {
        if (btn.textContent === lang.toUpperCase()) {
          btn.classList.add("active");
        } else {
          btn.classList.remove("active");
        }
      });
    });
    
    // Start reactive observer
    startObserver(lang);
  }
  
  function init() {
    injectStyles();
    injectLanguageSwitcher();
    applyTranslations(getLang());
  }
  
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
  
})();
