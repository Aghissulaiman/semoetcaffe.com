import { z } from 'zod';
import { DELIVERY_STATUS } from '../config/constants.js';
import { uuidSchema } from './common.validator.js';

/**
 * Validator endpoint delivery.
 *
 * Schema input (assign, tracking, ubah status) sudah didefinisikan di
 * review.validator.ts karena pertama kali dibuat bersama endpoint review;
 * file ini menyalin-export-nya supaya router delivery cukup mengimpor dari
 * satu tempat, dan menambah query list pengiriman.
 */
export {
  assignDeliverySchema,
  deliveryTrackingSchema,
  updateDeliveryStatusSchema,
} from './review.validator.js';
export type {
  AssignDeliveryInput,
  DeliveryTrackingInput,
  UpdateDeliveryStatusInput,
} from './review.validator.js';

/** Param :orderId dipakai pada semua endpoint delivery per pesanan. */
export const orderDeliveryParamSchema = z.object({ orderId: uuidSchema });

export const listDeliveryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  deliveryStatus: z.enum(DELIVERY_STATUS).optional(),
  branchId: uuidSchema.optional(),
});

export const listActiveDeliveryQuerySchema = z.object({
  branchId: uuidSchema.optional(),
});

export type ListDeliveryQuery = z.infer<typeof listDeliveryQuerySchema>;
export type ListActiveDeliveryQuery = z.infer<typeof listActiveDeliveryQuerySchema>;