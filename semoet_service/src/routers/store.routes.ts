import { Router } from 'express';
import * as storeController from '../controllers/store.controller.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { authenticate } from '../middlewares/authenticate.js';
import { readLimiter, writeLimiter } from '../middlewares/rateLimit.js';
import { requireStaff } from '../middlewares/rbac.js';
import { validate } from '../middlewares/validate.js';
import {
  publicStoreQuerySchema,
  storeQuerySchema,
  updateStoreScheduleSchema,
  updateStoreStatusSchema,
} from '../validators/store.validator.js';

export const storeRouter = Router();

// GET /store/status?branchId=... - status publik untuk web pelanggan
storeRouter.get(
  '/store/status',
  readLimiter,
  validate({ query: publicStoreQuerySchema }),
  asyncHandler(storeController.getPublicStatus),
);

// GET /admin/store?branchId=... - status buka/tutup + jadwal otomatis
storeRouter.get(
  '/admin/store',
  authenticate,
  requireStaff,
  readLimiter,
  validate({ query: storeQuerySchema }),
  asyncHandler(storeController.get),
);

// PATCH /admin/store/status - buka/tutup manual atau kembali ke jadwal
storeRouter.patch(
  '/admin/store/status',
  authenticate,
  requireStaff,
  writeLimiter,
  validate({ body: updateStoreStatusSchema }),
  asyncHandler(storeController.updateStatus),
);

// PUT /admin/store/schedule - atur jam buka/tutup otomatis setiap hari
storeRouter.put(
  '/admin/store/schedule',
  authenticate,
  requireStaff,
  writeLimiter,
  validate({ body: updateStoreScheduleSchema }),
  asyncHandler(storeController.updateSchedule),
);
