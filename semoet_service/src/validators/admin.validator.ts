import { z } from 'zod';
import {
  AREA_TYPE,
  EVENT_BOOKING_STATUS,
  EVENT_TYPE,
  ORDER_STATUS,
  PRODUCT_KIND,
} from '../config/constants.js';
import { dateSchema, isoDateTimeInFuture, uuidSchema } from './common.validator.js';
import { addonLineSchema, cateringLineSchema } from './event.validator.js';

// --------------------------------------------------------------------------
// Dashboard
// --------------------------------------------------------------------------
export const salesDashboardQuerySchema = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  branchId: uuidSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(365).default(30),
});

export const salesSummaryQuerySchema = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  branchId: uuidSchema.optional(),
});

export const topProductQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  branchId: uuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

// --------------------------------------------------------------------------
// Laporan penjualan
// --------------------------------------------------------------------------
export const reportSalesQuerySchema = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  branchId: uuidSchema.optional(),
});

export const reportProductQuerySchema = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  branchId: uuidSchema.optional(),
  q: z.string().trim().max(120).optional(),
  sort: z.enum(['revenue_desc', 'profit_desc', 'qty_desc', 'name_asc']).default('revenue_desc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// --------------------------------------------------------------------------
// Antrean pesanan kasir (staff/admin)
// --------------------------------------------------------------------------
export const listAdminOrderQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  orderStatus: z.enum(ORDER_STATUS).optional(),
  paymentStatus: z
    .enum(['unpaid', 'pending', 'paid', 'partially_refunded', 'refunded', 'failed'])
    .optional(),
  branchId: uuidSchema.optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  q: z.string().trim().max(120).optional(),
  sort: z.enum(['recent', 'oldest', 'total_desc']).default('recent'),
});

/** Pembayaran manual yang dicatat kasir (tunai/QRIS/kartu/transfer). */
export const recordManualPaymentSchema = z.object({
  paymentMethod: z.enum(['cash', 'qris', 'card', 'bank_transfer']),
  amountReceivedIdr: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
  note: z.string().trim().max(500).optional(),
});

// --------------------------------------------------------------------------
// Harga modal (HPP) varian produk
// --------------------------------------------------------------------------
export const updateVariantCostsSchema = z.object({
  items: z
    .array(
      z.object({
        variantId: uuidSchema,
        costIdr: z.coerce.number().int().min(0).max(1_000_000_000),
      }),
    )
    .min(1, 'Minimal satu varian')
    .max(50),
});

// --------------------------------------------------------------------------
// Audit log
// --------------------------------------------------------------------------
export const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  actorUserId: uuidSchema.optional(),
  action: z.string().trim().max(80).optional(),
  entityType: z.string().trim().max(80).optional(),
  entityId: uuidSchema.optional(),
  requestId: z.string().trim().max(100).optional(),
  q: z.string().trim().max(120).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

// --------------------------------------------------------------------------
// Role & permission
// --------------------------------------------------------------------------
export const listRoleQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  code: z.string().trim().max(60).optional(),
});

export const createRoleSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9_]+$/, 'Code hanya boleh lowercase, angka, underscore'),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  permissionKeys: z
    .array(
      z.string().regex(/^[a-z_]+:[a-z_]+$/, 'Format permission harus resource:action'),
    )
    .max(200)
    .default([]),
});

export const updateRoleSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  permissionKeys: z.array(z.string().regex(/^[a-z_]+:[a-z_]+$/)).max(200).optional(),
});

export const listPermissionQuerySchema = z.object({
  resource: z.string().trim().max(60).optional(),
  action: z.string().trim().max(60).optional(),
});

export const assignRoleSchema = z.object({
  roleIds: z.array(uuidSchema).min(1, 'Minimal satu role').max(10),
  /** Ganti seluruh role user bila true, selain itu tambahkan. */
  replace: z.boolean().default(false),
});

export const userIdParamSchema = z.object({ id: uuidSchema });

export const listAdminUserQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  status: z.enum(['active', 'pending', 'suspended', 'deleted']).optional(),
  roleCode: z.string().trim().max(60).optional(),
  q: z.string().trim().max(120).optional(),
  /** Sertakan anggota yang dihapus (soft delete) agar bisa dipulihkan. */
  includeDeleted: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .transform((value) => value === true || value === 'true' || value === '1')
    .optional(),
});

