import { z } from 'zod';
import { ACTIVITY_TYPE } from '../config/constants.js';
import { uuidSchema } from './common.validator.js';

export const listActivityQuerySchema = z.object({
  isActive: z.enum(['true', 'false']).optional(),
  activityType: z.enum(ACTIVITY_TYPE).optional(),
  at: z.string().optional(),
});

export const activityCodeParamSchema = z.object({
  code: z.string().trim().min(2).max(60).transform((v) => v.toUpperCase()),
});

export const playActivitySchema = z.object({
  activityCode: z.string().trim().min(2).max(60).transform((v) => v.toUpperCase()),
  idempotencyKey: z.string().trim().min(8).max(128).optional(),
});

export const listPlayHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  activityId: uuidSchema.optional(),
});

export type PlayActivityInput = z.infer<typeof playActivitySchema>;
export type ListActivityQuery = z.infer<typeof listActivityQuerySchema>;
export type ListPlayHistoryQuery = z.infer<typeof listPlayHistoryQuerySchema>;