import { z } from 'zod';
import { DEVICE_PROVIDER, NOTIFICATION_CHANNEL, NOTIFICATION_STATUS } from '../config/constants.js';
import { booleanQuery, uuidSchema } from './common.validator.js';

export const listNotificationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  channel: z.enum(NOTIFICATION_CHANNEL).optional(),
  status: z.enum(NOTIFICATION_STATUS).optional(),
  unreadOnly: booleanQuery.optional(),
});

export const notificationIdParamSchema = z.object({ id: uuidSchema });

export const markReadSchema = z.object({
  /** Kosongkan untuk menandai semua notifikasi sebagai dibaca. */
  notificationIds: z.array(uuidSchema).max(200).optional(),
});

export const registerDeviceSchema = z.object({
  provider: z.enum(DEVICE_PROVIDER),
  token: z.string().trim().min(20, 'Token device tidak valid').max(500),
  deviceLabel: z.string().trim().max(120).optional(),
});

export const deviceIdParamSchema = z.object({ id: uuidSchema });

export const listDeviceQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  provider: z.enum(DEVICE_PROVIDER).optional(),
});

export const sendNotificationSchema = z.object({
  userId: uuidSchema,
  channel: z.enum(NOTIFICATION_CHANNEL),
  title: z.string().trim().min(1).max(150),
  body: z.string().trim().min(1).max(2000),
  actionUrl: z.string().trim().max(500).optional(),
  scheduledAt: z.string().optional(),
});

export type ListNotificationQuery = z.infer<typeof listNotificationQuerySchema>;
export type MarkReadInput = z.infer<typeof markReadSchema>;
export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;
export type SendNotificationInput = z.infer<typeof sendNotificationSchema>;