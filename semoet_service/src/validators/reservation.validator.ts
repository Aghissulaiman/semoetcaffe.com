import { z } from 'zod';
import { RESERVATION_STATUS, SEATING_PREFERENCE } from '../config/constants.js';
import { booleanQuery, isoDateTimeInFuture, uuidSchema } from './common.validator.js';

export const createReservationSchema = z
  .object({
    branchId: uuidSchema,
    /** Ruangan (area) yang dipesan. Bisa lebih dari satu. */
    roomIds: z.array(uuidSchema).min(1, 'Pilih minimal satu ruangan').max(10),
    /** Awal & akhir sewa (ISO). Durasi = selisih, bukan angka tetap. */
    reservedFor: isoDateTimeInFuture,
    reservedUntil: z.string().min(1, 'Jam selesai wajib diisi'),
    guestCount: z.coerce.number().int().min(1).max(100),
    /** Kontak yang diisi pelanggan pada form (boleh beda dari profil akun). */
    contactName: z.string().trim().max(120, 'Nama kontak maksimal 120 karakter').nullish(),
    contactPhone: z.string().trim().max(30, 'Nomor telepon maksimal 30 karakter').nullish(),
    /** DP1 TIDAK diterima dari klien — selalu dihitung sistem (Rp300.000–500.000). */
    depositProofUrl: z.string().trim().max(1000).nullish(),
    depositProofStorageKey: z.string().trim().max(500).nullish(),
    /**
     * Order menu (makanan/minuman) yang menyertai reservasi. Nominal TIDAK
     * dikirim klien — server menghitung ulang harga varian + modifier, lalu
     * menjadikannya bagian dari total (dan akhirnya DP).
     */
    menuItems: z
      .array(
        z.object({
          productId: uuidSchema,
          variantId: uuidSchema,
          quantity: z.coerce.number().int().min(1).max(100),
          /** Pilihan modifier (opsional); divalidasi & dihargai ulang di server. */
          modifiers: z
            .array(
              z.object({
                optionId: uuidSchema,
                quantity: z.coerce.number().int().min(1).max(20).default(1),
              }),
            )
            .max(20)
            .optional(),
          note: z.string().trim().max(300).nullish(),
        }),
      )
      .max(50)
      .optional(),
    specialRequests: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((value) => new Date(value.reservedUntil).getTime() > new Date(value.reservedFor).getTime(), {
    message: 'Jam selesai harus setelah jam mulai',
    path: ['reservedUntil'],
  })
  .refine(
    (value) => new Date(value.reservedFor).getTime() + 15 * 60_000 > Date.now(),
    { message: 'Waktu reservasi sudah lewat', path: ['reservedFor'] },
  );

export const listMyReservationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(RESERVATION_STATUS).optional(),
  upcomingOnly: booleanQuery.optional(),
});

export const reservationIdParamSchema = z.object({ id: uuidSchema });

/**
 * Pelanggan mengunggah bukti transfer untuk sebuah tahap DP. Nominal boleh
 * dikirim (mis. pelunasan sebagian), bila kosong pakai nominal tahap default.
 */
export const uploadDepositProofSchema = z.object({
  /** Tahap DP: DP1 (`deposit`), DP2 (`deposit2`), atau pelunasan (`settlement`). */
  stage: z.enum(['deposit', 'deposit2', 'settlement']).default('deposit2'),
  /** Isi berkas: base64 murni atau data URL (`data:image/png;base64,...`). */
  data: z.string().min(1, 'Bukti transfer wajib diisi'),
  contentType: z.string().trim().max(100).optional(),
  note: z.string().trim().max(500).nullish(),
});

/**
 * Pelanggan membuat pembayaran DP untuk reservasinya sendiri.
 * Tahap: DP1 (`deposit`), DP2 (`deposit2`), atau pelunasan (`settlement`).
 * Nominal TIDAK diterima dari klien — selalu dihitung sistem.
 */
export const createMyDepositChargeSchema = z.object({
  stage: z.enum(['deposit', 'deposit2', 'settlement']).default('deposit'),
  paymentMethod: z.enum(['qris', 'virtual_account', 'bank_transfer', 'ewallet', 'card']).optional(),
  idempotencyKey: z.string().trim().min(8).max(128).optional(),
});

export const cancelReservationSchema = z
  .object({
    reason: z.string().trim().max(500).optional(),
  })
  .default({});

export const checkAvailabilityQuerySchema = z.object({
  branchId: uuidSchema,
  date: z.string().optional(),
  guestCount: z.coerce.number().int().min(1).max(100).optional(),
  areaId: uuidSchema.optional(),
});

export const confirmReservationSchema = z.object({
  areaId: uuidSchema.nullable().optional(),
  tableIds: z.array(uuidSchema).min(1).max(20).optional(),
  note: z.string().trim().max(500).optional(),
});

export const seatReservationSchema = z.object({
  tableIds: z.array(uuidSchema).min(1).max(20).optional(),
});

export type CreateReservationInput = z.infer<typeof createReservationSchema>;
export type ListMyReservationQuery = z.infer<typeof listMyReservationQuerySchema>;
export type CheckAvailabilityQuery = z.infer<typeof checkAvailabilityQuerySchema>;
export type ConfirmReservationInput = z.infer<typeof confirmReservationSchema>;