# Semoet Admin

Panel admin/pemilik **Semoet Cafe** — dibangun dengan Next.js 16 (App Router), React 19, TypeScript, dan Tailwind CSS v4.

Fungsi utama:

- **Dashboard** — ringkasan omzet hari ini, pesanan, cabang aktif, stok menipis, tren omzet 14 hari, produk terlaris, dan sebaran status pesanan.
- **Penjualan** — filter rentang tanggal & cabang, KPI (total omzet, pesanan, rata-rata, pembatalan), grafik tren omzet harian, dan tabel rincian per hari.
- **Produk** — produk terlaris berdasarkan omzet atau jumlah unit, lengkap dengan grafik dan tabel kontribusi.

Tema mengikuti app mobile Semoet: dominan putih dengan aksen cokelat, mendukung mode terang/gelap.

## Menjalankan

1. Pastikan backend **`semoet_service`** sudah berjalan (default `http://localhost:4000`).
2. Salin env contoh lalu sesuaikan bila perlu:

   ```bash
   cp .env.example .env.local
   ```

   `SEMOET_API_URL` menunjuk ke base `semoet_service` (mis. `http://localhost:4000`).

3. Jalankan dev server:

   ```bash
   npm install
   npm run dev
   ```

4. Buka `http://localhost:3000`, masuk dengan akun admin yang terdaftar di `semoet_service`.

Script lain: `npm run build` (produksi), `npm run start`, `npm run lint`.

## Cara kerja singkat

Aplikasi ini memakai pola **BFF (Backend-for-Frontend)**: browser hanya berbicara dengan route handler Next.js,
yang meneruskan permintaan ke `semoet_service`.

```
Browser ──► /api/proxy/[...path] ──► semoet_service (/api/v1)
   ▲              │
   └── cookie sesi (httpOnly: semoet_at + semoet_rt)
```

- `POST /api/auth/login` menyimpan cookie sesi httpOnly.
- `src/app/api/proxy/[...path]/route.ts` meneruskan permintaan beserta cookie dan menyegarkan token otomatis saat backend membalas 401.
- `src/proxy.ts` menjaga halaman: pengguna belum login diarahkan ke `/signin`.

## Struktur

```
src/
├── app/
│   ├── (auth)/signin/          # halaman masuk
│   ├── (dashboard)/            # Dashboard, Penjualan, Produk (dengan sidebar + header)
│   └── api/                    # auth + proxy BFF
├── components/                 # UI per fitur (dashboard, penjualan, produk, dsb.)
├── hooks/                      # useApi, useSession, useDateRange, useIsClient, …
├── lib/                        # client fetch, format, label, theme, session server
├── layout/                     # shell: AppSidebar, AppHeader
└── proxy.ts                    # middleware guard
```

## Status

**Batch 1** (Dashboard, Penjualan, Produk) sudah selesai. Menu Pengguna & Peran, Inventori, Audit Log, Cabang,
serta Promo/Event direncanakan pada batch berikutnya (sebagian menunggu endpoint di `semoet_service`).

Lihat [`AGENTS.md`](./AGENTS.md) untuk konvensi pengembangan.
