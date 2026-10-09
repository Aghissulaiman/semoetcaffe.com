import { z } from 'zod';
import { DELIVERY_STATUS } from '../config/constants.js';
import { uuidSchema } from './common.validator.js';

export const createReviewSchema = z.object({
  orderItemId: uuidSchema,
  foodRating: z.coerce.number().int().min(1).max(5).optional(),
  serviceRating: z.coerce.number().int().min(1).max(5).optional(),
  speedRating: z.coerce.number().int().min(1).max(5).optional(),
  reviewText: z.string().trim().max(2000).nullable().optional(),
}).refine(
  (value) =>
    value.foodRating !== undefined ||
    value.serviceRating !== undefined ||
    value.speedRating !== undefined,
  {
    message: 'Minimal satu rating (makanan, pelayanan, atau kecepatan) wajib diisi',
    path: ['foodRating'],
  },
);

export const listMyReviewQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const moderateReviewSchema = z.object({
  moderationStatus: z.enum(['visible', 'hidden', 'flagged']),
  note: z.string().trim().max(500).optional(),
});

export const assignDeliverySchema = z.object({
  provider: z.string().trim().min(2).max(60),
  trackingCode: z.string().trim().max(120).optional(),
  driverName: z.string().trim().max(120).optional(),
  driverPhone: z.string().trim().max(30).optional(),
  estimatedDeliveryAt: z.string().optional(),
  deliveryStatus: z.enum(DELIVERY_STATUS).default('assigned'),
});

export const deliveryTrackingSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  recordedAt: z.string().optional(),
});

export const updateDeliveryStatusSchema = z.object({
  deliveryStatus: z.enum(DELIVERY_STATUS),
  note: z.string().trim().max(500).optional(),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type ListMyReviewQuery = z.infer<typeof listMyReviewQuerySchema>;
export type AssignDeliveryInput = z.infer<typeof assignDeliverySchema>;
export type DeliveryTrackingInput = z.infer<typeof deliveryTrackingSchema>;
export type UpdateDeliveryStatusInput = z.infer<typeof updateDeliveryStatusSchema>;