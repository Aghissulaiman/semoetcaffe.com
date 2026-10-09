import { z } from 'zod';
import { DEFAULT_LIMIT, DEFAULT_PAGE, MAX_LIMIT } from '../utils/pagination.js';

export const uuidSchema = z.string().uuid('Format UUID tidak valid');

export const uuidParamSchema = z.object({ id: uuidSchema });

export const slugParamSchema = z.object({ slug: z.string().min(1).max(180) });

export const idParamSchema = z.object({ id: uuidSchema });

/** Tanggal-waktu ISO8601 yang toleran (server tetap mem-parsing ke timestamptz). */
export const isoDateTime = z
  .string()
  .min(1)
  .refine((value) => !Number.isNaN(new Date(value).getTime()), {
    message: 'Format tanggal waktu harus ISO8601 (contoh: 2026-01-05T14:30:00+07:00)',
  });

export const isoDateTimeNullable = isoDateTime.nullable();

export const dateSchema = z
  .string()
  .refine((value) => !Number.isNaN(new Date(value).getTime()), { message: 'Format tanggal tidak valid' });

export const isoDateTimeInFuture = isoDateTime.refine(
  (value) => new Date(value).getTime() > Date.now(),
  { message: 'Waktu harus berada di masa depan' },
);

export const emailSchema = z.string().email('Format email tidak valid').max(255);

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9]{8,15}$/, 'Nomor telepon harus 8-15 digit, boleh diawali +');

export const passwordSchema = z
  .string()
  .min(8, 'Minimal 8 karakter')
  .max(128)
  .regex(/[a-z]/, 'Harus mengandung huruf kecil')
  .regex(/[A-Z]/, 'Harus mengandung huruf besar')
  .regex(/\d/, 'Harus mengandung angka');

export const otpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{4,10}$/, 'Kode OTP harus berupa angka');

export const idrAmountSchema = z.coerce
  .number()
  .int('Nominal harus bilangan bulat')
  .min(0, 'Nominal tidak boleh negatif')
  .max(9_999_999_999_999, 'Nominal terlalu besar');

export const shortText = (max = 255) => z.string().trim().min(1).max(max);
export const optionalShortText = (max = 255) => z.string().trim().max(max).optional();
export const longText = (max = 5000) => z.string().trim().max(max).nullable();

export const jsonObjectSchema = z.record(z.string(), z.unknown());
export const jsonValueSchema = z.unknown();

/** Pagination standar untuk semua endpoint list. */
export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(DEFAULT_PAGE),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
});

export const idQuerySchema = z.object({ id: uuidSchema });

/** Filter tanggal untuk endpoint dashboard/admin. */
export const dateRangeQuery = z
  .object({
    from: dateSchema.optional(),
    to: dateSchema.optional(),
  })
  .refine((value) => !value.from || !value.to || new Date(value.from) <= new Date(value.to), {
    message: 'Parameter from harus lebih kecil dari to',
    path: ['from'],
  });

export const booleanQuery = z
  .union([z.boolean(), z.string()])
  .transform((value) => {
    if (typeof value === 'boolean') return value;
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  });

export type PaginationQueryInput = z.infer<typeof paginationQuery>;