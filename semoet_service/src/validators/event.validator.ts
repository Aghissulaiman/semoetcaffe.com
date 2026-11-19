import { z } from 'zod';
import { EVENT_BOOKING_STATUS, EVENT_TYPE } from '../config/constants.js';
import { idrAmountSchema, isoDateTimeInFuture, uuidSchema } from './common.validator.js';

export const listEventPackageQuerySchema = z.object({
  isActive: z.enum(['true', 'false']).optional(),
  minGuests: z.coerce.number().int().positive().optional(),
  maxGuests: z.coerce.number().int().positive().optional(),
});

export const eventPackageCodeParamSchema = z.object({
  code: z.string().trim().min(2).max(60).transform((v) => v.toUpperCase()),
});

export const listCateringPackageQuerySchema = z.object({
  isActive: z.enum(['true', 'false']).optional(),
  minGuests: z.coerce.number().int().positive().optional(),
  maxGuests: z.coerce.number().int().positive().optional(),
});

export const cateringLineSchema = z.object({
  cateringPackageId: uuidSchema,
  guestCount: z.coerce.number().int().min(1).max(10_000),
});

export const addonLineSchema = z.object({
  name: z.string().trim().min(2).max(150),
  quantity: z.coerce.number().int().min(1).max(1000).default(1),
  unitPriceIdr: idrAmountSchema.default(0),
});

export const createEventBookingSchema = z
  .object({
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
    /** Langsung buat transaksi deposit bila transfer manual tidak dipakai. */
    autoCreateDeposit: z.boolean().default(false),
  })
  .refine((value) => !value.endsAt || new Date(value.endsAt) > new Date(value.startsAt), {
    message: 'endsAt harus setelah startsAt',
    path: ['endsAt'],
  });

export const listMyEventBookingQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(EVENT_BOOKING_STATUS).optional(),
});

export const eventBookingIdParamSchema = z.object({ id: uuidSchema });

export const cancelEventBookingSchema = z
  .object({
    reason: z.string().trim().min(3).max(500),
    requestRefund: z.boolean().default(true),
  })
  .default({ reason: 'Dibatalkan oleh customer', requestRefund: true });

export const updateEventBookingStatusSchema = z.object({
  status: z.enum(EVENT_BOOKING_STATUS),
  note: z.string().trim().max(500).optional(),
});

export const eventAvailabilityQuerySchema = z.object({
  branchId: uuidSchema.optional(),
  date: z.string().optional(),
});

// --------------------------------------------------------------------------
// Agenda event (Ramadan, Lebaran, promo musiman, dsb)
// --------------------------------------------------------------------------

/** Tanggal kalender murni tanpa jam, selalu "YYYY-MM-DD". */
const dateKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD')
  .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()), {
    message: 'Tanggal tidak valid',
  });

export const eventAgendaIdParamSchema = z.object({ id: uuidSchema });

export const listEventAgendaQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    isActive: z.enum(['true', 'false']).optional(),
    /** Hanya agenda yang beririsan dengan rentang tanggal ini. */
    from: dateKeySchema.optional(),
    to: dateKeySchema.optional(),
    q: z.string().trim().max(120).optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: 'Parameter from harus lebih kecil atau sama dengan to',
    path: ['from'],
  });

export const createEventAgendaSchema = z
  .object({
    title: z.string().trim().min(2, 'Judul event minimal 2 karakter').max(150),
    description: z.string().trim().max(2000).nullable().optional(),
    startsOn: dateKeySchema,
    endsOn: dateKeySchema.optional(),
    isActive: z.boolean().default(true),
  })
  .refine((value) => !value.endsOn || value.endsOn >= value.startsOn, {
    message: 'Tanggal selesai tidak boleh sebelum tanggal mulai',
    path: ['endsOn'],
  });

export const updateEventAgendaSchema = z
  .object({
    title: z.string().trim().min(2, 'Judul event minimal 2 karakter').max(150).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    startsOn: dateKeySchema.optional(),
    endsOn: dateKeySchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: 'Tidak ada perubahan yang dikirim',
  });

export type CreateEventAgendaInput = z.infer<typeof createEventAgendaSchema>;
export type UpdateEventAgendaInput = z.infer<typeof updateEventAgendaSchema>;
export type ListEventAgendaQuery = z.infer<typeof listEventAgendaQuerySchema>;

export type CreateEventBookingInput = z.infer<typeof createEventBookingSchema>;
export type ListMyEventBookingQuery = z.infer<typeof listMyEventBookingQuerySchema>;
export type CancelEventBookingInput = z.infer<typeof cancelEventBookingSchema>;
export type UpdateEventBookingStatusInput = z.infer<typeof updateEventBookingStatusSchema>;