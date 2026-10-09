import { Router } from 'express';
import { z } from 'zod';
import { ACTIONS, MOMENT_MODERATION_STATUS, RESOURCES } from '../config/constants.js';
import * as momentController from '../controllers/moment.controller.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { authenticate, optionalAuthenticate } from '../middlewares/authenticate.js';
import { readLimiter, writeLimiter } from '../middlewares/rateLimit.js';
import { requirePermission, requireStaff } from '../middlewares/rbac.js';
import { validate } from '../middlewares/validate.js';
import {
  createMomentSchema,
  listMomentQuerySchema,
  momentIdParamSchema,
  moderateMomentSchema,
  updateMomentSchema,
} from '../validators/moment.validator.js';
import { uuidSchema } from '../validators/common.validator.js';

/** Filter status moderasi hanya untuk staff; ditambahkan di atas schema publik. */
const listMomentModerationQuerySchema = listMomentQuerySchema.extend({
  moderationStatus: z.enum(MOMENT_MODERATION_STATUS).optional(),
});

/** Body moderasi harus menyebut moment yang diubah. */
const moderateMomentBodySchema = moderateMomentSchema.extend({
  id: uuidSchema.optional(),
  momentId: uuidSchema.optional(),
});

export const momentRouter = Router();

// PATCH /admin/moments/moderate - staff memutuskan status moderasi moment.
// Didaftarkan lebih dulu supaya tidak pernah tertangkap /moments/:id.
momentRouter.patch(
  '/admin/moments/moderate',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.MOMENT, ACTIONS.UPDATE),
  writeLimiter,
  validate({ body: moderateMomentBodySchema }),
  asyncHandler(momentController.moderate),
);

// GET /moments - feed moment publik (anonim tetap boleh akses)
momentRouter.get(
  '/moments',
  optionalAuthenticate,
  readLimiter,
  validate({ query: listMomentModerationQuerySchema }),
  asyncHandler(momentController.list),
);

// POST /moments - pengguna login membuat moment baru
momentRouter.post(
  '/moments',
  authenticate,
  writeLimiter,
  validate({ body: createMomentSchema }),
  asyncHandler(momentController.create),
);

// PATCH /moments/:id - pemilik moment mengubah isi moment
momentRouter.patch(
  '/moments/:id',
  authenticate,
  writeLimiter,
  validate({ params: momentIdParamSchema, body: updateMomentSchema }),
  asyncHandler(momentController.update),
);

// DELETE /moments/:id - pemilik moment menghapus moment
momentRouter.delete(
  '/moments/:id',
  authenticate,
  writeLimiter,
  validate({ params: momentIdParamSchema }),
  asyncHandler(momentController.remove),
);

// GET /moments/:id - detail moment publik beserta media
momentRouter.get(
  '/moments/:id',
  optionalAuthenticate,
  readLimiter,
  validate({ params: momentIdParamSchema }),
  asyncHandler(momentController.detail),
);