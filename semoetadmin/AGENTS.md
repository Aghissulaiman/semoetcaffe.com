# AGENTS.md — Semoet Admin

> Panel admin/pemilik **Semoet Cafe** · Next.js 16 (App Router) · Tailwind CSS v4 · BFF proxy ke `semoet_service`.

Aplikasi ini untuk pemilik memantau **penjualan & pendapatan**, produk terlaris, dan operasional cabang. Tema mengikuti app mobile Semoet: dominan putih + aksen cokelat.

## Repo Map

```
src/
├── app/
│   ├── layout.tsx                 # root: ThemeProvider + SidebarProvider + anti-flash script
│   ├── globals.css                # tema Tailwind v4 (@theme)
│   ├── not-found.tsx
│   ├── (auth)/
│   │   ├── layout.tsx             # layout terpusat tanpa shell
│   │   └── signin/page.tsx        # halaman masuk
│   ├── (dashboard)/               # shell sidebar + header
│   │   ├── layout.tsx
│   │   ├── page.tsx               # Dashboard (ringkasan owner)
│   │   ├── penjualan/page.tsx     # Penjualan (omzet, tren, rincian harian)
│   │   ├── laporan/page.tsx       # Laporan (akumulasi diskon/kotor/bersih/modal/laba + per produk)
│   │   ├── produk/page.tsx        # Produk (produk terlaris)
│   │   ├── pengguna/page.tsx      # Pengguna (status & peran)
│   │   ├── peran/page.tsx         # Peran & Izin
│   │   ├── cabang/page.tsx        # Cabang (detail area/meja/jam)
│   │   ├── reservasi/page.tsx     # Reservasi (daftar; baris & DP lunas bisa diklik)
│   │   ├── reservasi/[id]/page.tsx # Detail reservasi (status, DP, riwayat)
│   │   ├── reservasi/ruangan/page.tsx # Ruangan reservasi (CRUD area + gambar + harga/jam)
│   │   ├── katalog/page.tsx       # Katalog (menu/produk + varian & modifier)
│   │   ├── inventori/page.tsx     # Inventori (bahan/snapshot/mutasi)
│   │   ├── inventori/lokasi/page.tsx # Lokasi stok (tambah gudang/outlet)
│   │   ├── inventori/rekap/page.tsx # Rekap pergerakan stok (Masuk/Keluar/Penjualan/…)
│   │   ├── inventori/stok-keluar/page.tsx # Stok keluar (transfer gudang → outlet)
│   │   ├── inventori/stok-opname/page.tsx # Stok opname (penyesuaian fisik)
│   │   ├── supplier/page.tsx      # Supplier (CRUD master supplier)
│   │   ├── pembelian/page.tsx     # Pembelian (daftar purchase order)
│   │   ├── pembelian/[id]/page.tsx # Detail PO (penerimaan, pembayaran, hutang)
│   │   ├── pembelian/[id]/bayar/page.tsx # Form pembayaran supplier (halaman penuh, bukan modal)
│   │   ├── pembelian/penerimaan/page.tsx # Penerimaan barang (stok masuk)
│   │   ├── pembelian/hutang/page.tsx # Hutang supplier (accounts payable)
│   │   ├── promo/page.tsx         # Promo (baca katalog)
│   │   ├── event/page.tsx         # Event (paket event & katering, baca)
│   │   ├── event-booking/page.tsx # Booking Event (daftar booking + agenda event)
│   │   ├── audit-log/page.tsx     # Audit Log
│   │   └── akses-ditolak/page.tsx # Halaman saat peran tidak punya izin menu
│   └── api/
│       ├── auth/{login,logout,session}/route.ts
│       └── proxy/[...path]/route.ts   # BFF: teruskan ke semoet_service
├── components/
│   ├── common/                    # ComponentCard, PageBreadCrumb, SemoetLogo, AppModal,
│   │                              # Pagination, ToneBadge, ThemeToggleButton, DataState, GridShape,
│   │                              # DateRangePicker (preset + kalender), ExportCsvButton, ConfirmDialog,
│   │                              # AccessGuard (halaman tanpa izin → /akses-ditolak)
│   ├── dashboard/                 # KpiCard (dengan delta periode), OperationalStats,
│   │                              # OrderStatusBreakdown, BranchPerformance, RecentActivity,
│   │                              # TopCustomers, TopProductsList
│   ├── charts/                    # SalesAreaChart, TopProductsBarChart, VerticalBarChart,
│   │                              # OrderStatusDonut (ApexCharts)
│   ├── penjualan/                 # SalesFilterBar, DailySalesTable, BreakdownList, SalesBreakdown
│   ├── laporan/                   # ProductSalesTable, ProductSalesSearch,
│   │                              # DailyFinancialTable, CategorySalesTable
│   ├── produk/                    # TopProductsTable
│   ├── pengguna/                  # UsersTable, UserFormModal
│   ├── peran/                     # RolesTable, PermissionCatalog, RoleFormModal
│   ├── cabang/                    # BranchDetailModal, AreaFormModal, TableFormModal, AreaImagePicker
│   ├── reservasi/                 # ReservationStatusForm (ubah status + DP + bukti transfer),
│   │                              # DepositPaidDialog (pop-up verifikasi DP dari aplikasi),
│   │                              # RoomTablesModal (kelola meja/kursi per ruangan)
│   ├── katalog/                   # ProductCard, ProductDetailModal, ProductFormModal,
│   │                              # ProductImagePicker (unggah gambar ke storage)
│   ├── inventori/                 # IngredientsTable, StockSnapshotView, StockMovementsTable,
│   │                              # StockOut*, StockOpname*, StockSummaryTable
│   ├── pembelian/                 # SupplierFormModal, PurchaseOrderFormModal,
│   │                              # GoodsReceiptModal, GoodsReceiptDetailModal,
│   │                              # SupplierPaymentForm, confirm/cancel PO, tabel
│   ├── promo/                     # PromoCard
│   ├── event/                     # EventPackageCard, CateringPackageCard,
│   │                              # EventAgendaManager (kalender agenda event)
│   ├── audit/                     # AuditLogTable
│   ├── header/UserDropdown.tsx
│   ├── ui/                        # primitives: button, badge, dropdown, modal, table, alert, avatar
│   └── form/                      # Form, Label, Select, input/, switch/ (primitif, sebagian belum dipakai)
├── context/                       # ThemeContext, SidebarContext
├── hooks/                         # useApi, useSession, useDateRange, useBranchPerformance,
│                                  # useIsClient, useClickOutside, useModal, useGoBack
├── icons/                         # .svg + index.tsx (SVGR); tambahkan icon baru di sini
├── layout/                        # shell: AppSidebar, AppHeader, Backdrop
├── lib/
│   ├── client.ts                  # apiGet/apiSend (fetch ke /api/proxy, lempar ApiError)
│   ├── access.ts                  # menu admin → izin + hasPermission/filter/canAccess/firstAllowed
│   ├── auth-client.ts             # login(), logout()
│   ├── format.ts                  # formatIdr, formatNumber, formatCompact, formatDate, dll
│   ├── csv.ts                     # buildCsv/downloadCsv (pemisah `;` + BOM, ramah Excel id-ID)
│   ├── date-range.ts              # helper rentang tanggal (preset cepat + grid kalender),
│   │                              # previousRange & percentChange (perbandingan periode)
│   ├── labels.ts                  # label status (pesanan/user/audit) + jenis diskon/mutasi/area → Bahasa Indonesia
│   ├── deposit.ts                 # rumus DP (depositStages, describeDeposit1) + helper status tahap DP
│   ├── ui.ts                      # kelas Tailwind bersama (input, tombol, sel/header tabel)
│   ├── theme.ts                   # external store tema + skrip anti-flash
│   └── server/session.ts          # helper auth server-side (login/refresh/me/logout + cookie)
├── types/api.ts                   # tipe respons API semoet_service
├── proxy.ts                       # middleware guard (Next 16: "proxy.ts", bukan middleware.ts)
└── utils/                         # cn()
```

