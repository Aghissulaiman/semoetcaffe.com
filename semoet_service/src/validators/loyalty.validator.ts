import { z } from 'zod';
import { LOYALTY_REWARD_TYPE, POINT_MUTATION_TYPE } from '../config/constants.js';
import { uuidSchema } from './common.validator.js';

export const pointsHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  mutationType: z.enum(POINT_MUTATION_TYPE).optional(),
  referenceType: z.string().trim().max(60).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const listRewardQuerySchema = z.object({
  rewardType: z.enum(LOYALTY_REWARD_TYPE).optional(),
  isActive: z.enum(['true', 'false']).optional(),
  maxPoints: z.coerce.number().int().min(0).optional(),
});

export const redeemRewardSchema = z.object({
  rewardId: uuidSchema,
  /** Idempotensi agar redeem tidak terpotong dua kali saat retry. */
  idempotencyKey: z.string().trim().min(8).max(128).optional(),
});

export const listRedemptionQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(['pending', 'completed', 'cancelled']).optional(),
});

export type PointsHistoryQuery = z.infer<typeof pointsHistoryQuerySchema>;
export type ListRewardQuery = z.infer<typeof listRewardQuerySchema>;
export type RedeemRewardInput = z.infer<typeof redeemRewardSchema>;
export type ListRedemptionQuery = z.infer<typeof listRedemptionQuerySchema>;