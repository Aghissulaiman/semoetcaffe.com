import { z } from 'zod';
import { DISCOUNT_TYPE, VOUCHER_STATUS } from '../config/constants.js';
import { booleanQuery, dateSchema, uuidSchema } from './common.validator.js';

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