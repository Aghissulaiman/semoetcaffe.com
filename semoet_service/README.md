# Semoet Cafe - Backend Service

REST API untuk aplikasi mobile pelanggan Semoet Cafe dan dashboard admin/owner.

- **Runtime**: Node.js 20+
- **Framework**: Express 5 + TypeScript (ESM / NodeNext)
- **Database**: PostgreSQL 15+
- **Validasi**: Zod
- **Dokumentasi**: OpenAPI 3.1 + Swagger UI
- **Log**: Pino (JSON), `pino-pretty` saat development

---

## 1. Menjalankan secara lokal

```bash
# 1. Install dependency
npm install

# 2. Siapkan konfigurasi environment
cp .env.example .env
# lalu sesuaikan DATABASE_URL dan JWT_* di .env

# 3. Siapkan skema + data dasar (butuh PostgreSQL jalan)
npm run db:migrate
npm run db:seed

# 4. Jalankan
npm run dev
```

Server menyala di `http://localhost:4000`. Dokumentasi ada di
**<http://localhost:4000/docs>**.

| Perintah | Fungsi |
| --- | --- |
| `npm run dev` | Server development dengan hot reload (`tsx watch`) |
| `npm run build` | Compile TypeScript ke `dist/` |
| `npm start` | Jalankan hasil build (`node dist/server.js`) |
| `npm run typecheck` | Cek tipe tanpa emit (src + scripts) |
| `npm run db:migrate` | Terapkan skema dari `src/db/schema.sql` |
| `npm run db:seed` | Isi permission, role, tier, gamifikasi, cabang, admin |
| `npm run db:setup` | `db:migrate` + `db:seed` |
| `npm run docs:print` | Cetak spec OpenAPI ke stdout |
| `npm test` | Unit test (Vitest) |

---

## 2. Dokumentasi API

Swagger UI menampilkan seluruh endpoint yang dikelompokkan per domain.

| URL | Isi |
| --- | --- |
| `/docs` | Swagger UI interaktif (bisa "Try it out") |
| `/openapi.json` | Dokumen OpenAPI 3.1 mentah |
| `/health` | Health check + status koneksi database |

Tidak perlu membangun spec secara manual. Dokumentasi disusun dari
TypeScript, jadi **spec ikut gagal build kalau ada endpoint yang salah**.

```
src/docs/
├── types.ts        # Tipe subset OpenAPI 3.1
├── helpers.ts      # Builder operation/parameter/response
├── components.ts   # Schema bersama + security scheme
├── openapi.ts      # Penggabungan semua path + tag + server
├── swagger.ts      # Mount Swagger UI ke Express
└── paths/          # Path item per domain
```

Untuk menyimpan spec sebagai file (dipakai client generator / Postman):

```bash
npm run docs:print > openapi.json

# Validasi semua $ref tanpa mencetak spec
npx tsx scripts/print-openapi.ts --check
```

### Menjalankan request dari Swagger UI

1. Buka `/docs`.
2. Klik **Authorize**, isi access token (`Authorization: Bearer <token>`).
   Token diperoleh dari `POST /api/v1/auth/login`.
3. Buka endpoint, klik **Try it out**, lalu **Execute**.

---

## 3. Konvensi API

### Base URL

```
http://localhost:4000/api/v1
```

### Envelope respons

Sukses:

```json
{
  "success": true,
  "data": { "...": "..." },
  "meta": { "page": 1, "limit": 20, "total": 42, "totalPages": 3, "hasNext": true, "hasPrev": false },
  "requestId": "req_2f1c..."
}
```

Gagal:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validasi gagal",
    "details": [{ "field": "body.items", "message": "Keranjang tidak boleh kosong", "code": "too_small" }]
  },
  "requestId": "req_2f1c..."
}
```

`requestId` juga dikembalikan sebagai header `X-Request-Id` supaya mudah
dicocokkan dengan log server.

### Aturan lain

- Field monetary adalah **integer rupiah penuh**, tidak ada pembulatan atau
  pecahan desimal.
- Waktu memakai ISO-8601 dengan offset (`2026-01-05T14:30:00+07:00`).
- Nama field API memakai **camelCase**; kolom database tetap `snake_case`.
  Konversi terjadi otomatis di layer repository (`src/utils/serialize.ts`).
- List endpoint selalu mengembalikan `meta` pagination berisi
  `page`, `limit`, `total`, `totalPages`, `hasNext`, `hasPrev`.
- Endpoint tulis yang rawan dobel-kirim menerima header `Idempotency-Key`
  (8-128 karakter). Kirim ulang dengan kunci yang sama tidak membuat data ganda.

### Autentikasi

```bash
curl -X POST http://localhost:4000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"08111000111","password":"RahasiaKuat123"}'
```

```bash
curl http://localhost:4000/api/v1/me \
  -H "Authorization: Bearer <accessToken>"
