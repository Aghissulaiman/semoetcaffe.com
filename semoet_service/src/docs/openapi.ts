/**
 * Merakit satu dokumen OpenAPI 3.1 dari semua path group.
 *
 * Spec dipecah per domain di `src/docs/paths/*.ts` supaya tiap file tetap
 * mudah dibaca, lalu digabung di sini bersama `components` dan daftar tag.
 */

import { components } from './components.js';
import { authPaths } from './paths/auth.paths.js';
import { branchPaths, catalogPaths, homePaths } from './paths/catalog.paths.js';
import {
  eventPaths,
  loyaltyPaths,
  promoPaths,
  reservationPaths,
  reviewPaths,
} from './paths/engagement.paths.js';
import {
  adminPaths,
  aiPaths,
  chatPaths,
  gamificationPaths,
  inventoryPaths,
  momentPaths,
  notificationPaths,
} from './paths/operations.paths.js';
import { orderPaths, paymentPaths } from './paths/order.paths.js';
import { addressPaths, favoritePaths, profilePaths } from './paths/profile.paths.js';
import type { OpenApiDocument, PathItemObject, TagObject } from './types.js';

export const API_VERSION = '1.0.0';

/**
 * Urutan grup di sini menentukan urutan section di Swagger UI, bukan urutan
 * penulisan di file. `prefix` otomatis ditambahkan ke setiap path.
 */
const GROUPS: Array<{
  prefix: string;
  paths: Record<string, PathItemObject>;
}> = [
  { prefix: '', paths: authPaths },

  { prefix: '', paths: profilePaths },
  { prefix: '', paths: addressPaths },
  { prefix: '', paths: favoritePaths },

  { prefix: '', paths: branchPaths },
  { prefix: '', paths: catalogPaths },
  { prefix: '', paths: homePaths },

  { prefix: '', paths: orderPaths },
  { prefix: '', paths: paymentPaths },

  { prefix: '', paths: promoPaths },
  { prefix: '', paths: loyaltyPaths },
  { prefix: '', paths: reviewPaths },
  { prefix: '', paths: reservationPaths },
  { prefix: '', paths: eventPaths },

  { prefix: '', paths: inventoryPaths },
  { prefix: '', paths: momentPaths },
  { prefix: '', paths: notificationPaths },
  { prefix: '', paths: chatPaths },
  { prefix: '', paths: gamificationPaths },
  { prefix: '', paths: aiPaths },
  { prefix: '', paths: adminPaths },
];

const TAG_ORDER = [
  'Auth & Identity',
  'User Profile',
  'Address',
  'Family',
  'Favorites',
  'Branch & Area',
  'Menu & Katalog',
  'Home & Banner',
  'Order',
  'Payment',
  'Delivery',
  'Promo & Voucher',
  'Loyalty & Points',
  'Review',
  'Reservasi',
  'Event & Catering',
  'Inventory (Admin)',
  'Community Moments',
  'Notification',
  'Chat & Support',
  'Gamification',
  'AI Assistant',
  'Admin',
  'System',
];

const TAG_DESCRIPTIONS: Record<string, string> = {
  'Auth & Identity':
    'Registrasi, login, OTP, OAuth, refresh token, sesi perangkat, dan ganti password.',
  'User Profile': 'Profil pelanggan, tier loyalitas, dan preferensi:notifikasi.',
  Address: 'Alamat pengiriman customer beserta alamat default.',
  Family: 'Grup keluarga dan anggota yang bisa dipakai untuk pesan bersama.',
  Favorites: 'Produk favorit customer.',
  'Branch & Area': 'Cabang, jam buka, area indoor/outdoor, dan meja beserta QR token.',
  'Menu & Catalog': 'Kategori, produk, varian, modifier, ketersediaan, dan ulasan produk.',
  'Home & Banner': 'Beranda aplikasi: banner, produk unggulan, dan ringkasan.',
  Order: 'Keranjang menjadi order, item, status, dan pembatalan.',
  Payment: 'Charge, verifikasi, refund, dan webhook payment gateway.',
  Delivery: 'Status pengiriman, penugasan kurir, dan tracking.',
  'Promo & Voucher': 'Katalog promo, klaim voucher, validasi voucher, dan riwayat penukaran.',
  'Loyalty & Points': 'Saldo poin, mutasi poin, hadiah, dan penukaran hadiah.',
  Review: 'Ulasan produk, moderasi, dan ringkasan rating.',
  Reservasi: 'Reservasi meja dine in, ketersediaan meja, dan perubahan status.',
  'Event & Catering': 'Paket event, paket katering, booking event, dan ketersediaan tanggal.',
  'Inventory (Admin)': 'Bahan baku, resep produk, lokasi stok, dan mutasi stok.',
  'Community Moments': 'Moment komunitas pelanggan beserta moderasi.',
  Notification: 'Notifikasi in-app, perangkat push, dan pengiriman notifikasi oleh admin.',
  'Chat & Support': 'Percakapan customer service beserta pesan dan penugasan staff.',
  Gamification: 'Aktivitas harian, hadiah, dan riwayat permainan.',
  'AI Assistant': 'Asisten AI untuk pelanggan maupun dashboard admin.',
  Admin: 'Dashboard penjualan, audit log, role, permission, dan manajemen user.',
  System: 'Health check untuk load balancer dan container orchestration.',
};