## Stack

- **Next.js 16** (App Router, Turbopack) · **React 19** · **TypeScript** strict.
- **Tailwind CSS v4** — tema di `src/app/globals.css` (`@theme`), tanpa `tailwind.config`.
- Path alias `@/*` → `src/*`.
- **Tanpa i18n** (`next-intl` sudah dihapus). Seluruh teks UI **Bahasa Indonesia**.
- Scripts: `npm run dev`, `npm run build`, `npm run lint`. Node >= 20.9.
- Versi Next.js ini bisa berbeda dari pengetahuan model — baca `node_modules/next/dist/docs/` bila ragu.

## Arsitektur data (BFF)

- Browser **tidak** memanggil `semoet_service` langsung. Semua lewat route handler Next:
  `useApi("/admin/dashboard/overview")` → `/api/proxy/admin/dashboard/overview` → `SEMOET_API_URL` (default `http://localhost:4000`).
- `src/app/api/proxy/[...path]/route.ts` meneruskan GET/POST/PATCH/PUT/DELETE, meneruskan cookie sesi,
  dan **refresh otomatis** bila backend membalas 401.
- Sesi disimpan sebagai cookie httpOnly: `semoet_at` (access) + `semoet_rt` (refresh).
- Refresh token **dirotasi** backend (token lama langsung dicabut). Agar banyak permintaan paralel
  tidak memicu "token dipakai ulang" (yang mencabut sesi → user ter-logout), refresh digabung
  **single-flight + cache 60 detik** lewat `refreshBackendShared` di `src/lib/server/session.ts`
  (state disimpan di `globalThis` agar berlaku lintas route handler `/api/proxy` & `/api/auth/session`).