```

Access token berlaku 15 menit. Perpanjang dengan `POST /auth/refresh`.

Endpoint publik (tanpa token): katalog, promo, paket event, ketersediaan
reservasi, health check, dan webhook payment gateway.

---

## 4. Kelompok endpoint

| Tag | Prefix path | Ringkasan |
| --- | --- | --- |
| Auth & Identity | `/auth` | Registrasi, login, OTP, OAuth, sesi, ganti password |
| User Profile | `/me` | Profil, tier, preferensi |
| Address | `/me/addresses` | Alamat pengiriman dan alamat default |
| Family | `/me/family` | Grup keluarga dan anggota |
| Favorites | `/me/favorites` | Produk favorit |
| Branch & Area | `/branches`, `/tables` | Cabang, jam buka, area, meja, QR |
| Menu & Katalog | `/products`, `/categories` | Kategori, produk, varian, modifier, ulasan |
| Home & Banner | `/home`, `/banners` | Beranda, banner, produk unggulan |
| Order | `/orders`, `/me/orders` | Pembuatan, daftar, status, pembatalan |
| Payment | `/payments` | Charge, verifikasi, refund, webhook |
| Delivery | `/orders/:id/delivery`, `/deliveries` | Kurir, tracking, status |
| Promo & Voucher | `/promos`, `/me/vouchers` | Promo, klaim dan validasi voucher |
| Loyalty & Points | `/me/points`, `/loyalty` | Saldo poin, hadiah, penukaran |
| Review | `/reviews`, `/me/reviews` | Ulasan produk |
| Reservasi | `/reservations` | Booking meja dine in |
| Event & Catering | `/event-packages`, `/event-bookings` | Paket event, katering, booking |
| Inventory (Admin) | `/admin/ingredients` | Bahan baku, resep, stok, mutasi |
| Community Moments | `/moments` | Moment pelanggan dan moderasi |
| Notification | `/me/notifications`, `/me/devices` | Notifikasi dan perangkat push |
| Chat & Support | `/chat` | Percakapan customer service |
| Gamification | `/gamification` | Absen, putar roda, hadiah |
| AI Assistant | `/ai` | Asisten AI pelanggan dan admin |
| Admin | `/admin` | Dashboard, audit log, role, user |

---

## 5. Struktur folder

```
src/
├── config/         # env, database pool, logger, raw body webhook
├── controllers/    # HTTP: baca input, panggil service, kirim respons
├── db/             # schema.sql, migrate.ts, seed.ts
├── docs/           # OpenAPI spec + Swagger UI
├── errors/         # AppError + factory error
├── middlewares/    # auth, rbac, validate, rate limit, idempotensi, error handler
├── repositories/   # SQL murni, satu file per domain
├── routers/        # definisi route + middleware chain
├── services/       # business logic, transaksi, lock
├── types/          # tipe domain & augmentasi Express
├── utils/          # money, pagination, serialize, jwt, password, notifier
└── validators/     # skema Zod per domain
```

Alur satu request:

```
HTTP request
  -> middlewares (requestId, rate limit, authenticate, rbac, validate)
  -> router
  -> controller   (ambil input, pilih status code)
  -> service      (validasi bisnis, transaksi, lock, idempotensi)
  -> repository   (SQL, camelize hasil)
  -> PostgreSQL
```

Aturan penting: **controller tidak boleh menulis SQL, melempar error domain,
atau memanggil repository secara langsung.** Semua itu tugas service.

---

## 6. Docker

Prasyarat: Docker + Docker Compose.

```bash
# Build image dan jalankan API + PostgreSQL
docker compose up -d --build

# Pantau log API
docker compose logs -f api

# Hentikan (data tetap aman di named volume)
docker compose down

# Hentikan dan HAPUS seluruh data
docker compose down -v
```

Setelah container siap:

- API: <http://localhost:4000>
- Swagger UI: <http://localhost:4000/docs>
- PostgreSQL: `localhost:5432` (buka di DBeaver)

### Detail image

`Dockerfile` memakai multi-stage build:

1. `deps` - `npm ci` (menghormati `package-lock.json`)
2. `build` - `npm run build`, lalu `npm prune --omit=dev`
3. `prod` - image akhir berbasis `node:20-alpine`, user non-root (`nodejs`),
   `dumb-init` sebagai PID 1, dan `HEALTHCHECK` ke `/health`

Image runtime tidak memuat source TypeScript, hanya `dist/`.

### Override konfigurasi

`docker-compose.yml` membaca nilai dari environment shell atau file `.env`.
Untuk production, ganti seluruh nilai default - terutama `JWT_ACCESS_SECRET`,
`JWT_REFRESH_SECRET`, dan `POSTGRES_PASSWORD`.

---

## 7. Database

Skema berada di `src/db/schema.sql` (PostgreSQL 15+, schema `semoet`).

```bash
npm run db:migrate   # aman dijalankan berulang
npm run db:seed      # aman dijalankan berulang
```

Seed mengisi yang wajib agar aplikasi langsung bisa dipakai:

- Permission untuk seluruh resource dan action
- Role: `super_admin`, `admin`, `branch_manager`, `staff`, `customer`
- Tier loyalitas: Bronze, Silver, Gold, Platinum
- Aktivitas gamifikasi beserta hadiahnya
- Dua cabang contoh
- Akun admin dari `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`

> Seed **tidak pernah** mereset password user yang sudah ada. Menjalankan ulang
> `db:seed` aman dan hanya mengisi data yang belum ada.

---

## 8. Testing

```bash
npm test           # sekali jalan
npm run test:watch # mode watch
```

---

## 9. Troubleshooting

**`401 Unauthorized` padahal tokenvalid** - cek `Authorization: Bearer <token>`
(ada spasi setelah `Bearer`), dan pastikan token belum kedaluwarsa (15 menit).
Cek juga status akun masih `active`.

**`relation "xxx" does not exist`** - skema belum diterapkan. Jalankan
`npm run db:migrate`.

**`ETIMEDOUT` / koneksi database gagal** - pastikan PostgreSQL jalan dan
`DATABASE_URL` di `.env` benar. Dalam Docker, host-nya `db`, bukan `localhost`.

**Rate limit 429** - endpoint auth dibatasi ketat untuk mencegah brute force.
Tunggu jendela limit berakhir atau naikkan `AUTH_RATE_LIMIT_MAX`.

**OTP tidak diterima** - di mode development, OTP dicetak di log server
(`[notifier:dev] OTP untuk pengujian`). Di production OTP dikirim via SMS/email.
