import { Router } from 'express';
import * as shiftController from '../controllers/shift.controller.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { authenticate } from '../middlewares/authenticate.js';
import { readLimiter, writeLimiter } from '../middlewares/rateLimit.js';
import { requireStaff } from '../middlewares/rbac.js';
import { validate } from '../middlewares/validate.js';
import { uuidParamSchema } from '../validators/common.validator.js';
import {
  activeShiftQuerySchema,
  closeShiftSchema,
  handoverShiftSchema,
  listShiftQuerySchema,
  startShiftSchema,
  updateShiftPlanSchema,
} from '../validators/shift.validator.js';

export const shiftRouter = Router();

// GET /admin/shifts/staff - pilihan akun staf untuk membuka shift
shiftRouter.get(
  '/admin/shifts/staff',
  authenticate,
  requireStaff,
  readLimiter,
  asyncHandler(shiftController.listStaff),
);

// GET /admin/shifts/active?branchId=... - shift yang sedang terbuka di cabang
shiftRouter.get(
  '/admin/shifts/active',
  authenticate,
  requireStaff,
  readLimiter,
  validate({ query: activeShiftQuerySchema }),
  asyncHandler(shiftController.activeShift),
);

// GET /admin/shifts?branchId=... - riwayat shift cabang
shiftRouter.get(
  '/admin/shifts',
  authenticate,
  requireStaff,
  readLimiter,
  validate({ query: listShiftQuerySchema }),
  asyncHandler(shiftController.listShifts),
);

// POST /admin/shifts/start - buka shift memakai akun role staff
shiftRouter.post(
  '/admin/shifts/start',
  authenticate,
  requireStaff,
  writeLimiter,
  validate({ body: startShiftSchema }),
  asyncHandler(shiftController.startShift),
);

// POST /admin/shifts/:id/close - tutup shift dan catat kas akhir
shiftRouter.post(
  '/admin/shifts/:id/close',
  authenticate,
  requireStaff,
  writeLimiter,
  validate({ params: uuidParamSchema, body: closeShiftSchema }),
  asyncHandler(shiftController.closeShift),
);

// PATCH /admin/shifts/:id/plan - ubah jam rencana shift yang masih aktif
shiftRouter.patch(
  '/admin/shifts/:id/plan',
  authenticate,
  requireStaff,
  writeLimiter,
  validate({ params: uuidParamSchema, body: updateShiftPlanSchema }),
  asyncHandler(shiftController.updateShiftPlan),
);

// POST /admin/shifts/:id/handover - pergantian shift dalam satu transaksi
shiftRouter.post(
  '/admin/shifts/:id/handover',
  authenticate,
  requireStaff,
  writeLimiter,
  validate({ params: uuidParamSchema, body: handoverShiftSchema }),
  asyncHandler(shiftController.handoverShift),
);