- **Guard rute** di `src/proxy.ts`: belum login → `/signin`; sudah login membuka `/signin` → `/`.
  Matcher mengecualikan `/api`, `/_next`, dan berkas statis.
- Pengambilan data di klien memakai hook `useApi(path)` (menerima `null` untuk melewati pemanggilan).
  Tidak ada SWR/React Query — cukup `useState`/`useEffect` di dalam hook.

### Envelope respons

Sukses: `{ success: true, data, meta?, requestId }`. Gagal: `{ success: false, error: { code, message, details } }`.
`apiGet`/`apiSend` di `src/lib/client.ts` membuka envelope dan melempar `ApiError` berisi `message`.
Uang selalu **integer rupiah** — format dengan `formatIdr`.

## Konvensi

- **Halaman baru** → folder di `src/app/(dashboard)/<nama>/page.tsx` (pakai shell) atau `src/app/(auth)/...` (tanpa shell).
  Jangan buat halaman langsung di `src/app/` di luar grup.
- **Komponen** → `components/<fitur>/` bila spesifik domain, atau `components/common|ui/`. Satu fitur satu folder,
  pecah jadi sub-komponen kecil dengan props bertipe.
- Berkas komponen **PascalCase** + default export; berkas rute huruf kecil (`page.tsx`, `layout.tsx`); hook camelCase.
- `"use client"` hanya untuk komponen yang memakai hook/event handler/API browser.
- Selalu impor dari alias `@/*` untuk lintas folder.
- **Navigasi** memakai `next/link` & `next/navigation` (tidak ada wrapper i18n lagi).
- Bungkus tiap seksi halaman dengan `ComponentCard`; tambahkan `PageBreadCrumb` di atas halaman (kecuali Dashboard yang memakai sapaan).
- **Komponen bersama** untuk halaman data: `AppModal` (bukan `ui/modal` — gaya kopi, tanpa backdrop-blur berat),
  `Pagination` (dari `useApi().meta`), dan `ToneBadge` (pil status dari `StatusTone`).
- Kelas kontrol/sel formulir & tabel ambil dari `@/lib/ui` (`inputClass`, `primaryButtonClass`, `thClass`, dll) agar seragam.

## Styling

- Gunakan token `@theme`, bukan nilai mentah:
  - Warna kopi: `coffee-espresso`, `coffee-dark`, `coffee-brown` (primary), `coffee-caramel`,
    `coffee-gold` (accent), `coffee-cream`, `coffee-milk`, `coffee-linen` (border), `coffee-muted`,
    `coffee-success`, `coffee-danger`, `coffee-warning`, `coffee-night`, `coffee-night-soft`, `coffee-night-border`.
  - Skala `brand-*` Tailwind sudah dipetakan ulang ke skala kopi (`brand-500` = `#6f4e37`).
  - Tipografi: `font-outfit`, `text-theme-xs/sm`, `text-title-*`. Shadow: `shadow-theme-xs/sm/md/lg`.
  - Z-index token: `z-1`, `z-9`, `z-30`, `z-50`, ….
- **Dark mode class-based** (`@custom-variant dark (&:is(.dark *))`), dikelola `ThemeContext` (light/dark/auto)
  lewat external store di `src/lib/theme.ts`. **Setiap elemen ber-style wajib punya varian `dark:`**.
