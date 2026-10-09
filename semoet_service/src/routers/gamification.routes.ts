import { Router } from 'express';
import * as gamificationController from '../controllers/gamification.controller.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { authenticate, optionalAuthenticate } from '../middlewares/authenticate.js';
import { idempotency } from '../middlewares/idempotency.js';
import { readLimiter, writeLimiter } from '../middlewares/rateLimit.js';
import { validate } from '../middlewares/validate.js';
import {
  activityCodeParamSchema,
  listActivityQuerySchema,
  listPlayHistoryQuerySchema,
  playActivitySchema,
} from '../validators/gamification.validator.js';

export const gamificationRouter = Router();

// GET /gamification/activities (publik: daftar aktivitas yang sedang aktif)
gamificationRouter.get(
  '/gamification/activities',
  readLimiter,
  validate({ query: listActivityQuerySchema }),
  asyncHandler(gamificationController.listActivities),
);

// GET /gamification/activities/:code (publik: detail aktivitas, kode dinormalisasi)
gamificationRouter.get(
  '/gamification/activities/:code',
  optionalAuthenticate,
  readLimiter,
  validate({ params: activityCodeParamSchema }),
  asyncHandler(gamificationController.activityDetail),
);

// POST /gamification/play (main aktivitas; Idempotency-Key mencegah tap ganda)
gamificationRouter.post(
  '/gamification/play',
  authenticate,
  writeLimiter,
  idempotency(),
  validate({ body: playActivitySchema }),
  asyncHandler(gamificationController.play),
);

// GET /me/gamification/history (riwayat main milik user yang login)
gamificationRouter.get(
  '/me/gamification/history',
  authenticate,
  readLimiter,
  validate({ query: listPlayHistoryQuerySchema }),
  asyncHandler(gamificationController.history),
);
