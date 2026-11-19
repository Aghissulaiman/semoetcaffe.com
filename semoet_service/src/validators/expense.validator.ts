import { z } from 'zod';
import { EXPENSE_CATEGORIES } from '../config/constants.js';
import { idrAmountSchema, uuidSchema } from './common.validator.js';

/** Tanggal kalender murni tanpa jam, selalu "YYYY-MM-DD". */
const dateKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD')
  .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()), {
    message: 'Tanggal tidak valid',
  });

export const listExpenseQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  category: z.string().trim().max(60).optional(),
  from: dateKeySchema.optional(),
  to: dateKeySchema.optional(),
  q: z.string().trim().max(120).optional(),
});

export const expenseIdParamSchema = z.object({ id: uuidSchema });

export const createExpenseSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES.map((item) => item.code) as [string, ...string[]]),
  name: z.string().trim().min(2, 'Nama pengeluaran minimal 2 karakter').max(150),
  amountIdr: idrAmountSchema.min(1, 'Nominal pengeluaran harus lebih besar dari 0'),
  note: z.string().trim().max(2000).nullable().optional(),
  expenseDate: dateKeySchema.optional(),
});

export const updateExpenseSchema = z
  .object({
    category: z.enum(EXPENSE_CATEGORIES.map((item) => item.code) as [string, ...string[]]).optional(),
    name: z.string().trim().min(2, 'Nama pengeluaran minimal 2 karakter').max(150).optional(),
    amountIdr: idrAmountSchema.min(1, 'Nominal pengeluaran harus lebih besar dari 0').optional(),
    note: z.string().trim().max(2000).nullable().optional(),
    expenseDate: dateKeySchema.optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: 'Tidak ada perubahan yang dikirim',
  });

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type ListExpenseQuery = z.infer<typeof listExpenseQuerySchema>;