- Dukung properti logis (`ms-*`/`me-*`, `ps-*`/`pe-*`, `start-*`/`end-*`, `border-s-*`/`border-e-*`,
  `rounded-s-*`/`rounded-e-*`, `text-start`/`text-end`) agar rapi dan siap RTL.
- Warna heksadesimal hanya boleh di objek opsi chart (`ApexOptions.colors`), meniru palet `@theme`.
- **Chart**: `react-apexcharts` wajib diimpor dinamis — `dynamic(() => import("react-apexcharts"), { ssr: false })`.
- Selalu impor ikon dari `@/icons` (SVG dikompilasi via SVGR). Icon baru → taruh `.svg` di `icons/`, ekspor di `index.tsx`.
- **Gambar produk eksternal** (mis. Unsplash/CDN): `next.config.ts` belum mengatur `images.remotePatterns`,
  jadi pakai `<img>` + komentar `eslint-disable-next-line @next/next/no-img-element`. Aktifkan `remotePatterns`
  dulu bila ingin beralih ke `next/image`.

## Menghindari error lint (react-hooks v6)

- `react-hooks/set-state-in-effect` **error**: jangan panggil setState langsung di badan effect.
  Lakukan di dalam fungsi async yang di-`await`, atau turunkan nilai saat render.
- Untuk membedakan server/klien tanpa hydration mismatch, pakai `useIsClient()` (berbasis `useSyncExternalStore`),
  bukan `useEffect(() => setMounted(true))`. Contoh: `useDateRange()`.
- Ikon/format angka yang bergantung `new Date()`/locale → hitung hanya setelah `useIsClient()`.

## Cakupan saat ini

- **Batch 1 (selesai):** Dashboard, Penjualan, Produk.
- **Batch 2 (selesai):** Pengguna (status & peran), Peran & Izin, Cabang (area/meja/jam),
  Inventori (bahan/snapshot/mutasi), Promo (baca katalog), Audit Log.
- **Batch 3 (selesai):** Katalog (menu + varian & modifier), Event (paket event & katering).
- **Batch 4 (selesai):** Laporan Penjualan (`/laporan`) — akumulasi diskon, penjualan kotor & bersih,
  modal (HPP), laba, dan qty item terjual, plus rekap per produk yang bisa dicari. Pemilih rentang
  tanggal `DateRangePicker` (preset + kalender, tanpa ketik manual) dipakai di Penjualan, Produk, & Laporan.
  Pencarian total penjualan per item/produk lewat komponen bersama `ProductSalesSearch` (di Penjualan & Produk;
  Laporan memakai tabel per produk). Input **harga modal (HPP) per varian** di modal detail produk Katalog.
  Filter **Cabang** dinonaktifkan di Penjualan, Produk, & Laporan (menu Cabang di sidebar tetap ada).
- **Batch 5 (selesai):** perkaya halaman **Penjualan, Laporan, Produk** agar tidak sepi isi.
  Setiap KPI menampilkan **perbandingan periode sebelumnya** (delta %) via `previousRange` +
  `percentChange` (dihitung di klien, tanpa endpoint tambahan). **Penjualan**: seksi sebaran
  (`SalesBreakdown`) — metode pesanan, metode pembayaran, jam sibuk, hari sibuk, status pesanan.
  **Laporan**: `DailyFinancialTable` (kotor/diskon/bersih/modal/laba tiap hari) + `CategorySalesTable`
  (kontribusi & margin per kategori). **Produk**: ringkasan akurat dari laporan penjualan + chart &
  tabel kategori. Semua tabel bisa **diekspor CSV** lewat `ExportCsvButton` (`lib/csv.ts`).
- **Batch 6 (selesai):** CRUD di panel admin —
  **Pengguna**: tombol *Tambah Anggota* + modal `UserFormModal` (profil, peran, status), aksi
  *Ubah* serta *Hapus* (soft delete) / *Pulihkan* (via `PATCH /admin/users/:id/status`). Daftar
  dapat menampilkan anggota terhapus lewat filter status.
  **Peran**: `RoleFormModal` untuk tambah/ubah peran (checkbox izin dikelompokkan per resource, ambil
  detail dari `GET /admin/roles/:id`) + hapus; role sistem & role yang masih dipakai tidak bisa dihapus.
  **Katalog/Produk**: `ProductFormModal` untuk tambah/ubah produk beserta varian & HPP-nya
  (slug otomatis, satu varian default, validasi harga sebelum diskon ≥ harga jual) + hapus
  (soft delete). Komponen bersama baru: `ConfirmDialog`.