export const updateUserStatusSchema = z.object({
  status: z.enum(['active', 'pending', 'suspended', 'deleted']),
  reason: z.string().trim().max(500).optional(),
});

// --------------------------------------------------------------------------
// CRUD user (anggota)
// --------------------------------------------------------------------------
export const createUserSchema = z
  .object({
    email: z.string().trim().email('Email tidak valid').max(160).nullish(),
    phoneE164: z.string().trim().min(8, 'Nomor telepon minimal 8 digit').max(20).nullish(),
    displayName: z.string().trim().min(2, 'Nama minimal 2 karakter').max(120),
    password: z.string().min(8, 'Password minimal 8 karakter').max(128),
    status: z.enum(['active', 'pending', 'suspended']).default('active'),
    roleIds: z.array(uuidSchema).max(10).default([]),
  })
  .refine((value) => Boolean(value.email || value.phoneE164), {
    message: 'Email atau nomor telepon wajib diisi',
    path: ['email'],
  });

export const updateUserSchema = z
  .object({
    displayName: z.string().trim().min(2, 'Nama minimal 2 karakter').max(120).optional(),
    email: z.string().trim().email('Email tidak valid').max(160).nullish(),
    phoneE164: z.string().trim().min(8, 'Nomor telepon minimal 8 digit').max(20).nullish(),
  })
  .refine(
    (value) =>
      value.displayName !== undefined ||
      value.email !== undefined ||
      value.phoneE164 !== undefined,
    { message: 'Tidak ada perubahan yang dikirim', path: ['displayName'] },
  );

// --------------------------------------------------------------------------
// CRUD produk & varian
// --------------------------------------------------------------------------
export const productVariantInputSchema = z.object({
  name: z.string().trim().min(1).max(80).default('Regular'),
  sku: z.string().trim().max(60).nullish(),
  priceIdr: z.coerce.number().int().min(0).max(1_000_000_000),
  costIdr: z.coerce.number().int().min(0).max(1_000_000_000).default(0),
  compareAtPriceIdr: z.coerce.number().int().min(0).max(1_000_000_000).nullish(),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

// --------------------------------------------------------------------------
// Unggah gambar (Supabase Storage)
// --------------------------------------------------------------------------
export const uploadImageSchema = z.object({
  /** Isi berkas: base64 murni atau data URL (`data:image/png;base64,...`). */
  data: z.string().min(1, 'Berkas gambar wajib diisi'),
  contentType: z.string().trim().max(100).optional(),
  folder: z.string().trim().max(60).optional(),
});

/** Field gambar opsional yang disematkan saat membuat/mengubah produk. */
const productImageFields = {
  imageStorageKey: z.string().trim().max(500).nullish(),
  imagePublicUrl: z.string().trim().max(1000).nullish(),
  imageAltText: z.string().trim().max(200).nullish(),
};

// --------------------------------------------------------------------------
// Kategori menu (admin)
// --------------------------------------------------------------------------
const categorySlugField = z
  .string()
  .trim()
  .max(160)
  .regex(/^[a-z0-9-]+$/, 'Slug hanya boleh huruf kecil, angka, dan tanda minus');

export const createCategorySchema = z.object({
  name: z.string().trim().min(2, 'Nama kategori minimal 2 karakter').max(120),
  slug: categorySlugField.optional(),
  parentId: uuidSchema.nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  isActive: z.boolean().default(true),
});

export const updateCategorySchema = z
  .object({
    name: z.string().trim().min(2, 'Nama kategori minimal 2 karakter').max(120).optional(),
    slug: categorySlugField.optional(),
    parentId: uuidSchema.nullable().optional(),
    sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Tidak ada perubahan yang dikirim',
    path: ['name'],
  });

export const categoryIdParamSchema = z.object({ id: uuidSchema });

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const createProductSchema = z.object({
  name: z.string().trim().min(2, 'Nama produk minimal 2 karakter').max(160),
  slug: z
    .string()
    .trim()
    .max(160)
    .regex(/^[a-z0-9-]*$/, 'Slug hanya boleh huruf kecil, angka, dan tanda minus')
    .optional(),
  categoryId: uuidSchema,
  productKind: z.enum(PRODUCT_KIND).default('standard'),
  descriptionShort: z.string().trim().max(2000).nullish(),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  variants: z.array(productVariantInputSchema).min(1, 'Minimal satu varian').max(20),
  ...productImageFields,
});

export const updateProductSchema = z
  .object({
    name: z.string().trim().min(2, 'Nama produk minimal 2 karakter').max(160).optional(),
    slug: z
      .string()
      .trim()
      .max(160)
      .regex(/^[a-z0-9-]*$/, 'Slug hanya boleh huruf kecil, angka, dan tanda minus')
      .optional(),
    categoryId: uuidSchema.optional(),
    productKind: z.enum(PRODUCT_KIND).optional(),
    descriptionShort: z.string().trim().max(2000).nullish(),
    isActive: z.boolean().optional(),
    isFeatured: z.boolean().optional(),
    ...productImageFields,
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Tidak ada perubahan yang dikirim',
    path: ['name'],
  });

export const updateVariantSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    sku: z.string().trim().max(60).nullish(),
    priceIdr: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
    costIdr: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
    compareAtPriceIdr: z.coerce.number().int().min(0).max(1_000_000_000).nullish(),
    isDefault: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Tidak ada perubahan yang dikirim',
    path: ['name'],
  });

