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
      "halo": "Hi",
      
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

      // Login page - additional strings
      "pilih kode negara & masukkan nomor tanpa angka 0 di depan.": "Select country code & enter number without leading 0.",
      "belum punya akun? prosesnya < 10 menit — kami auto-create akun pas verifikasi pertama.": "Don't have an account? It takes less than 10 minutes — we auto-create your account on first verification.",
      "step 2 of 2": "Step 2 of 2",
      "masukin kode otp": "Enter OTP Code",
      "dikirim ke": "Sent to",
      "berlaku 5 menit.": "Valid for 5 minutes.",
      "6-digit kode": "6-digit code",
      "verifikasi": "Verify",
      "kirim ulang": "Resend",
      "kebanyakan percobaan. coba lagi ~1 jam.": "Too many attempts. Try again in ~1 hour.",
      "gagal kirim otp. coba lagi.": "Failed to send OTP. Try again.",
      "dev mode: kode otp sudah diisi otomatis di bawah.": "Dev mode: OTP code auto-filled below.",
      "nomor hp tidak valid. silakan masukkan nomor yang benar.": "Invalid phone number. Please enter a valid number.",
      "kode harus 6 digit angka.": "Code must be 6 digits.",
      "kode salah. coba lagi.": "Wrong code. Try again.",
      "kode sudah kadaluarsa. kirim ulang.": "Code expired. Resend.",
      "terlalu banyak percobaan. kirim otp baru.": "Too many attempts. Send a new OTP.",
      "verifikasi gagal. coba lagi.": "Verification failed. Try again.",
      "berhasil! mengecek status verifikasi…": "Success! Checking verification status...",
      "tidak ada session token. coba lagi.": "No session token. Try again.",
      "tidak bisa konek ke server. coba lagi.": "Unable to connect to server. Try again.",
      "nomor tidak valid. balik ke step 1 dan masukin lagi.": "Invalid number. Go back to step 1 and re-enter.",
      "otp baru dikirim. cek whatsapp kamu.": "New OTP sent. Check your WhatsApp.",
      "akun kamu sedang diverifikasi admin.": "Your account is being verified by admin.",

      // Register page - additional strings
      "sign up": "Sign Up",
      "daftar di": "Register at",
      "gratis untuk brand & cafe. masukin nomor hp, pilih peran, jadi.": "Free for brands & cafes. Enter your phone, choose a role, done.",
      "sudah punya akun?": "Already have an account?",
      "masuk di sini": "Login here",
      "verifikasi & lengkapi profil": "Verify & Complete Profile",
      "otp dikirim ke": "OTP sent to",
      "6-digit kode otp": "6-digit OTP code",
      "nama kamu": "Your Name",
      "contoh: hanniel salim": "e.g. Hanniel Salim",
      "daftar sebagai:": "Register as:",
      "brand owner": "Brand Owner",
      "punya produk, mau titip di banyak cafe.": "Own products, want to consign at multiple cafes.",
      "cafe / tenant pic": "Cafe / Tenant PIC",
      "punya cafe, mau jual produk brand.": "Own a cafe, want to sell brand products.",
      "verifikasi & daftar": "Verify & Register",
      "kirim ulang otp": "Resend OTP",
      "dev mode: kode otp sudah diisi otomatis. pilih peran lalu klik daftar.": "Dev mode: OTP code auto-filled. Choose a role then click register.",
      "nama minimal 2 karakter.": "Name must be at least 2 characters.",
      "pilih peran: brand atau cafe.": "Choose a role: Brand or Cafe.",
      "nama + peran wajib untuk pendaftaran pertama.": "Name + role required for first registration.",
      "berhasil! mengarahkan ke dashboard…": "Success! Redirecting to dashboard...",
      "akun kamu belum diverifikasi admin. tunggu max 1x24 jam.": "Your account is not yet verified by admin. Please wait up to 24 hours.",
      
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
      "minggu": "Sunday",
      "senin": "Monday",
      "selasa": "Tuesday",
      "rabu": "Wednesday",
      "kamis": "Thursday",
      "jumat": "Friday",
      "sabtu": "Saturday",
      "nonaktif": "inactive",
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

      // Filter Tabs
      "semua": "All",
      "kritis (< 5)": "Critical (< 5)",
      "habis": "Out of Stock",

      // Section Headers on Brand Dashboard
      "quest board (operasional)": "Operations Board",
      "kelola instansi (management)": "Management",
      "daftar partner": "Partner List",
      "daftar sku": "SKU List",

      // Quest Board items
      "daily quest: catat hari ini": "Daily Task: Record Today",
      "titip, tarik, & terjual (closing) dalam 1 layar": "Consign, Recall & Sold (closing) in 1 screen",
      "review laporan closing": "Review Closing Reports",
      "review setoran closing harian partner": "Review daily partner closing submissions",
      "settlements mingguan": "Weekly Settlements",
      "setujui tagihan & pembayaran partner": "Approve partner billings & payments",

      // Management section items
      "kelola sku produk": "Manage Product SKUs",
      "atur nama produk dan harga jual": "Manage product names and selling prices",
      "undang partner baru": "Invite New Partner",
      "jalin aliansi dengan partner cafe baru": "Establish partnership with a new cafe",
      "analytics & tren": "Analytics & Trends",
      "performa top sku & omzet mingguan": "Top SKU performance & weekly revenue",

      // Quest History / Combat Log
      "quest history (combat log)": "Activity Log",
      "memuat riwayat pertempuran…": "Loading activity history...",
      "memuat riwayat pertempuran...": "Loading activity history...",
      "belum ada riwayat aktivitas pertempuran.": "No activity history yet.",
      "aliansi didirikan dengan": "Partnership established with",
      "laporan closing": "Closing report",
      "disetujui!": "approved!",
      "laporan closing baru dari": "New closing report from",
      "siap direview!": "ready for review!",
      "quest selesai: settlement": "Task Complete: Settlement",
      "lunas": "paid in full",
      "disetujui brand!": "approved by Brand!",
      "settlement": "Settlement",
      "siap direview!": "ready for review!",

      // Stock status labels (JS-generated)
      "belum ada partner aktif.": "No active partners yet.",
      "belum ada stok terdaftar.": "No registered stock yet.",
      "tidak ada sku yang cocok.": "No matching SKUs found.",
      "tidak ada item yang cocok dengan filter.": "No items match the current filter.",
      "tidak ada partner atau sku yang cocok.": "No matching partners or SKUs found.",
      "stock hp": "Stock Level",
      "habis": "OUT OF STOCK",
      "unit": "UNIT",

      // Town Map
      "peta kosong": "Empty Map",
      "hq kami": "OUR HQ",
      "membuka pouch inventory…": "Loading stock inventory...",
      "membuka pouch inventory...": "Loading stock inventory...",
      "klik untuk fokus ke stok cafe ini": "Click to focus on this cafe's stock",

      // SKU/Partner empty states
      "belum ada sku.": "No SKUs yet.",
      "tambah sku": "Add SKU",
      "belum ada partner.": "No partners yet.",
      "invite partner pertama": "Invite your first partner",

      // Search
      "cari partner atau sku...": "Search partners or SKUs...",
      
      // SKU Management
      "forge new artifact": "Add New SKU",
      "item smithy": "SKU Registry",
      "forge & upgrade sku": "Manage & Update SKUs",
      "item code": "SKU Code",
      "cost (rp)": "Sale Price (Rp)",
      "artifact name": "SKU Name",
      "shelf life (days)": "Shelf Life (Days)",
      "forge sku": "Save SKU",
      "inventory arsenal": "Active SKU List",
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
      "draft alliance pact": "Invite New Cafe",
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
      "active alliance guild": "Active Partner",
      "draft contract pending": "Pending Approval",
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
      "quest: pasok logistik (titip)": "2. Add Consigned Stock (Consign)",
      "quest: tarik kembali (tarik)": "3. Recall Remaining Stock (Recall)",
      "quest: catatan kemenangan (terjual)": "4. Record Items Sold (Sold)",
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
      "kingdom treasury statistics": "Dashboard Analytics",
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
      "alchemy recipes": "SKU Inventory",
      
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
      "unknown": "Unknown",
      
      // De-gamified Brand Dashboard Wording
      "gold (omzet)": "Gold (Revenue)",
      "charisma": "Charisma (Partners)",
      "defense (stok)": "Defense (Stock Level)",
      "energy (aksi)": "Energy (Reports)",
      "lv. —": "Level —",
      "memuat xp…": "Loading Activity Points...",
      "memuat xp...": "Loading Activity Points...",
      "peta kongsian (virtual town)": "Virtual Cafe Map",
      "menggambar peta…": "Drawing map...",
      "menggambar peta...": "Drawing map...",
      "stok tersisa di partner": "Remaining Stock at Partners",
      "partner aktif": "active partners",
      "stok aman": "safe stock level",
      "laporan masuk": "reports submitted",

      // Movements page
      "kirim titipan stok": "Send Consignment Stock",
      "kirim stok masuk baru ke partner": "Send new incoming stock to partner",
      "tarik sisa stok": "Recall Remaining Stock",
      "tarik kembali sisa stok dari partner": "Recall remaining stock from partner",
      "lengkapi laporan harian": "Complete Daily Report",
      "aliansi partner (cafe)": "Partner Cafe",
      "stok awal aliansi": "Initial Partnership Stock",
      "selesaikan misi (simpan semua)": "Complete Task (Save All)",
      "simpan titip": "Save Consignment",
      "simpan tarik": "Save Recall",
      "belum ada partner aktif": "No active partners",
      "belum ada sku di brand ini.": "No SKUs in this brand yet.",
      "belum ada sku di brand ini. tambah sku dulu.": "No SKUs in this brand yet. Add SKU first.",

      // Settlement page
      "belum ada settlement. generator jalan setiap minggu 23:59 wib.": "No settlements yet. Generated every Sunday 23:59 WIB.",

      // Movements index
      "belum ada movement untuk filter ini.": "No movements found for this filter.",
      "belum ada partnership. invite partner dulu.": "No partnerships yet. Invite a partner first.",

      // Tenant pages
      "belum ada brand partner aktif. tunggu brand invite kamu.": "No active brand partner. Wait for the brand to invite you.",
      "belum ada sku yang bisa kamu jual.": "No SKUs available for you to sell.",
      "belum ada dispute. dispute muncul otomatis ketika ada selisih closing.": "No disputes. Disputes appear automatically when there's a closing discrepancy.",
      "belum ada pesan.": "No messages yet.",
      "kirim pesan": "Send Message",
      "belum ada brand partner": "No brand partner yet",
      "belum ada sku untuk partnership ini.": "No SKUs for this partnership.",

      // Closings page
      "hari": "days",

      // Revenue page
      "memuat partner…": "Loading partners...",
      "memuat partner...": "Loading partners...",
      "memuat rincian ledger…": "Loading ledger details...",
      "memuat rincian ledger...": "Loading ledger details...",
      "belum ada partner aktif": "No active partners",
      "memuat catatan penjualan…": "Loading sales records...",
      "memuat catatan penjualan...": "Loading sales records...",

      // Tenant Dashboard dynamic strings
      "tugas hari ini": "Today's Task",
      "input terjual + sisa fisik untuk semua sku titipan hari ini.": "Input sold + remaining physical stock for all consigned SKUs today.",
      "deadline: 23:59 wib": "Deadline: 23:59 WIB",
      "buka form": "Open Form",
      "closing hari ini sudah masuk ✓": "Today's closing is submitted ✓",
      "terima kasih. brand akan review dan kirim settlement.": "Thank you. Brand will review and send settlement.",
      "lihat riwayat": "View History",
      "brand partner": "Brand Partner",
      "link cepat": "Quick Links",
      "lihat disputes →": "View Disputes →",
      "sku tersedia": "Available SKUs",
      "aktif": "ACTIVE",
      "akun tenant tidak ditemukan.": "Tenant account not found.",
      "login ulang": "Login again",
      "tenant dashboard": "Tenant Dashboard",

      // Landing/Home & Back button additional translations
      "← kembali": "← Back",
      "for brand↔cafe partnerships": "For brand↔cafe partnerships",
      "titip. terjual. settle.": "Consign. Sold. Settle.",
      "konsinyasi untuk brand f&b dan cafe. catat titip, jual harian, tutup minggu otomatis. tanpa chat panjang. tanpa spreadsheet. tanpa drama akhir bulan.": "Consignment for F&B brands and cafes. Record consignment, daily sales, and weekly closing automatically. No long chats. No spreadsheets. No end-of-month drama.",
      "masuk via whatsapp": "Login via WhatsApp",
      "cara kerja": "How it works",
      "1. titip": "1. Consign",
      "brand catat titip + foto struk. cafe lihat stok real-time.": "Brands record consignment + upload receipt photo. Cafes view stock in real-time.",
      "2. terjual": "2. Sold",
      "cafe tutup kasir harian. terjual + sisa fisik per sku.": "Cafes perform daily closing. Record items sold + physical remaining stock per SKU.",
      "3. settle": "3. Settle",
      "setiap minggu otomatis: split 70/30, transparan, ada audit.": "Every Sunday automatically: split 70/30, transparent, with audit trails.",
      "sudah punya akun?": "Already have an account?",
      "masuk di sini": "Login here",
      "mau demo langsung?": "Want a live demo?",
      "lihat dashboard brand": "View brand dashboard",
      "daftar di kongsian": "Register at Kongsian",
      "kami akan kabari via wa max 1x24 jam. untuk sekarang kamu bisa login, tapi dashboard akan terbuka setelah admin approve.": "We will notify you via WhatsApp within 24 hours. You can log in for now, but the dashboard will be accessible after admin approval.",

      // Role Selector and Avatar names
      "sorcerer": "Sorcerer",
      "knight": "Knight",
      "druid": "Druid",
      "cleric": "Cleric",
      "rogue": "Rogue",
      "coffee sorcerer": "Coffee Sorcerer",
      "pastry knight": "Pastry Knight",
      "juice druid": "Juice Druid",
      "boba cleric": "Boba Cleric",
      "waffle rogue": "Waffle Rogue",

      // Brand Dashboard additional
      "dashboard brand": "Brand Dashboard",
      "item terjual": "items sold",

      // Settlements details
      "periode": "Period",
      "pembagian": "Revenue Share",
      "bukti pembayaran": "Payment Proof",
      "catatan": "Note",
      "dokumen": "Documents",
      "aksi": "Actions",
      "approve settlement": "Approve Settlement",
      "tandai sudah dibayar": "Mark as Paid",
      "catatan (opsional)": "Note (optional)",
      "misal: bca a.n. ...": "e.g. Bank Transfer ...",
      "mark paid": "Mark Paid",

      // Ops new additional
      "tanggal quest (hari)": "Quest Date (Day)",
      "aliansi partner (cafe)": "Partner Cafe",
      "— memuat partner… —": "— Loading partners... —",
      "stok awal aliansi": "Initial Partnership Stock",
      "titip (logistik)": "Consign (Logistics)",
      "tarik (retur)": "Recall (Returns)",
      "terjual (sales)": "Sold (Sales)",
      "sisa rak sistem": "System Stock Remaining",
      "persediaan logistik pertama yang sudah ada di partner sebelum mulai menggunakan sistem. cukup diisi sekali di awal aliansi.": "Initial stock present at partner before using the system. Only needs to be filled once at the start of the partnership.",
      "jumlah persediaan sku baru yang anda kirimkan ke partner aliansi hari ini.": "The quantity of new SKU inventory sent to the partner cafe today.",
      "tarik sisa stok yang tidak terjual kembali ke inventori anda.": "Recall unsold remaining stock back to your inventory.",
      "berapa cup/pack produk yang terjual hari ini. digunakan untuk perhitungan koin mingguan.": "How many units/packs of product sold today. Used for weekly settlement calculations.",
      "pilih partner aliansi dulu.": "Please select a partner cafe first.",

      // Movements
      "movements": "Movements",
      "pilih partnership di atas untuk lihat history.": "Select a partnership above to view history.",

      // Revenue page additional
      "rincian omset": "Revenue Details",
      "pilih partner (cafe)": "Select Cafe Partner",
      "gross revenue": "gross revenue",
      "brand share": "Brand Share",
      "cafe share": "Cafe Share",
      "total terjual": "Total Sold",

      // Analytics page additional
      "tren penjualan": "Sales Trends",
      "tren harian": "Daily Trends",
      "7 hari": "7 Days",
      "30 hari": "30 Days",
      "sampai hari ini": "until today",
      "akhir rentang": "end of range",
      "rata-rata": "average",
      "total items dispatched": "total items dispatched",
      "units": "Units",
      "qty terjual": "Qty Sold",
      "revenue share": "Revenue Share",
      "closing count": "Closings",
      "top 5 produk": "Top 5 Products",
      "per tenant": "Per Tenant",
      "semua tenant": "All Tenants",
      "menyiapkan…": "Preparing...",

      // Brand new additional
      "brand baru": "New Brand",
      "bikin brand pertamamu. kamu bisa ganti nama dan deskripsi nanti.": "Create your first brand. You can change the name and description later.",
      "nama brand": "Brand Name",
      "contoh: hanniel oat": "e.g. Hanniel Oat",
      "buat brand": "Create Brand",
      "nama brand minimal 2 karakter.": "Brand name must be at least 2 characters.",
      "nama brand harus punya minimal satu huruf/angka (jadi slug valid).": "Brand name must have at least one letter/number.",
      "slug itu sudah dipakai brand lain. coba nama lain.": "That slug is already taken. Try another name.",
      "gagal konek ke server. coba lagi.": "Failed to connect to the server. Try again.",
      "membuat…": "Creating..."
    },
    id: {
      // Global Header & Shared
      "brand dashboard": "Dashboard Brand",
      "tenant dashboard": "Dashboard Tenant",
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
      "halo": "Halo",
      
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

      // Login page - additional strings
      "pilih kode negara & masukkan nomor tanpa angka 0 di depan.": "Pilih kode negara & masukkan nomor tanpa angka 0 di depan.",
      "belum punya akun? prosesnya < 10 menit — kami auto-create akun pas verifikasi pertama.": "Belum punya akun? Prosesnya < 10 menit — kami auto-create akun saat verifikasi pertama.",
      "step 2 of 2": "Langkah 2 dari 2",
      "masukin kode otp": "Masukkan Kode OTP",
      "dikirim ke": "Dikirim ke",
      "berlaku 5 menit.": "Berlaku 5 menit.",
      "6-digit kode": "Kode 6 digit",
      "verifikasi": "Verifikasi",
      "kirim ulang": "Kirim Ulang",
      "kebanyakan percobaan. coba lagi ~1 jam.": "Kebanyakan percobaan. Coba lagi ~1 jam.",
      "gagal kirim otp. coba lagi.": "Gagal kirim OTP. Coba lagi.",
      "dev mode: kode otp sudah diisi otomatis di bawah.": "Dev mode: kode OTP sudah diisi otomatis di bawah.",
      "nomor hp tidak valid. silakan masukkan nomor yang benar.": "Nomor HP tidak valid. Silakan masukkan nomor yang benar.",
      "kode harus 6 digit angka.": "Kode harus 6 digit angka.",
      "kode salah. coba lagi.": "Kode salah. Coba lagi.",
      "kode sudah kadaluarsa. kirim ulang.": "Kode sudah kadaluarsa. Kirim ulang.",
      "terlalu banyak percobaan. kirim otp baru.": "Terlalu banyak percobaan. Kirim OTP baru.",
      "verifikasi gagal. coba lagi.": "Verifikasi gagal. Coba lagi.",
      "berhasil! mengecek status verifikasi\u2026": "Berhasil! Mengecek status verifikasi\u2026",
      "tidak ada session token. coba lagi.": "Tidak ada session token. Coba lagi.",
      "tidak bisa konek ke server. coba lagi.": "Tidak bisa konek ke server. Coba lagi.",
      "nomor tidak valid. balik ke step 1 dan masukin lagi.": "Nomor tidak valid. Balik ke step 1 dan masukkan lagi.",
      "otp baru dikirim. cek whatsapp kamu.": "OTP baru dikirim. Cek WhatsApp kamu.",
      "akun kamu sedang diverifikasi admin.": "Akun Anda sedang diverifikasi admin.",

      // Register page - additional strings
      "sign up": "Daftar",
      "daftar di": "Daftar di",
      "gratis untuk brand & cafe. masukin nomor hp, pilih peran, jadi.": "Gratis untuk brand & cafe. Masukkan nomor HP, pilih peran, jadi.",
      "sudah punya akun?": "Sudah punya akun?",
      "masuk di sini": "Masuk di sini",
      "verifikasi & lengkapi profil": "Verifikasi & Lengkapi Profil",
      "otp dikirim ke": "OTP dikirim ke",
      "6-digit kode otp": "Kode OTP 6 digit",
      "nama kamu": "Nama Anda",
      "contoh: hanniel salim": "Contoh: Hanniel Salim",
      "daftar sebagai:": "Daftar sebagai:",
      "brand owner": "Pemilik Brand",
      "punya produk, mau titip di banyak cafe.": "Punya produk, mau titip di banyak cafe.",
      "cafe / tenant pic": "PIC Cafe / Tenant",
      "punya cafe, mau jual produk brand.": "Punya cafe, mau jual produk brand.",
      "verifikasi & daftar": "Verifikasi & Daftar",
      "kirim ulang otp": "Kirim Ulang OTP",
      "dev mode: kode otp sudah diisi otomatis. pilih peran lalu klik daftar.": "Dev mode: kode OTP sudah diisi otomatis. Pilih peran lalu klik daftar.",
      "nama minimal 2 karakter.": "Nama minimal 2 karakter.",
      "pilih peran: brand atau cafe.": "Pilih peran: Brand atau Cafe.",
      "nama + peran wajib untuk pendaftaran pertama.": "Nama + peran wajib untuk pendaftaran pertama.",
      "berhasil! mengarahkan ke dashboard\u2026": "Berhasil! Mengarahkan ke dashboard\u2026",
      "akun kamu belum diverifikasi admin. tunggu max 1x24 jam.": "Akun Anda belum diverifikasi admin. Tunggu maks. 24 jam.",
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
      "minggu": "Minggu",
      "senin": "Senin",
      "selasa": "Selasa",
      "rabu": "Rabu",
      "kamis": "Kamis",
      "jumat": "Jumat",
      "sabtu": "Sabtu",
      "nonaktif": "nonaktif",
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

      // Filter Tabs
      "semua": "Semua",
      "kritis (< 5)": "Kritis (< 5)",
      "habis": "Habis",

      // Section Headers on Brand Dashboard
      "quest board (operasional)": "Papan Operasional",
      "kelola instansi (management)": "Kelola Instansi",
      "daftar partner": "Daftar Partner",
      "daftar sku": "Daftar SKU",

      // Quest Board items
      "daily quest: catat hari ini": "Tugas Harian: Catat Hari Ini",
      "titip, tarik, & terjual (closing) dalam 1 layar": "Titip, Tarik, & Terjual (closing) dalam 1 layar",
      "review laporan closing": "Review Laporan Closing",
      "review setoran closing harian partner": "Review setoran closing harian partner",
      "settlements mingguan": "Settlement Mingguan",
      "setujui tagihan & pembayaran partner": "Setujui tagihan & pembayaran partner",

      // Management section items
      "kelola sku produk": "Kelola SKU Produk",
      "atur nama produk dan harga jual": "Atur nama produk dan harga jual",
      "undang partner baru": "Undang Partner Baru",
      "jalin aliansi dengan partner cafe baru": "Jalin kerjasama dengan partner cafe baru",
      "analytics & tren": "Analisis & Tren",
      "performa top sku & omzet mingguan": "Performa top SKU & omzet mingguan",

      // Quest History / Combat Log
      "quest history (combat log)": "Riwayat Aktivitas",
      "memuat riwayat pertempuran…": "Memuat riwayat aktivitas…",
      "memuat riwayat pertempuran...": "Memuat riwayat aktivitas...",
      "belum ada riwayat aktivitas pertempuran.": "Belum ada riwayat aktivitas.",
      "aliansi didirikan dengan": "Kerjasama didirikan dengan",
      "laporan closing": "Laporan closing",
      "disetujui!": "disetujui!",
      "laporan closing baru dari": "Laporan closing baru dari",
      "siap direview!": "siap direview!",
      "quest selesai: settlement": "Tugas Selesai: Settlement",
      "lunas": "lunas",
      "disetujui brand!": "disetujui Brand!",
      "settlement": "Settlement",

      // Stock status labels (JS-generated)
      "belum ada partner aktif.": "Belum ada partner aktif.",
      "belum ada stok terdaftar.": "Belum ada stok terdaftar.",
      "tidak ada sku yang cocok.": "Tidak ada SKU yang cocok.",
      "tidak ada item yang cocok dengan filter.": "Tidak ada item yang cocok dengan filter.",
      "tidak ada partner atau sku yang cocok.": "Tidak ada partner atau SKU yang cocok.",
      "stock hp": "Level Stok",
      "unit": "UNIT",

      // Town Map
      "peta kosong": "Peta Kosong",
      "hq kami": "HQ KAMI",
      "membuka pouch inventory…": "Membuka inventaris stok…",
      "membuka pouch inventory...": "Membuka inventaris stok...",
      "klik untuk fokus ke stok cafe ini": "Klik untuk fokus ke stok cafe ini",

      // SKU/Partner empty states
      "belum ada sku.": "Belum ada SKU.",
      "tambah sku": "Tambah SKU",
      "belum ada partner.": "Belum ada partner.",
      "invite partner pertama": "Undang partner pertama",

      // Search
      "cari partner atau sku...": "Cari partner atau SKU...",
      
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
      "active alliance guild": "Mitra Aktif",
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
      "quest: catatan kemenangan (terjual)": "4. Catat Barang Terjual (Terjual)",
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
      "kingdom treasury statistics": "Analisis Dashboard",
      "total revenue": "Total Omset",
      "items dispatched": "Total Terjual",
      "scrolls recorded": "Closing Tercatat",
      "skirmishes occurred": "Dispute Terjadi",
      "historical gold chart": "Grafik Penjualan Historis",
      "most replicable alchemy recipes": "Daftar SKU Terlaris",
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
      "unknown": "Tidak Diketahui",
      
      // De-gamified Brand Dashboard Wording
      "gold (omzet)": "Emas (Omzet)",
      "charisma": "Karisma (Partner)",
      "defense (stok)": "Pertahanan (Stok)",
      "energy (aksi)": "Energi (Laporan)",
      "lv. —": "Level —",
      "memuat xp…": "Memuat Poin Keaktifan...",
      "memuat xp...": "Memuat Poin Keaktifan...",
      "peta kongsian (virtual town)": "Peta Cafe Virtual",
      "menggambar peta…": "Menggambar peta…",
      "menggambar peta...": "Menggambar peta…",
      "stok tersisa di partner": "Stok Tersisa di Partner",
      "partner aktif": "partner aktif",
      "stok aman": "stok aman",
      "laporan masuk": "laporan masuk",

      // Movements page
      "kirim titipan stok": "Kirim Titipan Stok",
      "kirim stok masuk baru ke partner": "Kirim stok masuk baru ke partner",
      "tarik sisa stok": "Tarik Sisa Stok",
      "tarik kembali sisa stok dari partner": "Tarik kembali sisa stok dari partner",
      "lengkapi laporan harian": "Lengkapi Laporan Harian",
      "aliansi partner (cafe)": "Partner Cafe",
      "stok awal aliansi": "Stok Awal Kemitraan",
      "selesaikan misi (simpan semua)": "Selesaikan (Simpan Semua)",
      "simpan titip": "Simpan Titip",
      "simpan tarik": "Simpan Tarik",
      "belum ada partner aktif": "Belum ada partner aktif",
      "belum ada sku di brand ini.": "Belum ada SKU di brand ini.",
      "belum ada sku di brand ini. tambah sku dulu.": "Belum ada SKU di brand ini. Tambah SKU dulu.",

      // Settlement page
      "belum ada settlement. generator jalan setiap minggu 23:59 wib.": "Belum ada settlement. Dibuat otomatis setiap Minggu 23:59 WIB.",

      // Movements index
      "belum ada movement untuk filter ini.": "Belum ada movement untuk filter ini.",
      "belum ada partnership. invite partner dulu.": "Belum ada partnership. Undang partner dulu.",

      // Tenant pages
      "belum ada brand partner aktif. tunggu brand invite kamu.": "Belum ada brand partner aktif. Tunggu brand mengundang Anda.",
      "belum ada sku yang bisa kamu jual.": "Belum ada SKU yang bisa Anda jual.",
      "belum ada dispute. dispute muncul otomatis ketika ada selisih closing.": "Belum ada dispute. Dispute muncul otomatis ketika ada selisih closing.",
      "belum ada pesan.": "Belum ada pesan.",
      "kirim pesan": "Kirim Pesan",
      "belum ada brand partner": "Belum ada brand partner",
      "belum ada sku untuk partnership ini.": "Belum ada SKU untuk partnership ini.",

      // Closings page
      "hari": "hari",

      // Revenue page
      "memuat partner…": "Memuat partner…",
      "memuat partner...": "Memuat partner...",
      "memuat rincian ledger…": "Memuat rincian laporan…",
      "memuat rincian ledger...": "Memuat rincian laporan...",
      "memuat catatan penjualan…": "Memuat catatan penjualan…",
      "memuat catatan penjualan...": "Memuat catatan penjualan...",

      // Tenant Dashboard dynamic strings
      "tugas hari ini": "Tugas Hari Ini",
      "input terjual + sisa fisik untuk semua sku titipan hari ini.": "Input terjual + sisa fisik untuk semua SKU titipan hari ini.",
      "deadline: 23:59 wib": "Deadline: 23:59 WIB",
      "buka form": "Buka Form",
      "closing hari ini sudah masuk ✓": "Closing hari ini sudah masuk ✓",
      "terima kasih. brand akan review dan kirim settlement.": "Terima kasih. Brand akan review dan kirim settlement.",
      "lihat riwayat": "Lihat Riwayat",
      "brand partner": "Brand Partner",
      "link cepat": "Link Cepat",
      "lihat disputes →": "Lihat Disputes →",
      "sku tersedia": "SKU Tersedia",
      "aktif": "AKTIF",
      "akun tenant tidak ditemukan.": "Akun tenant tidak ditemukan.",
      "login ulang": "Login ulang",

      // Landing/Home & Back button additional translations
      "← kembali": "← Kembali",
      "for brand↔cafe partnerships": "Kemitraan brand↔cafe",
      "titip. terjual. settle.": "Titip. Terjual. Settle.",
      "konsinyasi untuk brand f&b dan cafe. catat titip, jual harian, tutup minggu otomatis. tanpa chat panjang. tanpa spreadsheet. tanpa drama akhir bulan.": "Konsinyasi untuk brand F&B dan cafe. Catat Titip, jual harian, tutup minggu otomatis. Tanpa chat panjang. Tanpa spreadsheet. Tanpa drama akhir bulan.",
      "masuk via whatsapp": "Masuk via WhatsApp",
      "cara kerja": "Cara kerja",
      "1. titip": "1. Titip",
      "brand catat titip + foto struk. cafe lihat stok real-time.": "Brand catat Titip + foto struk. Cafe lihat stok real-time.",
      "2. terjual": "2. Terjual",
      "cafe tutup kasir harian. terjual + sisa fisik per sku.": "Cafe tutup kasir harian. Terjual + Sisa Fisik per SKU.",
      "3. settle": "3. Settle",
      "setiap minggu otomatis: split 70/30, transparan, ada audit.": "Setiap Minggu otomatis: split 70/30, transparan, ada audit.",
      "sudah punya akun?": "Sudah punya akun?",
      "masuk di sini": "Masuk di sini",
      "mau demo langsung?": "Mau demo langsung?",
      "lihat dashboard brand": "Lihat dashboard brand",
      "daftar di kongsian": "Daftar di Kongsian",
      "kami akan kabari via wa max 1x24 jam. untuk sekarang kamu bisa login, tapi dashboard akan terbuka setelah admin approve.": "Kami akan kabari via WA maks. 24 jam. Untuk sekarang Anda bisa login, tapi dashboard akan terbuka setelah admin menyetujui.",

      // Role Selector and Avatar names
      "sorcerer": "Sorcerer",
      "knight": "Knight",
      "druid": "Druid",
      "cleric": "Cleric",
      "rogue": "Rogue",
      "coffee sorcerer": "Coffee Sorcerer",
      "pastry knight": "Pastry Knight",
      "juice druid": "Juice Druid",
      "boba cleric": "Boba Cleric",
      "waffle rogue": "Waffle Rogue",

      // Brand Dashboard additional
      "dashboard brand": "Dashboard Brand",
      "item terjual": "item terjual",

      // Settlements details
      "periode": "Periode",
      "pembagian": "Bagi Hasil",
      "bukti pembayaran": "Bukti Pembayaran",
      "catatan": "Catatan",
      "dokumen": "Dokumen",
      "aksi": "Aksi",
      "approve settlement": "Setujui Settlement",
      "tandai sudah dibayar": "Tandai Sudah Dibayar",
      "catatan (opsional)": "Catatan (opsional)",
      "misal: bca a.n. ...": "Misal: BCA a.n. ...",
      "mark paid": "Tandai Lunas",

      // Ops new additional
      "tanggal quest (hari)": "Tanggal Quest (Hari)",
      "aliansi partner (cafe)": "Aliansi Partner (Cafe)",
      "— memuat partner… —": "— Memuat partner… —",
      "stok awal aliansi": "Stok Awal Aliansi",
      "titip (logistik)": "Titip (Logistik)",
      "tarik (retur)": "Tarik (Retur)",
      "terjual (sales)": "Terjual (Sales)",
      "sisa rak sistem": "Sisa Rak Sistem",
      "persediaan logistik pertama yang sudah ada di partner sebelum mulai menggunakan sistem. cukup diisi sekali di awal aliansi.": "Persediaan logistik pertama yang sudah ada di partner sebelum mulai menggunakan sistem. Cukup diisi sekali di awal aliansi.",
      "jumlah persediaan sku baru yang anda kirimkan ke partner aliansi hari ini.": "Jumlah persediaan SKU baru yang Anda kirimkan ke partner aliansi hari ini.",
      "tarik sisa stok yang tidak terjual kembali ke inventori anda.": "Tarik sisa stok yang tidak terjual kembali ke inventori Anda.",
      "berapa cup/pack produk yang terjual hari ini. digunakan untuk perhitungan koin mingguan.": "Berapa cup/pack produk yang terjual hari ini. Digunakan untuk perhitungan koin mingguan.",
      "pilih partner aliansi dulu.": "Pilih partner aliansi dulu.",

      // Movements
      "movements": "Mutasi Stok",
      "pilih partnership di atas untuk lihat history.": "Pilih partnership di atas untuk lihat riwayat.",

      // Revenue page additional
      "rincian omset": "Rincian Omset",
      "pilih partner (cafe)": "Pilih Partner (Cafe)",
      "gross revenue": "omset kotor",
      "brand share": "Bagi Hasil Brand",
      "cafe share": "Bagi Hasil Cafe",
      "total terjual": "Total Terjual",

      // Analytics page additional
      "tren penjualan": "Tren Penjualan",
      "tren harian": "Tren Harian",
      "7 hari": "7 Hari",
      "30 hari": "30 Hari",
      "sampai hari ini": "sampai hari ini",
      "akhir rentang": "akhir rentang",
      "rata-rata": "rata-rata",
      "total items dispatched": "total barang dikirim",
      "units": "Jumlah",
      "qty terjual": "Kuantitas Terjual",
      "revenue share": "Bagi Hasil",
      "closing count": "Laporan Closing",
      "top 5 produk": "Top 5 Produk",
      "per tenant": "Per Tenant",
      "semua tenant": "Semua tenant",
      "menyiapkan…": "Menyiapkan…",

      // Brand new additional
      "brand baru": "Brand Baru",
      "bikin brand pertamamu. kamu bisa ganti nama dan deskripsi nanti.": "Bikin brand pertamamu. Kamu bisa ganti nama dan deskripsi nanti.",
      "nama brand": "Nama Brand",
      "contoh: hanniel oat": "Contoh: Hanniel Oat",
      "buat brand": "Buat brand",
      "nama brand minimal 2 karakter.": "Nama brand minimal 2 karakter.",
      "nama brand harus punya minimal satu huruf/angka (jadi slug valid).": "Nama brand harus punya minimal satu huruf/angka (jadi slug valid).",
      "slug itu sudah dipakai brand lain. coba nama lain.": "Slug itu sudah dipakai brand lain. Coba nama lain.",
      "gagal konek ke server. coba lagi.": "Gagal konek ke server. Coba lagi.",
      "membuat…": "Membuat…"
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