- **Belum tersedia di backend:** daftar semua pesanan admin, CRUD kategori/gambar/modifier,
  CRUD promo/event, booking event.
  Halaman Promo dan Event masih baca-saja sesuai API yang ada.
  Endpoint ber-token pengguna (`/deliveries`, `/loyalty/*`, `/me/*`) bukan untuk admin.
- **Batch 7 (selesai):** **unggah gambar produk**. `ProductFormModal` (tambah & ubah) punya
  `ProductImagePicker` — berkas dibaca sebagai data URL, dikirim ke `POST /admin/uploads/images`,
  backend mengunggahnya ke object storage Supabase, lalu `imageStorageKey`/`imagePublicUrl`
  disematkan pada `POST/PATCH /admin/products`. Gambar utama muncul otomatis di kartu katalog
  (endpoint publik `/products` membaca `imageUrl` dari `product_images`). Ganti/hapus gambar
  memakai field yang sama (kirim `null` untuk menghapus).
- **Batch 8 (selesai):** **kelola Area & Meja cabang + gambar area** (dipakai app pelanggan
  sebagai pilihan reservasi bergambar). Modal `BranchDetailModal` tab *Area & Meja* kini punya
  CRUD penuh: `AreaFormModal` (tambah/ubah area: nama, tipe, aktif, **gambar** via
  `AreaImagePicker` → folder `areas`), tombol hapus (ditolak bila area masih punya meja),
  `TableFormModal` (tambah/ubah meja: kode, kapasitas, aktif; area tidak bisa dipindah), dan
  hapus meja (ditolak bila masih terikat reservasi aktif). Area tampil sebagai kartu bergambar.
  Backend menambahkan `image_url`/`image_storage_key` pada `dining_areas`; endpoint publik
  `GET /branches/:id/areas` mengembalikan `imageUrl`. Endpoint admin baru:
  `POST /admin/branches/:id/areas`, `PATCH|DELETE /admin/areas/:areaId`,
  `POST /admin/tables`, `PATCH|DELETE /admin/tables/:tableId` (permission `branch`).
- **Batch 9 (selesai):** **kelola reservasi + uang muka (DP)**. Alur status tidak lagi langsung
  selesai: *Diajukan → Diterima (konfirmasi) → DP dibayar → Selesai* (ditambah *Sudah Duduk*,
  *Dibatalkan*, *Tidak Hadir*). Halaman `/reservasi` punya kolom aksi **Kelola** menuju halaman
  baru `/reservasi/[id]` (`src/app/(dashboard)/reservasi/[id]/page.tsx`) — kolom ini dihapus di
  Batch 10, sekarang **baris tabelnya** yang diklik. Halaman detail memuat
  `ReservationStatusForm`: pilih status (kartu alur), isi **nominal DP**, **status DP**
  (Belum Bayar/Menunggu Bayar/Lunas/Dikembalikan), **unggah bukti transfer**
  (`POST /admin/uploads/images` folder `deposits`, atau tempel URL), catatan DP, dan catatan
  untuk pelanggan. Halaman detail juga menampilkan ringkasan reservasi, kartu DP, dan **riwayat
  status**. Backend menambah kolom DP di `reservations` (`deposit_amount_idr`, `deposit_status`,
  `deposit_proof_url`, `deposit_proof_storage_key`, `deposit_paid_at`, `deposit_note`) dan tabel
  `reservation_status_history`; endpoint `PATCH /admin/reservations/:id` kini menerima field DP
  dan mencatat riwayat, `GET /admin/reservations/:id` & `GET /reservations/:id` mengembalikan
  `deposit*` + `history`. Label/tone DP ada di `lib/labels.ts`
  (`reservationStatusLabel/Tone`, `depositStatusLabel/Tone`). App mobile menampilkan banner notifikasi,
  kartu DP, riwayat, dan ketentuan DP + centang setuju di form (lihat `app_semoet_caffe`).
