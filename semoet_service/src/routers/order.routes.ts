import { Router } from 'express';
import * as orderController from '../controllers/order.controller.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { authenticate } from '../middlewares/authenticate.js';
import { idempotency } from '../middlewares/idempotency.js';
import { readLimiter, writeLimiter } from '../middlewares/rateLimit.js';
import { validate } from '../middlewares/validate.js';
import {
  cancelOrderSchema,
  createOrderSchema,
  listMyOrderQuerySchema,
  orderIdParamSchema,
} from '../validators/order.validator.js';

export const orderRouter = Router();

// POST /orders: buat pesanan baru. Harga dihitung ulang di server, dan header
// Idempotency-Key mencegah dobel order saat aplikasi mobile mengirim ulang request.
orderRouter.post(
  '/orders',
  authenticate,
  writeLimiter,
  idempotency(),
  validate({ body: createOrderSchema }),
  asyncHandler(orderController.create),
);

// GET /me/orders: riwayat pesanan milik user yang sedang login (ber-filter).
orderRouter.get(
  '/me/orders',
  authenticate,
  readLimiter,
  validate({ query: listMyOrderQuerySchema }),
  asyncHandler(orderController.listMine),
);

// GET /orders/:id/items: rincian item beserta modifier yang dipilih.
orderRouter.get(
  '/orders/:id/items',
  authenticate,
  validate({ params: orderIdParamSchema }),
  asyncHandler(orderController.listItems),
);

// GET /orders/:id/status: riwayat perubahan status pesanan.
orderRouter.get(
  '/orders/:id/status',
  authenticate,
  validate({ params: orderIdParamSchema }),
  asyncHandler(orderController.statusHistory),
);

// POST /orders/:id/cancel: batalkan pesanan milik sendiri (hanya status yang
// masih boleh dibatalkan). Promo, voucher, dan poin dikembalikan.
orderRouter.post(
  '/orders/:id/cancel',
  authenticate,
  writeLimiter,
  validate({ params: orderIdParamSchema, body: cancelOrderSchema }),
  asyncHandler(orderController.cancel),
);

// GET /orders/:id: detail pesanan. Route ini diletakkan paling akhir karena
// /orders/:id/payments (payment.routes) dan /orders/:id/delivery (delivery.routes)
// adalah path yang lebih spesifik.
orderRouter.get(
  '/orders/:id',
  authenticate,
  validate({ params: orderIdParamSchema }),
  asyncHandler(orderController.detail),
);