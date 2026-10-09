import { Router } from 'express';
import * as reservationController from '../controllers/reservation.controller.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { authenticate } from '../middlewares/authenticate.js';
import { readLimiter, writeLimiter } from '../middlewares/rateLimit.js';
import { validate } from '../middlewares/validate.js';
import {
  cancelReservationSchema,
  checkAvailabilityQuerySchema,
  createReservationSchema,
  listMyReservationQuerySchema,
  reservationIdParamSchema,
} from '../validators/reservation.validator.js';

export const reservationRouter = Router();

// POST /reservations - buat reservasi baru
reservationRouter.post(
  '/reservations',
  authenticate,
  writeLimiter,
  validate({ body: createReservationSchema }),
  asyncHandler(reservationController.create),
);

// GET /me/reservations - daftar reservasi milik user yang sedang login
reservationRouter.get(
  '/me/reservations',
  authenticate,
  readLimiter,
  validate({ query: listMyReservationQuerySchema }),
  asyncHandler(reservationController.listMine),
);

// GET /reservations/availability - cek ketersediaan meja, publik tanpa login.
// Wajib didaftarkan sebelum /reservations/:id supaya "availability" tidak
// tertangkap sebagai id.
reservationRouter.get(
  '/reservations/availability',
  readLimiter,
  validate({ query: checkAvailabilityQuerySchema }),
  asyncHandler(reservationController.checkAvailability),
);

// GET /reservations/:id - detail reservasi, pemilik atau staff
reservationRouter.get(
  '/reservations/:id',
  authenticate,
  validate({ params: reservationIdParamSchema }),
  asyncHandler(reservationController.detail),
);

// POST /reservations/:id/cancel - batalkan reservasi milik sendiri
reservationRouter.post(
  '/reservations/:id/cancel',
  authenticate,
  writeLimiter,
  validate({ params: reservationIdParamSchema, body: cancelReservationSchema }),
  asyncHandler(reservationController.cancel),
);