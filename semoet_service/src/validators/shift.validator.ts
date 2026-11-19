import { z } from 'zod';
import { idrAmountSchema, isoDateTime, uuidSchema } from './common.validator.js';

/** Daftar akun staf yang boleh dipilih saat membuka shift. */
export const listShiftStaffQuerySchema = z.object({});

/** Shift aktif selalu dicek per cabang. */
export const activeShiftQuerySchema = z.object({
  branchId: uuidSchema,
});

export const listShiftQuerySchema = z.object({
  branchId: uuidSchema,
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

/** Jam rencana shift bersifat opsional, tetapi harus diisi berpasangan. */
function refinePlannedRange(
  value: { plannedStartAt?: string; plannedEndAt?: string },
  ctx: z.RefinementCtx,
): void {
  if (!value.plannedStartAt && !value.plannedEndAt) return;

  if (!value.plannedStartAt || !value.plannedEndAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [value.plannedStartAt ? 'plannedEndAt' : 'plannedStartAt'],
      message: 'Jam mulai dan jam selesai rencana harus diisi bersamaan',
    });
    return;
  }

  if (
    new Date(value.plannedEndAt).getTime() <=
    new Date(value.plannedStartAt).getTime()
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['plannedEndAt'],
      message: 'Jam selesai rencana harus setelah jam mulai',
    });
  }
}

export const startShiftSchema = z
  .object({
    branchId: uuidSchema,
    /** Akun terdaftar dengan role `staff`, bukan nama yang diketik manual. */
    staffUserId: uuidSchema,
    openingCashIdr: idrAmountSchema.default(0),
    plannedStartAt: isoDateTime.optional(),
    plannedEndAt: isoDateTime.optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .superRefine(refinePlannedRange);

export const closeShiftSchema = z.object({
  closingCashIdr: idrAmountSchema,
  notes: z.string().trim().max(500).optional(),
});

/** Ubah jam rencana pada shift yang masih terbuka. */
export const updateShiftPlanSchema = z
  .object({
    plannedStartAt: isoDateTime,
    plannedEndAt: isoDateTime,
  })
  .refine(
    (value) =>
      new Date(value.plannedEndAt).getTime() >
      new Date(value.plannedStartAt).getTime(),
    {
      message: 'Jam selesai rencana harus setelah jam mulai',
      path: ['plannedEndAt'],
    },
  );

/** Tutup shift lama lalu buka shift baru dalam satu transaksi. */
export const handoverShiftSchema = z
  .object({
    staffUserId: uuidSchema,
    closingCashIdr: idrAmountSchema,
    openingCashIdr: idrAmountSchema.default(0),
    plannedStartAt: isoDateTime.optional(),
    plannedEndAt: isoDateTime.optional(),
    closingNotes: z.string().trim().max(500).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .superRefine(refinePlannedRange);

export type ActiveShiftQuery = z.infer<typeof activeShiftQuerySchema>;
export type ListShiftQuery = z.infer<typeof listShiftQuerySchema>;
export type StartShiftInput = z.infer<typeof startShiftSchema>;
export type CloseShiftInput = z.infer<typeof closeShiftSchema>;
export type UpdateShiftPlanInput = z.infer<typeof updateShiftPlanSchema>;
export type HandoverShiftInput = z.infer<typeof handoverShiftSchema>;
