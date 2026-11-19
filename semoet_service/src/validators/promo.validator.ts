import { z } from 'zod';
import { DISCOUNT_TYPE, VOUCHER_STATUS } from '../config/constants.js';
import {
  booleanQuery,
  dateSchema,
  isoDateTime,
  uuidSchema,
} from './common.validator.js';

export const listPromoQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  isActive: booleanQuery.optional(),
  discountType: z.enum(DISCOUNT_TYPE).optional(),
  branchId: uuidSchema.optional(),
  /** Hanya promo yang sedang berjalan. */
  currentlyValid: booleanQuery.default(true),
  q: z.string().trim().max(120).optional(),
});

export const promoCodeParamSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .transform((value) => value.toUpperCase()),
});

export const listVoucherQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(VOUCHER_STATUS).optional(),
});

export const voucherIdParamSchema = z.object({ id: uuidSchema });

export const claimVoucherSchema = z.object({
  /** Promo code yang ingin diklaim; dapat berupa kode campaign bertanda "free". */
  code: z.string().trim().min(3).max(40).transform((value) => value.toUpperCase()),
});

export const validateVoucherSchema = z.object({
  voucherId: uuidSchema.optional(),
  code: z.string().trim().max(40).optional(),
  subtotalIdr: z.coerce.number().int().min(0),
  productIds: z.array(uuidSchema).max(100).default([]),
  branchId: uuidSchema.optional(),
}).refine((value) => Boolean(value.voucherId) || Boolean(value.code), {
  message: 'Wajib mengisi voucherId atau code',
  path: ['voucherId'],
});

export type ListPromoQuery = z.infer<typeof listPromoQuerySchema>;
export type ListVoucherQuery = z.infer<typeof listVoucherQuerySchema>;
export type ClaimVoucherInput = z.infer<typeof claimVoucherSchema>;
export type ValidateVoucherInput = z.infer<typeof validateVoucherSchema>;

// --------------------------------------------------------------------------
// Admin: kelola promo (voucher code & diskon langsung menu)
// --------------------------------------------------------------------------
export const listAdminPromoQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  isActive: booleanQuery.optional(),
  discountType: z.enum(DISCOUNT_TYPE).optional(),
  /** voucher = wajib punya kode; direct = diskon menu otomatis tanpa kode. */
  mode: z.enum(['voucher', 'direct']).optional(),
  q: z.string().trim().max(120).optional(),
});

export const adminPromoIdParamSchema = z.object({ id: uuidSchema });

const adminPromoCodeSchema = z
  .string()
  .trim()
  .min(3, 'Kode promo minimal 3 karakter')
  .max(40, 'Kode promo maksimal 40 karakter')
  .regex(/^[A-Za-z0-9_-]+$/, 'Kode promo hanya boleh huruf, angka, strip, dan garis bawah')
  .transform((value) => value.toUpperCase());

const promoNameField = z.string().trim().min(3, 'Nama promo minimal 3 karakter').max(160);
const promoDescriptionField = z.string().trim().max(1000).nullable();
const promoDiscountTypeField = z.enum(DISCOUNT_TYPE);
const promoDiscountValueField = z.coerce.number().min(0, 'Nilai diskon tidak boleh negatif');
const promoMinimumOrderField = z.coerce.number().int().min(0);
const promoMaximumDiscountField = z.coerce.number().int().min(0).nullable();
const promoQuotaField = z.coerce.number().int().min(0).nullable();
const promoProductIdsField = z.array(uuidSchema).max(200);
const promoCategoryIdsField = z.array(uuidSchema).max(50);

type PromoWriteShape = {
  code?: string | null;
  discountType?: string;
  discountValue?: number;
  startsAt?: string;
  endsAt?: string;
  productIds?: string[];
  categoryIds?: string[];
};