// --------------------------------------------------------------------------
// Reservasi (Admin)
// --------------------------------------------------------------------------
export const listAdminReservationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  branchId: uuidSchema.optional(),
  status: z.enum(['requested', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show']).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  q: z.string().trim().max(120).optional(),
});

export const updateReservationStatusSchema = z.object({
  status: z.enum(['requested', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show']).optional(),
  note: z.string().trim().max(500).optional(),
  roomIds: z.array(uuidSchema).max(10).optional(),
  tableIds: z.array(uuidSchema).max(20).optional(),
  /** DP1 (uang muka awal) — status & bukti saja; nominal dihitung sistem. */
  depositStatus: z.enum(['unpaid', 'pending', 'paid', 'refunded']).optional(),
  depositProofUrl: z.string().trim().max(1000).nullish(),
  depositProofStorageKey: z.string().trim().max(500).nullish(),
  depositNote: z.string().trim().max(500).nullish(),
  /** DP2 (setelah reservasi dikonfirmasi) — nominal dihitung sistem. */
  deposit2Status: z.enum(['unpaid', 'pending', 'paid', 'refunded']).optional(),
  deposit2ProofUrl: z.string().trim().max(1000).nullish(),
  deposit2ProofStorageKey: z.string().trim().max(500).nullish(),
  deposit2Note: z.string().trim().max(500).nullish(),
  /** Pelunasan (tahap akhir) — nominal dihitung sistem. */
  settlementStatus: z.enum(['unpaid', 'pending', 'paid', 'refunded']).optional(),
  settlementProofUrl: z.string().trim().max(1000).nullish(),
  settlementProofStorageKey: z.string().trim().max(500).nullish(),
  settlementNote: z.string().trim().max(500).nullish(),
});

/** Buat link pembayaran DP lewat Midtrans (dipakai CS). Nominal dihitung sistem. */
export const createReservationDepositChargeSchema = z.object({
  /** Tahap yang dibayar: DP1, DP2 setelah konfirmasi, atau pelunasan. */
  stage: z.enum(['deposit', 'deposit2', 'settlement']).default('deposit'),
  paymentMethod: z.enum(['qris', 'virtual_account', 'bank_transfer', 'ewallet', 'card']).optional(),
  idempotencyKey: z.string().trim().min(8).max(128).optional(),
});

/**
 * Tambah reservasi atas nama pelanggan (dibuat staf, mis. booking via telepon).
 * Berbeda dari endpoint customer, di sini staf memilih pelanggan dan boleh
 * langsung menetapkan status, serta tidak wajib ada meja tersedia.
 */
export const createAdminReservationSchema = z.object({
  /** Opsional: bila kosong, reservasi dimiliki staf yang membuatnya. */
  userId: uuidSchema.optional(),
  branchId: uuidSchema,
  areaId: uuidSchema.nullable().optional(),
  reservedFor: z.string().trim().min(1, 'Waktu reservasi wajib diisi'),
  durationMinutes: z.coerce.number().int().min(15).max(720).default(120),
  guestCount: z.coerce.number().int().min(1).max(1000),
  seatingPreference: z.enum(['indoor', 'outdoor', 'private_room', 'any']).nullable().optional(),
  status: z.enum(['requested', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show']).default('confirmed'),
  specialRequests: z.string().trim().max(1000).nullable().optional(),
  /** Kontak tamu untuk reservasi walk-in/telepon. */
  contactName: z.string().trim().max(120).nullable().optional(),
  contactPhone: z.string().trim().max(30).nullable().optional(),
  tableIds: z.array(uuidSchema).max(20).default([]),
});

export const reservationIdParamSchema = z.object({ id: uuidSchema });

// Ketentuan DP reservasi: DP1 (persen + batas nominal), DP2 (persen dari sisa).
export const updateDepositSettingsSchema = z
  .object({
    dp1Percent: z.number().min(0).max(100),
    dp1MinIdr: z.number().int().min(0).max(1_000_000_000),
    dp1MaxIdr: z.number().int().min(0).max(1_000_000_000),
    dp2Percent: z.number().min(0).max(100),
  })
  .refine((value) => value.dp1MinIdr <= value.dp1MaxIdr, {
    message: 'Batas minimum DP1 tidak boleh lebih besar dari batas maksimum',
    path: ['dp1MinIdr'],
  });

// --------------------------------------------------------------------------
// Booking Event (Admin)
// --------------------------------------------------------------------------
export const listAdminEventBookingQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  branchId: uuidSchema.optional(),
  status: z.enum(['requested', 'quoted', 'awaiting_deposit', 'confirmed', 'in_progress', 'completed', 'cancelled']).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  q: z.string().trim().max(120).optional(),
});

export const updateEventBookingStatusSchema = z.object({
  status: z.enum(['requested', 'quoted', 'awaiting_deposit', 'confirmed', 'in_progress', 'completed', 'cancelled']),
  note: z.string().trim().max(500).optional(),
  quoteIdr: z.coerce.number().int().min(0).optional(),
  depositPercent: z.coerce.number().min(0).max(100).optional(),
});

export const eventBookingIdParamSchema = z.object({ id: uuidSchema });

/**
 * Tambah booking event atas nama pelanggan (dibuat staf). Sama seperti endpoint
 * customer, namun staf memilih pelanggan dan boleh langsung menetapkan status.
 */
export const createAdminEventBookingSchema = z
  .object({
    userId: uuidSchema,
    branchId: uuidSchema,
    eventPackageId: uuidSchema.nullable().optional(),
    eventType: z.enum(EVENT_TYPE),
    eventName: z.string().trim().max(150).nullable().optional(),
    startsAt: isoDateTimeInFuture,
    endsAt: z.string().optional(),
    guestCount: z.coerce.number().int().min(1).max(10_000),
    customRequests: z.string().trim().max(2000).nullable().optional(),
    catering: z.array(cateringLineSchema).max(20).default([]),
    addons: z.array(addonLineSchema).max(30).default([]),
    depositPercent: z.coerce.number().min(0).max(100).default(30),
    status: z.enum(EVENT_BOOKING_STATUS).optional(),
  })
  .refine((value) => !value.endsAt || new Date(value.endsAt) > new Date(value.startsAt), {
    message: 'endsAt harus setelah startsAt',
    path: ['endsAt'],
  });

// --------------------------------------------------------------------------
// Chat (Admin)
// --------------------------------------------------------------------------
export const listAdminChatConversationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  status: z.enum(['open', 'waiting', 'resolved', 'closed']).optional(),
  category: z.enum(['general', 'complaint']).optional(),
  assignedStaffId: uuidSchema.optional(),
  q: z.string().trim().max(120).optional(),
});

