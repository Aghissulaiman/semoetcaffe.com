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

const cateringLineSchema = z.object({
  cateringPackageId: uuidSchema,
  guestCount: z.coerce.number().int().min(1).max(10_000),
});

const addonLineSchema = z.object({
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

export type CreateEventBookingInput = z.infer<typeof createEventBookingSchema>;
export type ListMyEventBookingQuery = z.infer<typeof listMyEventBookingQuerySchema>;
export type CancelEventBookingInput = z.infer<typeof cancelEventBookingSchema>;
export type UpdateEventBookingStatusInput = z.infer<typeof updateEventBookingStatusSchema>;