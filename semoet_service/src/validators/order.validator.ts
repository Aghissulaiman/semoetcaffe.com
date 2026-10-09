import { z } from 'zod';
import { FULFILLMENT_TYPE, ORDER_STATUS, PAYMENT_METHOD, PAYMENT_PURPOSE } from '../config/constants.js';
import { booleanQuery, idrAmountSchema, isoDateTime, uuidSchema } from './common.validator.js';

const orderItemModifierSchema = z.object({
  optionId: uuidSchema,
  quantity: z.coerce.number().int().min(1).max(20).default(1),
});

const orderItemSchema = z.object({
  productId: uuidSchema,
  variantId: uuidSchema,
  quantity: z.coerce.number().int().min(1).max(50),
  modifiers: z.array(orderItemModifierSchema).max(20).default([]),
  specialInstructions: z.string().trim().max(500).nullable().optional(),
});

export const createOrderSchema = z
  .object({
    branchId: uuidSchema,
    fulfillmentType: z.enum(FULFILLMENT_TYPE),
    items: z.array(orderItemSchema).min(1, 'Keranjang tidak boleh kosong').max(50),
    promoCode: z.string().trim().max(40).transform((v) => v.toUpperCase()).nullable().optional(),
    voucherId: uuidSchema.nullable().optional(),
    addressId: uuidSchema.nullable().optional(),
    tableId: uuidSchema.nullable().optional(),
    pickupAt: isoDateTime.nullable().optional(),
    customerNotes: z.string().trim().max(500).nullable().optional(),
    /** Alamat disimpan sebagai snapshot order agar konsisten walau alamat diedit. */
    useAddressSnapshot: booleanQuery.default(true),
    idempotencyKey: z.string().trim().min(8).max(128).optional(),
  })
  .refine((value) => value.fulfillmentType !== 'delivery' || Boolean(value.addressId), {
    message: 'addressId wajib diisi untuk pesanan delivery',
    path: ['addressId'],
  })
  .refine((value) => value.fulfillmentType !== 'dine_in' || Boolean(value.tableId), {
    message: 'tableId wajib diisi untuk pesanan dine-in',
    path: ['tableId'],
  })
  .refine((value) => value.fulfillmentType !== 'pickup' || !value.pickupAt || new Date(value.pickupAt).getTime() > Date.now(), {
    message: 'pickupAt harus berada di masa depan',
    path: ['pickupAt'],
  });

export const listMyOrderQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  orderStatus: z.enum(ORDER_STATUS).optional(),
  paymentStatus: z.enum(['unpaid', 'pending', 'paid', 'partially_refunded', 'refunded', 'failed']).optional(),
  branchId: uuidSchema.optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  sort: z.enum(['recent', 'oldest', 'total_desc']).default('recent'),
});

export const orderIdParamSchema = z.object({ id: uuidSchema });

export const cancelOrderSchema = z
  .object({
    reason: z.string().trim().min(3, 'Alasan pembatalan minimal 3 karakter').max(500),
    /** Customer ingin pengembalian dana bila sudah dibayar. */
    requestRefund: z.boolean().default(true),
  })
  .default({ reason: 'Dibatalkan oleh customer', requestRefund: true });

export const updateOrderStatusSchema = z.object({
  toStatus: z.enum(ORDER_STATUS),
  note: z.string().trim().max(500).optional(),
  expectedItemStatuses: z.enum(ORDER_STATUS).optional(),
});

export const orderItemStatusSchema = z.object({
  itemId: uuidSchema,
  itemStatus: z.enum(['pending', 'preparing', 'ready', 'cancelled']),
});

export const bulkOrderItemStatusSchema = z.object({
  statuses: z.array(orderItemStatusSchema).min(1).max(100),
});

export const quoteOrderSchema = z.object({
  branchId: uuidSchema,
  fulfillmentType: z.enum(FULFILLMENT_TYPE),
  items: z.array(orderItemSchema).min(1).max(50),
  promoCode: z.string().trim().max(40).transform((v) => v.toUpperCase()).nullable().optional(),
  voucherId: uuidSchema.nullable().optional(),
  addressId: uuidSchema.nullable().optional(),
  tableId: uuidSchema.nullable().optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type ListMyOrderQuery = z.infer<typeof listMyOrderQuerySchema>;
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
export type QuoteOrderInput = z.infer<typeof quoteOrderSchema>;