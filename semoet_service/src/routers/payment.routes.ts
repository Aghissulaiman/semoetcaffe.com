import express, { Router } from 'express';
import { RAW_BODY_TYPE, captureRawJsonBody } from '../config/rawBody.js';
import * as paymentController from '../controllers/payment.controller.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { authenticate } from '../middlewares/authenticate.js';
import { idempotency } from '../middlewares/idempotency.js';
import { writeLimiter } from '../middlewares/rateLimit.js';
import { requirePermission, requireStaff } from '../middlewares/rbac.js';
import { validate } from '../middlewares/validate.js';
import {
  createChargeSchema,
  listOrderPaymentQuerySchema,
  orderPaymentParamSchema,
  paymentIdParamSchema,
  paymentWebhookSchema,
  refundSchema,
} from '../validators/payment.validator.js';

/**
 * Webhook provider (PUBLIK, tanpa authenticate) — router TERPISAH.
 *
 * Router ini sengaja tidak digabung dengan `paymentRouter` supaya
 * `app.ts` bisa memasangnya SEBELUM `express.json()` global. Alasannya:
 * body-parser hanya membaca stream request satu kali. Kalau `express.json()`
 * jalan lebih dulu, stream sudah habis dan `express.raw()` di bawah tidak akan
 * dapat byte asli untuk verifikasi signature HMAC.
 *
 * app.ts:
 *   app.use(API_PREFIX, paymentWebhookRouter); // <- sebelum express.json()
 *   app.use(express.json());
 *   app.use(API_PREFIX, paymentRouter);        // <- setelah express.json()
 *
 * Urutan middleware di route ini penting:
 * 1. express.raw membaca stream request sebagai Buffer dan menyimpannya di
 *    req.body.
 * 2. captureRawJsonBody menyimpan byte asli ke req.rawBody lalu mengubah
 *    req.body menjadi objek JSON supaya validate() (Zod) tetap bisa bekerja.
 * 3. Verifikasi signature HMAC dilakukan di service memakai req.rawBody.
 *
 * Idempotensi webhook dijamin `payment_events.provider_event_id` UNIQUE.
 */
export const paymentWebhookRouter = Router();

paymentWebhookRouter.post(
  '/payments/webhook',
  express.raw({ type: RAW_BODY_TYPE, limit: '1mb' }),
  captureRawJsonBody,
  validate({ body: paymentWebhookSchema }),
  asyncHandler(paymentController.webhook),
);

/** Route payment selain webhook (butuh body JSON hasil express.json()). */
export const paymentRouter = Router();

// POST /payments/charge
paymentRouter.post(
  '/payments/charge',
  authenticate,
  writeLimiter,
  idempotency(),
  validate({ body: createChargeSchema }),
  asyncHandler(paymentController.create),
);

// GET /payments/:id/verify harus lebih dulu dari /payments/:id.
paymentRouter.get(
  '/payments/:id/verify',
  authenticate,
  validate({ params: paymentIdParamSchema }),
  asyncHandler(paymentController.verify),
);

// POST /payments/:id/simulate — khusus demo/development (gateway stub).
paymentRouter.post(
  '/payments/:id/simulate',
  authenticate,
  writeLimiter,
  validate({ params: paymentIdParamSchema }),
  asyncHandler(paymentController.simulate),
);

paymentRouter.get(
  '/payments/:id',
  authenticate,
  validate({ params: paymentIdParamSchema }),
  asyncHandler(paymentController.detail),
);

// POST /payments/:id/refund
paymentRouter.post(
  '/payments/:id/refund',
  authenticate,
  requireStaff,
  requirePermission('payment', 'update'),
  writeLimiter,
  validate({ params: paymentIdParamSchema, body: refundSchema }),
  asyncHandler(paymentController.refund),
);

// GET /orders/:orderId/payments
paymentRouter.get(
  '/orders/:orderId/payments',
  authenticate,
  validate({ params: orderPaymentParamSchema, query: listOrderPaymentQuerySchema }),
  asyncHandler(paymentController.listForOrder),
);