function refinePromoWrite(
  value: PromoWriteShape,
  ctx: z.RefinementCtx,
  options: { requireTargetForUncoded: boolean },
) {
  if (value.startsAt && value.endsAt && new Date(value.endsAt) <= new Date(value.startsAt)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endsAt'],
      message: 'Waktu selesai harus setelah waktu mulai',
    });
  }

  if (value.discountType === 'percentage' && (value.discountValue ?? 0) > 100) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['discountValue'],
      message: 'Diskon persentase maksimal 100%',
    });
  }

  // code null = diskon menu otomatis. Saat create, field yang tidak dikirim
  // juga dianggap diskon menu supaya validasinya jelas.
  const isDirect = value.code === null || (options.requireTargetForUncoded && value.code === undefined);
  if (!isDirect) return;

  if (options.requireTargetForUncoded) {
    if ((value.productIds?.length ?? 0) + (value.categoryIds?.length ?? 0) === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['productIds'],
        message: 'Pilih minimal satu menu atau kategori untuk diskon langsung',
      });
    }
  }
  if (value.discountType === 'free_item') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['discountType'],
      message: 'Diskon menu langsung hanya mendukung persentase atau nominal',
    });
  }
  if ((value as { minimumOrderIdr?: number }).minimumOrderIdr) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['minimumOrderIdr'],
      message: 'Diskon menu langsung tidak memakai minimum belanja',
    });
  }
}

export const createAdminPromoSchema = z
  .object({
    code: adminPromoCodeSchema.nullable().optional(),
    name: promoNameField,
    description: promoDescriptionField.optional(),
    discountType: promoDiscountTypeField,
    discountValue: promoDiscountValueField,
    minimumOrderIdr: promoMinimumOrderField.default(0),
    maximumDiscountIdr: promoMaximumDiscountField.optional(),
    startsAt: isoDateTime,
    endsAt: isoDateTime,
    globalQuota: promoQuotaField.optional(),
    perUserQuota: promoQuotaField.optional(),
    isActive: z.boolean().default(true),
    productIds: promoProductIdsField.default([]),
    categoryIds: promoCategoryIdsField.default([]),
  })
  .superRefine((value, ctx) => refinePromoWrite(value, ctx, { requireTargetForUncoded: true }));

export const updateAdminPromoSchema = z
  .object({
    code: adminPromoCodeSchema.nullable().optional(),
    name: promoNameField.optional(),
    description: promoDescriptionField.optional(),
    discountType: promoDiscountTypeField.optional(),
    discountValue: promoDiscountValueField.optional(),
    minimumOrderIdr: promoMinimumOrderField.optional(),
    maximumDiscountIdr: promoMaximumDiscountField.optional(),
    startsAt: isoDateTime.optional(),
    endsAt: isoDateTime.optional(),
    globalQuota: promoQuotaField.optional(),
    perUserQuota: promoQuotaField.optional(),
    isActive: z.boolean().optional(),
    productIds: promoProductIdsField.optional(),
    categoryIds: promoCategoryIdsField.optional(),
  })
  .superRefine((value, ctx) => refinePromoWrite(value, ctx, { requireTargetForUncoded: false }));

export type ListAdminPromoQuery = z.infer<typeof listAdminPromoQuerySchema>;
export type CreateAdminPromoInput = z.infer<typeof createAdminPromoSchema>;
export type UpdateAdminPromoInput = z.infer<typeof updateAdminPromoSchema>;

// --------------------------------------------------------------------------
// Promo usage report (admin read-only di grup ini)
// --------------------------------------------------------------------------
export const promoUsageQuerySchema = z
  .object({
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    branchId: uuidSchema.optional(),
  })
  .refine((value) => !value.from || !value.to || new Date(value.from) <= new Date(value.to), {
    message: 'Parameter from harus lebih kecil dari to',
    path: ['from'],
  });

export const redemptionQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  promoId: uuidSchema.optional(),
  branchId: uuidSchema.optional(),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
});

export type RedemptionQuery = z.infer<typeof redemptionQuerySchema>;