/** Tag yang benar-benar dipakai path, mengikuti urutan TAG_ORDER. */
function buildTags(): TagObject[] {
  const used = new Set<string>();
  for (const group of GROUPS) {
    for (const item of Object.values(group.paths)) {
      for (const op of Object.values(item)) {
        for (const tag of op.tags) used.add(tag);
      }
    }
  }

  return TAG_ORDER.filter((name) => used.has(name)).map((name) => ({
    name,
    description: TAG_DESCRIPTIONS[name],
  }));
}

function mergePaths(): Record<string, PathItemObject> {
  const merged: Record<string, PathItemObject> = {};

  for (const group of GROUPS) {
    for (const [path, item] of Object.entries(group.paths)) {
      const fullPath = `${group.prefix}${path}`;
      const existing = merged[fullPath];

      if (existing) {
        // Path yang sama di dua grup digabung per-method, bukan ditimpa.
        merged[fullPath] = { ...existing, ...item };
      } else {
        merged[fullPath] = item;
      }
    }
  }

  return merged;
}

function buildDocument(): OpenApiDocument {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Semoet Cafe API',
      version: API_VERSION,
      summary: 'Backend service untuk aplikasi pelanggan Semoet Cafe.',
      description: [
        'REST API untuk aplikasi mobile pelanggan Semoet Cafe dan dashboard admin/owner.',
        '',
        '## Konvensi',
        '',
        '- Base URL: `/api/v1`.',
        '- Seluruh respons sukses memakai envelope `{ success: true, data, meta?, requestId? }`.',
        '- Seluruh respons gagal memakai `{ success: false, error: { code, message, details? }, requestId }`.',
        '- Field monetary dalam rupiah penuh (integer, tanpa pembulatan).',
        '- Waktu memakai ISO-8601 dengan offset timezone Asia/Jakarta.',
        '',
        '## Autentikasi',
        '',
        'Seluruh endpoint memakai `Authorization: Bearer <accessToken>` kecuali yang ditandai',
        'publik (login, katalog publik, webhook payment gateway, health check).',
        'Access token berlaku 15 menit; gunakan `POST /auth/refresh` untuk memperpanjang sesi.',
        '',
        '## Idempotensi',
        '',
        'Endpoint tulis yang rawan dobel-kirim menerima header `Idempotency-Key`',
        '(8-128 karakter). Mengirim ulang dengan kunci yang sama mengembalikan hasil lama,',
        'bukan membuat data ganda.',
      ].join('\n'),
      contact: {
        name: 'Semoet Cafe Engineering',
        email: 'engineering@semoetcafe.com',
      },
      license: { name: 'UNLICENSED' },
    },
    servers: [
      { url: 'http://localhost:4000/api/v1', description: 'Local development' },
      { url: 'http://localhost:4000', description: 'Local (tanpa prefix)' },
    ],
    tags: buildTags(),
    paths: mergePaths(),
    components,
    security: [{ bearerAuth: [] }],
  };
}

/** Dokumen OpenAPI lengkap; di-cache supaya tidak dirakit ulang tiap request. */
export const openApiDocument: OpenApiDocument = buildDocument();

/** Jumlah operasi (endpoint) yang terdaftar di spec. */
export function countOperations(document: OpenApiDocument = openApiDocument): number {
  let total = 0;
  for (const item of Object.values(document.paths)) {
    total += Object.keys(item).length;
  }
  return total;
}
