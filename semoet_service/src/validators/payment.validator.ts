import { z } from 'zod';
import { PAYMENT_METHOD, PAYMENT_PURPOSE } from '../config/constants.js';
import { idrAmountSchema, uuidSchema } from './common.validator.js';

export const createChargeSchema = z.object({
  orderId: uuidSchema.optional(),
  eventBookingId: uuidSchema.optional(),
  paymentMethod: z.enum(PAYMENT_METHOD),
  paymentPurpose: z.enum(PAYMENT_PURPOSE).optional(),
  provider: z.string().trim().min(2).max(40).optional(),
  /** Override total (hanya untuk koreksi admin/internal). */
  amountIdr: idrAmountSchema.optional(),
  idempotencyKey: z.string().trim().min(8).max(128).optional(),
});

export const paymentIdParamSchema = z.object({ id: uuidSchema });

/** Param :orderId pada endpoint /orders/:orderId/payments. */
export const orderPaymentParamSchema = z.object({ orderId: uuidSchema });

export const refundSchema = z.object({
  amountIdr: idrAmountSchema.optional(),
  reason: z.string().trim().min(3).max(500).optional(),
});

export const paymentWebhookSchema = z.object({
  provider: z.string().trim().min(2).max(40),
  providerEventId: z.string().trim().min(3).max(255),
  eventType: z.string().trim().min(2).max(80),
  providerReference: z.string().trim().max(255).optional(),
  status: z.enum(['pending', 'succeeded', 'failed', 'expired', 'cancelled']).optional(),
  amountIdr: idrAmountSchema.optional(),
  paidAt: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export const listOrderPaymentQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(['pending', 'succeeded', 'failed', 'expired', 'cancelled']).optional(),
});

export type CreateChargeInput = z.infer<typeof createChargeSchema>;
export type RefundInput = z.infer<typeof refundSchema>;
export type PaymentWebhookInput = z.infer<typeof paymentWebhookSchema>;
export type ListOrderPaymentQuery = z.infer<typeof listOrderPaymentQuerySchema>;