export const conversationIdParamSchema = z.object({ id: uuidSchema });

// --------------------------------------------------------------------------
// Moment Moderation (Admin)
// --------------------------------------------------------------------------
export const listAdminMomentQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  moderationStatus: z.enum(['pending', 'approved', 'rejected', 'hidden']).optional(),
  q: z.string().trim().max(120).optional(),
});

export const momentIdParamSchema = z.object({ id: uuidSchema });

export const moderateMomentSchema = z.object({
  id: uuidSchema.optional(),
  momentId: uuidSchema.optional(),
  moderationStatus: z.enum(['pending', 'approved', 'rejected', 'hidden']),
  note: z.string().trim().max(500).optional(),
});

export const productIdParamSchema = z.object({ id: uuidSchema });
export const productVariantParamSchema = z.object({ id: uuidSchema, variantId: uuidSchema });

/** Daftar produk di tempat sampah (soft delete) + pencarian. */
export const listDeletedProductQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(120).optional(),
});

// --------------------------------------------------------------------------
// CRUD area tempat duduk & meja (dipakai halaman Cabang > Area & Meja)
// --------------------------------------------------------------------------
export const createAreaSchema = z.object({
  name: z.string().trim().min(1, 'Nama area wajib diisi').max(80),
  areaType: z.enum(AREA_TYPE),
  /** Harga sewa ruangan per jam (Rp). Dasar perhitungan DP & pelunasan. */
  pricePerHourIdr: z.coerce.number().int().min(0).nullish(),
  imageUrl: z.string().trim().max(1000).nullish(),
  imageStorageKey: z.string().trim().max(500).nullish(),
  isActive: z.boolean().optional(),
});

