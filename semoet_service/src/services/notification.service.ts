import { z } from 'zod';
import { NOTIFICATION_CHANNEL, type NotificationChannel } from '../config/constants.js';
import { badRequest, forbidden, notFound } from '../errors/AppError.js';
import * as authRepo from '../repositories/auth.repository.js';
import * as notificationRepo from '../repositories/notification.repository.js';
import { sha256 } from '../utils/codeGenerator.js';
import {
  buildPaginationMeta,
  parsePagination,
  type Pagination,
} from '../utils/pagination.js';
import { bool, iso, str, strOrNull } from '../utils/serialize.js';
import {
  listDeviceQuerySchema,
  type ListNotificationQuery,
  type MarkReadInput,
  type RegisterDeviceInput,
  type SendNotificationInput,
} from '../validators/notification.validator.js';

export interface Paginated<T> {
  items: T[];
  meta: ReturnType<typeof buildPaginationMeta>;
}

/** Tipe query daftar device diturunkan dari schema validator notifikasi. */
export type ListDeviceQuery = z.infer<typeof listDeviceQuerySchema>;

export interface Notification {
  id: string;
  channel: string;
  title: string;
  body: string;
  actionUrl: string | null;
  status: string;
  scheduledAt: string | null;
  sentAt: string | null;
  readAt: string | null;
  createdAt: string | null;
  isRead: boolean;
}

export interface Device {
  id: string;
  provider: string;
  deviceLabel: string | null;
  lastSeenAt: string | null;
  revokedAt: string | null;
  createdAt: string | null;
}

// --------------------------------------------------------------------------
// Helper shaping
// --------------------------------------------------------------------------
function shapeNotification(row: Record<string, unknown>): Notification {
  const readAt = iso(row.readAt);
  return {
    id: str(row.id),
    channel: str(row.channel),
    title: str(row.title),
    body: str(row.body),
    actionUrl: strOrNull(row.actionUrl),
    status: str(row.status),
    scheduledAt: iso(row.scheduledAt),
    sentAt: iso(row.sentAt),
    readAt,
    createdAt: iso(row.createdAt),
    isRead: readAt !== null,
  };
}

function shapeDevice(row: Record<string, unknown>): Device {
  return {
    id: str(row.id),
    provider: str(row.provider),
    deviceLabel: strOrNull(row.deviceLabel),
    lastSeenAt: iso(row.lastSeenAt),
    revokedAt: iso(row.revokedAt),
    createdAt: iso(row.createdAt),
  };
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw badRequest('scheduledAt harus berupa format tanggal waktu yang valid');
  }
  return date;
}

function isNotificationChannel(value: string): value is NotificationChannel {
  return (NOTIFICATION_CHANNEL as readonly string[]).includes(value);
}

// --------------------------------------------------------------------------
// GET /me/notifications
// --------------------------------------------------------------------------
export async function listNotifications(userId: string, query: ListNotificationQuery) {
  const paging = parsePagination(query);
  const filters: notificationRepo.ListNotificationFilters = {
    channel: query.channel,
    status: query.status,
    unreadOnly: bool(query.unreadOnly, false),
  };

  const rows = await notificationRepo.listNotifications(userId, filters, paging);
  const total = await notificationRepo.countNotifications(userId, filters);
  // Jumlah unread dihitung tanpa filter supaya badge aplikasi selalu akurat.
  const unreadCount = await notificationRepo.countUnread(userId);
  const pagination: Pagination = {
    page: paging.page,
    limit: paging.limit,
    offset: paging.offset,
    total,
  };

  return {
    items: rows.map(shapeNotification),
    meta: buildPaginationMeta(pagination),
    unreadCount,
  };
}

// --------------------------------------------------------------------------
// POST /me/notifications/:id/read
// --------------------------------------------------------------------------
export async function markRead(
  userId: string,
  notificationId: string | null | undefined,
  input: MarkReadInput,
) {
  const ids = input?.notificationIds ?? [];

  // Body boleh membawa daftar id supaya aplikasi bisa menandai beberapa
  // notifikasi sekaligus (repo sudah membatasi ke notifikasi milik pemanggil).
  if (ids.length > 0) {
    const updated = await notificationRepo.markNotificationsRead(userId, ids);
    const unreadCount = await notificationRepo.countUnread(userId);
    return {
      updated: updated.length,
      notifications: updated.map(shapeNotification),
      unreadCount,
    };
  }

  if (!notificationId) throw badRequest('id notifikasi wajib diisi');

  const current = await notificationRepo.findNotification(userId, notificationId);
  // findNotification sudah dibatasi user_id, jadi null berarti notifikasi itu
  // bukan milik pemanggil.
  if (!current) throw forbidden('Notifikasi ini bukan milik Anda');

  const updated = await notificationRepo.markNotificationRead(userId, notificationId);
  if (!updated) throw notFound('Notifikasi', notificationId);

  const unreadCount = await notificationRepo.countUnread(userId);
  return {
    updated: 1,
    notifications: [shapeNotification(updated as unknown as Record<string, unknown>)],
    unreadCount,
  };
}

