import { Router } from 'express';
import { ACTIONS, RESOURCES } from '../config/constants.js';
import * as notificationController from '../controllers/notification.controller.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { authenticate } from '../middlewares/authenticate.js';
import { readLimiter, writeLimiter } from '../middlewares/rateLimit.js';
import { requirePermission, requireStaff } from '../middlewares/rbac.js';
import { validate } from '../middlewares/validate.js';
import {
  deviceIdParamSchema,
  listDeviceQuerySchema,
  listNotificationQuerySchema,
  markReadSchema,
  notificationIdParamSchema,
  registerDeviceSchema,
  sendNotificationSchema,
} from '../validators/notification.validator.js';

export const notificationRouter = Router();

// POST /admin/notifications - staff mengirim notifikasi ke pengguna.
// Didaftarkan lebih dulu supaya tidak tertangkap route /me/... .
notificationRouter.post(
  '/admin/notifications',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.USER, ACTIONS.CREATE),
  writeLimiter,
  validate({ body: sendNotificationSchema }),
  asyncHandler(notificationController.broadcast),
);

// GET /me/notifications - daftar notifikasi milik pengguna yang login
notificationRouter.get(
  '/me/notifications',
  authenticate,
  readLimiter,
  validate({ query: listNotificationQuerySchema }),
  asyncHandler(notificationController.list),
);

// POST /me/notifications/read-all - tandai semua notifikasi sudah dibaca
notificationRouter.post(
  '/me/notifications/read-all',
  authenticate,
  writeLimiter,
  asyncHandler(notificationController.markAllRead),
);

// POST /me/notifications/:id/read - tandai satu notifikasi sudah dibaca
notificationRouter.post(
  '/me/notifications/:id/read',
  authenticate,
  writeLimiter,
  validate({ params: notificationIdParamSchema, body: markReadSchema }),
  asyncHandler(notificationController.markRead),
);

// GET /me/devices - daftar perangkat (token push) milik pengguna
notificationRouter.get(
  '/me/devices',
  authenticate,
  readLimiter,
  validate({ query: listDeviceQuerySchema }),
  asyncHandler(notificationController.listDevices),
);

// POST /me/devices - daftarkan atau segarkan token push perangkat
notificationRouter.post(
  '/me/devices',
  authenticate,
  writeLimiter,
  validate({ body: registerDeviceSchema }),
  asyncHandler(notificationController.registerDevice),
);

// DELETE /me/devices/:id - cabut token push perangkat milik pengguna
notificationRouter.delete(
  '/me/devices/:id',
  authenticate,
  writeLimiter,
  validate({ params: deviceIdParamSchema }),
  asyncHandler(notificationController.revokeDevice),
);