export const updateAreaSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    areaType: z.enum(AREA_TYPE).optional(),
    pricePerHourIdr: z.coerce.number().int().min(0).nullish(),
    imageUrl: z.string().trim().max(1000).nullish(),
    imageStorageKey: z.string().trim().max(500).nullish(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Tidak ada perubahan yang dikirim',
  });

export const areaIdParamSchema = z.object({ areaId: uuidSchema });

export const createTableSchema = z.object({
  areaId: uuidSchema,
  tableCode: z.string().trim().min(1, 'Kode meja wajib diisi').max(40),
  capacity: z.coerce.number().int().min(1).max(100),
  isActive: z.boolean().optional(),
});

export const updateTableSchema = z
  .object({
    tableCode: z.string().trim().min(1).max(40).optional(),
    capacity: z.coerce.number().int().min(1).max(100).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Tidak ada perubahan yang dikirim',
  });

export const tableIdParamSchema = z.object({ tableId: uuidSchema });

export type CreateAreaInput = z.infer<typeof createAreaSchema>;
export type UpdateAreaInput = z.infer<typeof updateAreaSchema>;
export type CreateTableInput = z.infer<typeof createTableSchema>;
export type UpdateTableInput = z.infer<typeof updateTableSchema>;

export type SalesDashboardQuery = z.infer<typeof salesDashboardQuerySchema>;
export type ListAdminOrderQuery = z.infer<typeof listAdminOrderQuerySchema>;
export type RecordManualPaymentInput = z.infer<typeof recordManualPaymentSchema>;
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type AssignRoleInput = z.infer<typeof assignRoleSchema>;
export type ListAdminUserQuery = z.infer<typeof listAdminUserQuerySchema>;
export type ListAdminReservationQuery = z.infer<typeof listAdminReservationQuerySchema>;
export type UpdateReservationStatusInput = z.infer<typeof updateReservationStatusSchema>;
export type UpdateDepositSettingsInput = z.infer<typeof updateDepositSettingsSchema>;
export type CreateAdminReservationInput = z.infer<typeof createAdminReservationSchema>;
export type ListAdminEventBookingQuery = z.infer<typeof listAdminEventBookingQuerySchema>;
export type UpdateEventBookingStatusInput = z.infer<typeof updateEventBookingStatusSchema>;
export type CreateAdminEventBookingInput = z.infer<typeof createAdminEventBookingSchema>;
export type ListAdminChatConversationQuery = z.infer<typeof listAdminChatConversationQuerySchema>;
export type ListAdminMomentQuery = z.infer<typeof listAdminMomentQuerySchema>;
export type ModerateMomentInput = z.infer<typeof moderateMomentSchema>;
export type ListDeletedProductQuery = z.infer<typeof listDeletedProductQuerySchema>;