- **Batch 10 (selesai):** **DP otomatis + konfirmasi DP dari aplikasi**. DP1 (uang muka awal)
  dihitung sistem dan selalu di rentang **Rp300.000–Rp500.000**: total sewa < Rp1.000.000 →
  Rp300.000 (minimum), Rp1.000.000–Rp1.666.666 → 30% × total, > Rp1.666.666 → Rp500.000
  (maksimum); DP1 tidak boleh melebihi total sewa. DP2 = 30% dari sisa setelah DP1, pelunasan =
  sisanya. Rumus yang sama ada di backend (`computeDepositStages` + `describeDeposit1Rule`),
  app pelanggan (`lib/format.ts`), dan admin (`lib/deposit.ts` → `depositStages`,
  `describeDeposit1`) supaya nominal tidak pernah berbeda antar layar.
  Kolom aksi **Kelola** dihapus dari daftar `/reservasi`: **baris tabel bisa diklik** langsung
  membuka `/reservasi/[id]` (`DataTable` kini mendukung `onRowClick`).
  DP yang sudah dibayar pelanggan di aplikasi jadi **klikable**: di daftar, badge DP berstatus
  `paid` (dan belum pada reservasi final) membuka pop-up `DepositPaidDialog`; di halaman detail,
  kartu tiap tahap menampilkan tombol *Konfirmasi pembayaran dari aplikasi*. Pop-up menampilkan
  detail + bukti transfer, lalu **PATCH `/admin/reservations/:id`**: untuk DP1 pada reservasi
  berstatus *Diajukan* sekaligus `status: 'confirmed'` (agar pelanggan bisa bayar DP2), untuk
  tahap lain hanya catatan verifikasi. Kolom nominal tidak pernah dikirim — backend sudah
  mengunci nominal DP ke hitungan sistem.
- **Batch 11 (selesai):** **menu Reservasi bertingkat + halaman Ruangan**. Item sidebar
  *Reservasi* kini bisa dibuka/tutup (`children` di `AppSidebar`, otomatis terbuka saat rute
  anak aktif) dengan pilihan *Daftar Reservasi* dan *Ruangan*. Halaman baru
  `/reservasi/ruangan` mengelola ruangan reservasi (tabel `dining_areas`) per cabang: kartu
  bergambar, status aktif, harga sewa/jam, jumlah meja & kursi, serta tambah/ubah/hapus lewat
  `AreaFormModal` (prop `noun="Ruangan"`) + `AreaImagePicker` (folder `areas`). Tiap kartu punya
  tombol **Meja** yang membuka `RoomTablesModal` (tambah/ubah/hapus meja via `TableFormModal` +
  `DELETE /admin/tables/:id`) sehingga meja bisa dikosongkan sebelum ruangan dihapus; dialog hapus
  ruangan menawarkan *Kelola Meja* bila ruangan masih punya meja. Memakai endpoint
  admin yang sudah ada (`POST /admin/branches/:id/areas`, `PATCH|DELETE /admin/areas/:areaId`).
- **Batch 12 (selesai):** **Agenda Event di halaman Booking Event**. Halaman `/event-booking`
  kini punya dua tab: *Booking* (daftar booking event) dan *Agenda Event*. Agenda menandai
  tanggal penting seperti **Ramadan**, **Lebaran**, atau promo musiman dalam bentuk kalender
  bulanan (Senin–Minggu) + daftar agenda bulan tersebut. Klik tanggal untuk menambah agenda,
  klik nama event untuk mengubah; tersedia ubah/hapus dan status *Aktif/Nonaktif*. Komponen
  `components/event/EventAgendaManager.tsx` memakai endpoint baru
  `GET|POST /admin/event-agenda` dan `GET|PATCH|DELETE /admin/event-agenda/:id`
  (permission `event`), serta endpoint publik `GET /event-agenda` untuk app pelanggan.
  Backend menambah tabel `event_agenda` (`title`, `description`, `starts_on`, `ends_on`,
  `is_active`, `created_by`) di schema `semoet` + salinan `public`.

- **Batch 13 (selesai):** **sidebar Menu + Promo fungsional**. Sidebar *Katalog* & *Promo*
  dipindah ke grup **Operasional** menjadi induk **Menu** dengan submenu *Katalog* dan *Promo*.
  Halaman `/promo` kini punya CRUD penuh lewat `GET|POST /admin/promos` dan
  `GET|PATCH|DELETE /admin/promos/:id`: pilih jenis **Kode Voucher** (wajib kode, pelanggan
  klaim/pakai saat checkout) atau **Diskon Langsung Menu** (tanpa kode, pilih menu/kategori,
  harga otomatis turun di katalog + checkout). Form `components/promo/PromoFormModal.tsx`
  mengatur periode, diskon persen/nominal, batas maksimum, kuota, serta sasaran menu/kategori.
  Hanya satu diskon menu otomatis yang boleh aktif pada periode yang sama. Halaman
  `/katalog` memakai endpoint baru `GET /admin/products` supaya produk nonaktif tetap terlihat
  dan bisa difilter. Backend juga menambahkan field `promo`/`promoPriceIdr` di katalog publik
  dan menerapkan diskon menu otomatis saat pembuatan order.

