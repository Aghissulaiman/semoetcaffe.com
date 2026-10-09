import { Router } from 'express';
import * as deliveryController from '../controllers/delivery.controller.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { authenticate } from '../middlewares/authenticate.js';
import { writeLimiter } from '../middlewares/rateLimit.js';
import { requirePermission, requireStaff } from '../middlewares/rbac.js';
import { validate } from '../middlewares/validate.js';
import {
  assignDeliverySchema,
  deliveryTrackingSchema,
  listActiveDeliveryQuerySchema,
  listDeliveryQuerySchema,
  orderDeliveryParamSchema,
  updateDeliveryStatusSchema,
} from '../validators/delivery.validator.js';

export const deliveryRouter = Router();

// GET /deliveries (daftar pengiriman untuk staff/admin)
deliveryRouter.get(
  '/deliveries',
  authenticate,
  requireStaff,
  requirePermission('delivery', 'read'),
  validate({ query: listDeliveryQuerySchema }),
  asyncHandler(deliveryController.list),
);

// GET /deliveries/active (halaman tracking kurir)
deliveryRouter.get(
  '/deliveries/active',
  authenticate,
  requireStaff,
  validate({ query: listActiveDeliveryQuerySchema }),
  asyncHandler(deliveryController.active),
);

// GET /orders/:orderId/delivery
deliveryRouter.get(
  '/orders/:orderId/delivery',
  authenticate,
  validate({ params: orderDeliveryParamSchema }),
  asyncHandler(deliveryController.detail),
);

// POST /orders/:orderId/delivery/assign
deliveryRouter.post(
  '/orders/:orderId/delivery/assign',
  authenticate,
  requireStaff,
  requirePermission('delivery', 'update'),
  writeLimiter,
  validate({ params: orderDeliveryParamSchema, body: assignDeliverySchema }),
  asyncHandler(deliveryController.assignCourier),
);

// POST /orders/:orderId/delivery/tracking
deliveryRouter.post(
  '/orders/:orderId/delivery/tracking',
  authenticate,
  requireStaff,
  writeLimiter,
  validate({ params: orderDeliveryParamSchema, body: deliveryTrackingSchema }),
  asyncHandler(deliveryController.addTrackingPoint),
);

// GET /orders/:orderId/delivery/tracking
deliveryRouter.get(
  '/orders/:orderId/delivery/tracking',
  authenticate,
  validate({ params: orderDeliveryParamSchema, query: listDeliveryQuerySchema }),
  asyncHandler(deliveryController.getTracking),
);

// PATCH /orders/:orderId/delivery/status
deliveryRouter.patch(
  '/orders/:orderId/delivery/status',
  authenticate,
  requireStaff,
  requirePermission('delivery', 'update'),
  writeLimiter,
  validate({ params: orderDeliveryParamSchema, body: updateDeliveryStatusSchema }),
  asyncHandler(deliveryController.updateStatus),
);