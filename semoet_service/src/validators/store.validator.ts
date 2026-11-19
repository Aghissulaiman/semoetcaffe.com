import { z } from 'zod';
import { uuidSchema } from './common.validator.js';

/** Jam lokal 24 jam, contoh "09:00" atau "21:30". */
const clockTimeSchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format jam harus HH:MM (contoh 09:00)');

export const storeQuerySchema = z.object({
  branchId: uuidSchema,
});

/** Status toko publik untuk web pelanggan; branchId opsional (pakai cabang pertama). */
export const publicStoreQuerySchema = z.object({
  branchId: uuidSchema.optional(),
});

export const updateStoreStatusSchema = z.object({
  branchId: uuidSchema,
  mode: z.enum(['auto', 'open', 'closed']),
});

export const updateStoreScheduleSchema = z
  .object({
    branchId: uuidSchema,
    opensAt: clockTimeSchema,
    closesAt: clockTimeSchema,
  })
  .refine((value) => value.opensAt !== value.closesAt, {
    message: 'Jam buka dan jam tutup tidak boleh sama',
    path: ['closesAt'],
  });

export type StoreQuery = z.infer<typeof storeQuerySchema>;
export type PublicStoreQuery = z.infer<typeof publicStoreQuerySchema>;
export type UpdateStoreStatusInput = z.infer<typeof updateStoreStatusSchema>;
export type UpdateStoreScheduleInput = z.infer<typeof updateStoreScheduleSchema>;