- **Batch 14 (selesai):** **Kategori menu**. Sidebar **Menu** kini punya submenu
  **Katalog**, **Kategori**, dan **Promo**. Halaman `/kategori` melakukan CRUD kategori
  (`POST|PATCH|DELETE /admin/categories`) dengan nama, slug otomatis, induk (mendukung
  subkategori), urutan tampil, dan status aktif. Kategori yang masih dipakai produk atau
  punya subkategori tidak bisa dihapus; induk juga divalidasi agar tidak membentuk siklus.
  Saat menambah produk di `/katalog`, tersedia tombol **+ Kategori baru** di dalam form
  produk: kategori langsung dibuat, ditambahkan ke pilihan, dan otomatis terpilih tanpa
  menutup form.

- **Batch 15 (selesai):** **Pembelian, supplier, purchase order, penerimaan otomatis, dan hutang**.
  Alur transaksi dipisah dari alur stok: PO mencatat pesanan + status pembayaran
  (belum/sebagian/lunas), sedangkan penerimaan barang mencatat stok fisik.
  Halaman baru: `/supplier` (CRUD master supplier), `/pembelian` (daftar + buat PO),
  `/pembelian/[id]` (detail PO, terbitkan/batalkan, terima barang, catat pembayaran),
  `/pembelian/penerimaan` (daftar stok masuk), dan `/pembelian/hutang` (accounts payable).
  Form penerimaan punya toggle **“Lanjut tambah stok masuk?”**: pilihan *Ya* langsung
  memposting stok dan menulis mutasi inventori dengan referensi nomor PO; pilihan
  *Tidak* menyimpan draft yang bisa diposting belakangan. Backend menambah resource izin
  `purchase` serta endpoint `GET|POST|PATCH|DELETE /admin/suppliers`,
  `GET|POST|PATCH|DELETE /admin/purchase-orders`, `POST /admin/purchase-orders/:id/(confirm|cancel|receipts|payments)`,
  `GET /admin/goods-receipts`, `GET /admin/goods-receipts/:id`, `POST /admin/goods-receipts/:id/post`,
  dan `GET /admin/payables`. Nomor dokumen memakai format `POYYMMDD######` dan `GRYYMMDD######`.
  Harga beli terakhir bahan (`ingredients.last_purchase_price_idr`) ikut diperbarui saat
  penerimaan diposting.

- **Batch 16 (selesai):** **Fase 2–4 inventori Olsera** — dokumen **Stok Keluar** (transfer
  gudang → outlet), dokumen **Stok Opname** (penyesuaian fisik), dan **Rekap Pergerakan Stok**.
  Backend (`semoet_service`) menambah tabel `stock_out_documents` + `stock_out_items` dan
  `stock_opname_documents` + `stock_opname_items` (di schema `semoet` & salinan `public`),
  sequence nomor `SKYYMMDD######` & `OPYMMDD######` (stok keluar & opname), serta endpoint
  `GET|POST /admin/stock-outs`, `GET|PATCH|POST /admin/stock-outs/:id/(post|cancel)`, `DELETE`,
  `GET|POST /admin/stock-opnames`, `GET|PATCH|POST /admin/stock-opnames/:id/(post|cancel)`, `DELETE`,
  dan `GET /admin/stock/summary` (rekap masuk/keluar/penjualan/terbuang/penyesuaian/stok akhir).
  Alur stok keluar: dokumen draft menyimpan mutasi per bahan; posting membuat pasangan
  mutasi `transfer_out` (asli) + `transfer_in` (tujuan) dengan `reference_type = stock_out`.
  Alur opname: snapshot saldo sistem saat draft; posting membandingkan dengan jumlah fisik dan
  mencatat mutasi `adjustment` hanya bila selisih > 0 (surplus) / < 0 (defisit). Nomor dokumen
  backend memakai format `SKYYMMDD######` dan `OPYYMD######`. Tipe tanggal dari DB dipakai lewat
  normalisasi `YYYY-MM-DD` karena driver Postgres dapat mengirim nilai date sebagai objek Date.
  Panel admin (`semoetadmin`) menambah halaman baru: `/inventori/stok-keluar`, `/inventori/stok-opname`,
  dan `/inventori/rekap`; sidebar grup **Bahan** menambah *Rekap Stok*, *Stok Keluar*, & *Stok
  Opname*. Komponen baru: `StockOutTable/FormModal/DetailModal/CancelModal`, `StockOpnameTable/
  FormModal/DetailModal/CancelModal`, `StockSummaryTable`, serta tipe API & label status dokumen.
  Halaman baru: `/inventori/lokasi` untuk menambah lokasi stok (gudang/outlet) dari admin.
