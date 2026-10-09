import { z } from 'zod';
import { RESERVATION_STATUS, SEATING_PREFERENCE } from '../config/constants.js';
import { booleanQuery, isoDateTimeInFuture, uuidSchema } from './common.validator.js';

export const createReservationSchema = z
  .object({
    branchId: uuidSchema,
    areaId: uuidSchema.nullable().optional(),
    reservedFor: isoDateTimeInFuture,
    durationMinutes: z.coerce.number().int().min(15).max(720).default(120),
    guestCount: z.coerce.number().int().min(1).max(100),
    seatingPreference: z.enum(SEATING_PREFERENCE).nullable().optional(),
    specialRequests: z.string().trim().max(1000).nullable().optional(),
    /** Customer boleh memilih area; jika kosong service memilihkan meja yang tersedia. */
    preferredTableIds: z.array(uuidSchema).max(20).default([]),
  })
  .refine(
    (value) => new Date(value.reservedFor).getTime() + value.durationMinutes * 60_000 > Date.now(),
    { message: 'Durasi reservasi tidak valid', path: ['durationMinutes'] },
  );

export const listMyReservationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(RESERVATION_STATUS).optional(),
  upcomingOnly: booleanQuery.optional(),
});

export const reservationIdParamSchema = z.object({ id: uuidSchema });

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