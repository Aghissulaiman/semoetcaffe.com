import { Router } from 'express';
import * as loyaltyController from '../controllers/loyalty.controller.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { authenticate } from '../middlewares/authenticate.js';
import { idempotency } from '../middlewares/idempotency.js';
import { readLimiter, writeLimiter } from '../middlewares/rateLimit.js';
import { validate } from '../middlewares/validate.js';
import {
  listRedemptionQuerySchema,
  listRewardQuerySchema,
  pointsHistoryQuerySchema,
  redeemRewardSchema,
} from '../validators/loyalty.validator.js';

export const loyaltyRouter = Router();

// GET /me/points (saldo poin dan tier user yang sedang login)
loyaltyRouter.get(
  '/me/points',
  authenticate,
  readLimiter,
  asyncHandler(loyaltyController.getPoints),
);

// GET /me/points/history (riwayat mutasi poin, dipaginasi)
loyaltyRouter.get(
  '/me/points/history',
  authenticate,
  readLimiter,
  validate({ query: pointsHistoryQuerySchema }),
  asyncHandler(loyaltyController.listPointsHistory),
);

// GET /me/redemptions (riwayat penukaran poin, dipaginasi)
loyaltyRouter.get(
  '/me/redemptions',
  authenticate,
  readLimiter,
  validate({ query: listRedemptionQuerySchema }),
  asyncHandler(loyaltyController.listRedemptions),
);

// GET /loyalty/rewards (katalog hadiah, bisa difilter jenis dan biaya poin)
loyaltyRouter.get(
  '/loyalty/rewards',
  authenticate,
  readLimiter,
  validate({ query: listRewardQuerySchema }),
  asyncHandler(loyaltyController.listRewards),
);

// POST /loyalty/redeem (tukar poin dengan hadiah, dilindungi idempotensi)
loyaltyRouter.post(
  '/loyalty/redeem',
  authenticate,
  writeLimiter,
  idempotency(),
  validate({ body: redeemRewardSchema }),
  asyncHandler(loyaltyController.redeemReward),
);