import { Router } from 'express';
import { z } from 'zod';
import * as eventController from '../controllers/event.controller.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { authenticate } from '../middlewares/authenticate.js';
import { idempotency } from '../middlewares/idempotency.js';
import { readLimiter, writeLimiter } from '../middlewares/rateLimit.js';
import { validate } from '../middlewares/validate.js';
import { dateSchema, paginationQuery } from '../validators/common.validator.js';
import {
  cancelEventBookingSchema,
  createEventBookingSchema,
  eventAvailabilityQuerySchema,
  eventBookingIdParamSchema,
  eventPackageCodeParamSchema,
  listCateringPackageQuerySchema,
  listEventAgendaQuerySchema,
  listEventPackageQuerySchema,
  listMyEventBookingQuerySchema,
} from '../validators/event.validator.js';

export const eventRouter = Router();

/**
 * Katalog paket event dan paket katering bersifat publik dan sering diakses
 * dari landing page, jadi kedua daftarnya memakai paginasi standar.
 */
const listEventPackagesQuerySchema = listEventPackageQuerySchema.merge(paginationQuery);
const listCateringPackagesQuerySchema = listCateringPackageQuerySchema.merge(paginationQuery);

/**
 * Schema ketersediaan bawaan baru memuat branchId dan date. Endpoint ini
 * menerima from, to, dan guestCount sesuai OpenAPI, jadi ketiga field tersebut
 * ditambahkan lewat extend tanpa mengubah file validator bersama.
 */
const availabilityQuerySchema = eventAvailabilityQuerySchema.extend({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  guestCount: z.coerce.number().int().positive().max(10_000).optional(),
});

// GET /event-packages - katalog paket event publik
eventRouter.get(
  '/event-packages',
  readLimiter,
  validate({ query: listEventPackagesQuerySchema }),
  asyncHandler(eventController.listEventPackages),
);

// GET /event-packages/:code - detail paket event publik
eventRouter.get(
  '/event-packages/:code',
  readLimiter,
  validate({ params: eventPackageCodeParamSchema }),
  asyncHandler(eventController.getEventPackage),
);

// GET /catering-packages - katalog paket katering publik
eventRouter.get(
  '/catering-packages',
  readLimiter,
  validate({ query: listCateringPackagesQuerySchema }),
  asyncHandler(eventController.listCateringPackages),
);

// GET /catering-packages/:code - detail paket katering publik
eventRouter.get(
  '/catering-packages/:code',
  readLimiter,
  validate({ params: eventPackageCodeParamSchema }),
  asyncHandler(eventController.getCateringPackage),
);

// GET /event-availability - cek tanggal yang masih bisa dibooking (publik)
eventRouter.get(
  '/event-availability',
  readLimiter,
  validate({ query: availabilityQuerySchema }),
  asyncHandler(eventController.checkAvailability),
);

// GET /event-agenda - agenda event publik (Ramadan, Lebaran, promo musiman)
eventRouter.get(
  '/event-agenda',
  readLimiter,
  validate({ query: listEventAgendaQuerySchema }),
  asyncHandler(eventController.listAgenda),
);

// POST /event-bookings - ajukan booking event
eventRouter.post(
  '/event-bookings',
  authenticate,
  writeLimiter,
  idempotency(),
  validate({ body: createEventBookingSchema }),
  asyncHandler(eventController.createBooking),
);

// GET /me/event-bookings - daftar booking milik pengguna yang login
eventRouter.get(
  '/me/event-bookings',
  authenticate,
  validate({ query: listMyEventBookingQuerySchema }),
  asyncHandler(eventController.listMineBookings),
);

// POST /event-bookings/:id/cancel - batalkan booking (harus didaftarkan
// sebelum /event-bookings/:id agar tidak tertangkap sebagai path detail)
eventRouter.post(
  '/event-bookings/:id/cancel',
  authenticate,
  writeLimiter,
  validate({ params: eventBookingIdParamSchema, body: cancelEventBookingSchema }),
  asyncHandler(eventController.cancel),
);

// GET /event-bookings/:id - detail booking, pemilik atau staff
eventRouter.get(
  '/event-bookings/:id',
  authenticate,
  validate({ params: eventBookingIdParamSchema }),
  asyncHandler(eventController.detail),
);