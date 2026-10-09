import { Router } from 'express';
import { z } from 'zod';
import * as reviewController from '../controllers/review.controller.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { authenticate } from '../middlewares/authenticate.js';
import { readLimiter, writeLimiter } from '../middlewares/rateLimit.js';
import { validate } from '../middlewares/validate.js';
import { idParamSchema } from '../validators/common.validator.js';
import { createReviewSchema, listMyReviewQuerySchema } from '../validators/review.validator.js';

/**
 * Skema PATCH review. Semua field opsional karena hanya field yang dikirim
 * yang berubah, dan minimal satu field wajib ada supaya update tidak kosong.
 */
const updateReviewSchema = z
  .object({
    foodRating: z.coerce.number().int().min(1).max(5).optional(),
    serviceRating: z.coerce.number().int().min(1).max(5).optional(),
    speedRating: z.coerce.number().int().min(1).max(5).optional(),
    reviewText: z.string().trim().max(2000).nullable().optional(),
  })
  .refine(
    (value) =>
      value.foodRating !== undefined ||
      value.serviceRating !== undefined ||
      value.speedRating !== undefined ||
      value.reviewText !== undefined,
    {
      message: 'Minimal satu field rating atau reviewText wajib diisi',
      path: ['foodRating'],
    },
  );

export const reviewRouter = Router();

// POST /reviews - tulis review untuk item pesanan yang sudah selesai
reviewRouter.post(
  '/reviews',
  authenticate,
  writeLimiter,
  validate({ body: createReviewSchema }),
  asyncHandler(reviewController.create),
);

// GET /me/reviews - daftar review milik user yang sedang login
reviewRouter.get(
  '/me/reviews',
  authenticate,
  readLimiter,
  validate({ query: listMyReviewQuerySchema }),
  asyncHandler(reviewController.listMine),
);

// PATCH /me/reviews/:id - ubah review sendiri
reviewRouter.patch(
  '/me/reviews/:id',
  authenticate,
  writeLimiter,
  validate({ params: idParamSchema, body: updateReviewSchema }),
  asyncHandler(reviewController.update),
);

// DELETE /me/reviews/:id - hapus review sendiri
reviewRouter.delete(
  '/me/reviews/:id',
  authenticate,
  writeLimiter,
  validate({ params: idParamSchema }),
  asyncHandler(reviewController.remove),
);