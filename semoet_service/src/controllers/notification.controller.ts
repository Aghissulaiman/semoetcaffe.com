import type { Request, Response } from 'express';
import { z } from 'zod';
import * as notificationService from '../services/notification.service.js';
import { sendCreated, sendNoContent, sendPaginated, sendSuccess } from '../utils/response.js';
import { getBody, getParams, getQuery, getUserId } from '../utils/request.js';
import {
  listDeviceQuerySchema,
  listNotificationQuerySchema,
  type ListNotificationQuery,
  type MarkReadInput,
  type RegisterDeviceInput,
  type SendNotificationInput,
} from '../validators/notification.validator.js';

/** Parse ulang query sebagai fallback bila middleware validate belum jalan. */
function parseQuery<T>(schema: z.ZodTypeAny, query: unknown): T {
  const parsed = schema.safeParse(query ?? {});
  return (parsed.success ? parsed.data : query) as T;
}

function isStaffRequest(req: Request): boolean {
  return Boolean(req.user?.isStaff);
}

// GET /me/notifications - notifikasi milik pengguna yang login
export async function list(req: Request, res: Response): Promise<Response> {
  const query = parseQuery<ListNotificationQuery>(
    listNotificationQuerySchema,
    getQuery(req),
  );
  const result = await notificationService.listNotifications(getUserId(req), query);

  return sendPaginated(
    res,
    result.items,
    {
      page: result.meta.page,
      limit: result.meta.limit,
      total: result.meta.total,
    },
    { unreadCount: result.unreadCount },
  );
}

// POST /me/notifications/:id/read - tandai notifikasi sudah dibaca
export async function markRead(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const body = getBody<MarkReadInput>(req);

  const data = await notificationService.markRead(getUserId(req), id, body);
  return sendSuccess(res, data);
}

// POST /me/notifications/read-all - tandai semua notifikasi sudah dibaca
export async function markAllRead(req: Request, res: Response): Promise<Response> {
  const data = await notificationService.markAllRead(getUserId(req));
  return sendSuccess(res, data);
}

// GET /me/devices - daftar perangkat pengguna
export async function listDevices(req: Request, res: Response): Promise<Response> {
  const query = parseQuery<notificationService.ListDeviceQuery>(
    listDeviceQuerySchema,
    getQuery(req),
  );
  const result = await notificationService.listDevices(getUserId(req), query);

  return sendPaginated(res, result.items, {
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
  });
}

// POST /me/devices - daftarkan token push perangkat
export async function registerDevice(req: Request, res: Response): Promise<Response> {
  const body = getBody<RegisterDeviceInput>(req);
  const data = await notificationService.registerDevice(getUserId(req), body);
  return sendCreated(res, data);
}

// DELETE /me/devices/:id - cabut token push perangkat
export async function revokeDevice(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  await notificationService.revokeDevice(getUserId(req), id);
  return sendNoContent(res);
}

// POST /admin/notifications - kirim notifikasi ke pengguna tertentu (staff)
export async function broadcast(req: Request, res: Response): Promise<Response> {
  const body = getBody<SendNotificationInput>(req);
  const data = await notificationService.broadcast(getUserId(req), body, isStaffRequest(req));
  return sendCreated(res, data);
}