- **Batch 17 (selesai):** **peran & izin memakai akses sesungguhnya**. Sidebar sekarang
  difilter lewat metadata `MENU_GROUPS` + helper `lib/access.ts` (`hasPermission`,
  `filterMenuGroups`, `canAccessPath`, `firstAllowedPath`) berdasarkan `GET /auth/me`.
  `AccessGuard` di layout dashboard me-redirect ke `/akses-ditolak` bila halaman tidak punya
  izinnya; `/akses-ditolak` punya tombol "Buka halaman yang tersedia". Pratinjau "Menu yang
  bisa dibuka" ditambahkan di `RoleFormModal` (per menu, ada pencarian izin). Backend: `requireStaff`
  sekarang menerima semua role non-`customer` (role kustom panel admin dianggap staf) sehingga
  peran buatan (mis. "Kasir") bisa dipakai; `/deliveries/active` & tracking delivery kini punya
  `requirePermission`. Halaman Pengguna/Peran menonaktifkan tombol aksi yang tidak punya izin;
  `UserFormModal` mewajibkan minimal satu peran. Halaman Dashboard hanya memuat kartu audit &
  pengguna bila perannya punya izin.

## Gambar produk & object storage

- Gambar **tidak** diunggah dari browser langsung ke Supabase: service role key hanya hidup di
  backend. Alur: browser → `POST /api/proxy/admin/uploads/images` (JSON `{ data, contentType }`,
  `data` = data URL/base64, maks. 5 MB) → `semoet_service` → Supabase Storage REST → balikan
  `{ storageKey, publicUrl, contentType, sizeBytes }`.
- Env backend (`semoet_service/.env`): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `STORAGE_BUCKET_NAME`, `STORAGE_PUBLIC_BASE_URL`. Bila bucket tidak bisa dijangkau, endpoint
  membalas **503** dengan pesan yang jelas.
- `product_images` menyimpan `storage_key` (unik) + `public_url` + `is_primary`. Panel admin kini
  mengelola **satu gambar utama** per produk (galeri banyak gambar belum diekspos di UI).
- Karena `next.config.ts` belum mengatur `images.remotePatterns`, pratinjau memakai `<img>` +
  komentar `eslint-disable-next-line @next/next/no-img-element`.

## Harga modal (HPP) & laporan

- Kolom `cost_idr` ada di tabel `product_variants` (backend `semoet_service`), **tidak** diekspos ke
  katalog publik — hanya lewat endpoint admin `GET/PATCH /admin/products/:id/(variants|variant-costs)`.
- Laporan memakai endpoint admin `GET /admin/reports/sales`, `GET /admin/reports/products`,
  `GET /admin/reports/daily`, `GET /admin/reports/breakdown`, dan `GET /admin/reports/categories`
  (param `from`, `to`, `branchId`, `q`, `sort`, `page`, `limit`). Rumus:
  `kotor = Σ subtotal`, `diskon = Σ discount`, `bersih = kotor − diskon`,
  `modal = Σ (quantity × HPP varian)`, `laba = bersih − modal`. Hanya pesanan **lunas (paid)** dan
  **tidak dibatalkan**; item `cancelled` dikecualikan.

## Don'ts

- Jangan minta/instal paket baru tanpa bertanya ke user.
- Jangan buat `tailwind.config` — Tailwind v4 dikonfigurasi di `globals.css`.
- Jangan impor `react-apexcharts` secara statis — selalu `next/dynamic` + `ssr: false`.
- Jangan panggil backend langsung dari komponen; selalu lewat `@/lib/client` → `/api/proxy`.
- Jangan tinggalkan hardcode teks Inggris di UI (target: Bahasa Indonesia).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