// --------------------------------------------------------------------------
// POST /me/notifications/read-all
// --------------------------------------------------------------------------
export async function markAllRead(userId: string) {
  const updated = await notificationRepo.markAllNotificationsRead(userId);
  // Semua notifikasi sudah ditandai, jadi sisa unread pasti nol tanpa query lagi.
  return { updated, unreadCount: 0 };
}

// --------------------------------------------------------------------------
// GET /me/devices
// --------------------------------------------------------------------------
export async function listDevices(userId: string, query: ListDeviceQuery) {
  const paging = parsePagination(query);
  const rows = await notificationRepo.listDevices(userId, paging, query.provider);
  const total = await notificationRepo.countDevices(userId);
  const pagination: Pagination = {
    page: paging.page,
    limit: paging.limit,
    offset: paging.offset,
    total,
  };

  return {
    items: rows.map(shapeDevice),
    meta: buildPaginationMeta(pagination),
  };
}

// --------------------------------------------------------------------------
// POST /me/devices
// --------------------------------------------------------------------------
export async function registerDevice(userId: string, input: RegisterDeviceInput): Promise<Device> {
  // Token mentah tidak pernah disimpan maupun dikembalikan; hanya hash-nya.
  // Upsert membuat pendaftaran ulang token yang sama aman dan menghidupkan
  // kembali device yang sebelumnya sudah dicabut.
  const row = await notificationRepo.upsertDevice({
    userId,
    provider: input.provider,
    tokenHash: sha256(input.token),
    deviceLabel: input.deviceLabel ?? null,
  });
  if (!row) throw badRequest('Device gagal didaftarkan');

  return shapeDevice(row as unknown as Record<string, unknown>);
}

// --------------------------------------------------------------------------
// DELETE /me/devices/:id
// --------------------------------------------------------------------------
export async function revokeDevice(
  userId: string,
  deviceId: string,
): Promise<{ id: string; revoked: boolean }> {
  // Query repository dibatasi user_id, jadi device milik user lain tidak akan
  // pernah bisa dicabut lewat endpoint ini.
  const revoked = await notificationRepo.revokeDevice(userId, deviceId);
  if (!revoked) throw notFound('Device', deviceId);

  return { id: deviceId, revoked: true };
}

// --------------------------------------------------------------------------
// POST /admin/notifications
// --------------------------------------------------------------------------
export async function broadcast(
  actorUserId: string,
  input: SendNotificationInput,
  isStaff: boolean,
) {
  if (!isStaff) throw forbidden('Hanya staff yang dapat mengirim notifikasi massal');
  if (!isNotificationChannel(input.channel)) throw badRequest('Kanal notifikasi tidak valid');

  // Audiens pada endpoint ini berupa satu pengguna; penambahan audiens massal
  // (misalnya seluruh customer aktif) cukup dengan menambah target di sini.
  const targets = [input.userId];
  const scheduledAt = parseDate(input.scheduledAt);

  const queued: Notification[] = [];
  for (const targetUserId of targets) {
    const user = await authRepo.findUserById(targetUserId);
    if (!user) throw notFound('Pengguna', targetUserId);
    if (str(user.status) === 'suspended' || str(user.status) === 'deleted') {
      throw badRequest('Notifikasi tidak dapat dikirim ke akun yang sedang dinonaktifkan');
    }

    // Penulisan notifikasi dilakukan di luar transaksi supaya pengiriman lewat
    // FCM/SMS/email tidak menahan koneksi database. Worker mengambil row berstatus
    // queued lewat claimDueNotifications.
    const row = await notificationRepo.insertNotification({
      userId: targetUserId,
      channel: input.channel,
      title: input.title,
      body: input.body,
      actionUrl: input.actionUrl ?? null,
      scheduledAt,
    });
    if (row) queued.push(shapeNotification(row as unknown as Record<string, unknown>));
  }

  return {
    queued: queued.length,
    channel: input.channel,
    scheduledAt: iso(scheduledAt),
    requestedBy: actorUserId,
    notifications: queued,
  };
}