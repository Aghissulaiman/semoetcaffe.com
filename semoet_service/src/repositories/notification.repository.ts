import { db, many, one, scalar, type Exec } from './base.js';
import { paginationSql, type Paging } from '../utils/pagination.js';

const NOTIFICATION_COLUMNS = `
  n.id, n.channel, n.title, n.body, n.action_url, n.status,
  n.scheduled_at, n.sent_at, n.read_at, n.created_at
`;

export interface ListNotificationFilters {
  channel?: string;
  status?: string;
  unreadOnly?: boolean;
}

export async function listNotifications(
  userId: string,
  filters: ListNotificationFilters,
  pagination: Paging,
  executor: Exec = db,
) {
  return many(
    executor,
    `SELECT ${NOTIFICATION_COLUMNS}
       FROM notifications n
      WHERE n.user_id = $1
        AND ($2::text IS NULL OR n.channel = $2)
        AND ($3::text IS NULL OR n.status = $3)
        AND ($4::boolean = false OR n.read_at IS NULL)
      ORDER BY n.created_at DESC
      ${paginationSql(pagination)}`,
    [userId, filters.channel ?? null, filters.status ?? null, filters.unreadOnly ?? false],
  );
}

export async function countNotifications(
  userId: string,
  filters: ListNotificationFilters,
  executor: Exec = db,
) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int
       FROM notifications n
      WHERE n.user_id = $1
        AND ($2::text IS NULL OR n.channel = $2)
        AND ($3::text IS NULL OR n.status = $3)
        AND ($4::boolean = false OR n.read_at IS NULL)`,
    [userId, filters.channel ?? null, filters.status ?? null, filters.unreadOnly ?? false],
  );
  return Number(value ?? 0);
}

export async function countUnread(userId: string, executor: Exec = db) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
    [userId],
  );
  return Number(value ?? 0);
}

export async function findNotification(userId: string, notificationId: string, executor: Exec = db) {
  return one(executor, `SELECT ${NOTIFICATION_COLUMNS} FROM notifications n WHERE n.id = $1 AND n.user_id = $2`, [
    notificationId,
    userId,
  ]);
}

export async function markNotificationRead(userId: string, notificationId: string, executor: Exec = db) {
  return one(
    executor,
    `UPDATE notifications
        SET read_at = COALESCE(read_at, now()), status = CASE WHEN status = 'sent' THEN 'read' ELSE status END
      WHERE id = $1 AND user_id = $2
      RETURNING ${NOTIFICATION_COLUMNS}`,
    [notificationId, userId],
  );
}

export async function markAllNotificationsRead(userId: string, executor: Exec = db) {
  const result = await executor.query(
    `UPDATE notifications
        SET read_at = now(), status = CASE WHEN status = 'sent' THEN 'read' ELSE status END
      WHERE user_id = $1 AND read_at IS NULL`,
    [userId],
  );
  return result.rowCount ?? 0;
}

export async function markNotificationsRead(
  userId: string,
  notificationIds: string[],
  executor: Exec = db,
) {
  if (notificationIds.length === 0) return [];
  return many(
    executor,
    `UPDATE notifications
        SET read_at = COALESCE(read_at, now()), status = CASE WHEN status = 'sent' THEN 'read' ELSE status END
      WHERE user_id = $1 AND id = ANY($2::uuid[])
      RETURNING ${NOTIFICATION_COLUMNS}`,
    [userId, notificationIds],
  );
}

export async function insertNotification(
  input: {
    userId: string;
    channel: string;
    title: string;
    body: string;
    actionUrl?: string | null;
    scheduledAt?: Date | null;
  },
  executor: Exec = db,
) {
  return one(
    executor,
    `INSERT INTO notifications (user_id, channel, title, body, action_url, scheduled_at)
     VALUES ($1,$2,$3,$4,$5,COALESCE($6, now()))
     RETURNING ${NOTIFICATION_COLUMNS}`,
    [input.userId, input.channel, input.title, input.body, input.actionUrl ?? null, input.scheduledAt ?? null],
  );
}

/** Worker notifikasi: ambil yang jatuh tempo untuk dikirim. */
export async function claimDueNotifications(limit: number, executor: Exec = db) {
  return many(
    executor,
    `UPDATE notifications
        SET status = 'sent', sent_at = now()
      WHERE id IN (
        SELECT id FROM notifications
         WHERE status = 'queued' AND scheduled_at <= now()
         ORDER BY scheduled_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED
      )
      RETURNING ${NOTIFICATION_COLUMNS}`,
    [limit],
  );
}

// --------------------------------------------------------------------------
// Devices (notification_devices)
// --------------------------------------------------------------------------
export async function listDevices(userId: string, pagination: Paging, provider?: string, executor: Exec = db) {
  return many(
    executor,
    `SELECT id, user_id, provider, device_label, last_seen_at, revoked_at, created_at
       FROM notification_devices
      WHERE user_id = $1
        AND revoked_at IS NULL
        AND ($2::text IS NULL OR provider = $2)
      ORDER BY last_seen_at DESC
      ${paginationSql(pagination)}`,
    [userId, provider ?? null],
  );
}

export async function countDevices(userId: string, executor: Exec = db) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int FROM notification_devices WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId],
  );
  return Number(value ?? 0);
}

/**
 * Token FCM bisa berubah ( reinstall app) dan bisa dipakai satu akun saja,
 * jadi token_hash UNIQUE di level tabel: takeover memindahkan kepemilikan token.
 */
export async function upsertDevice(
  input: { userId: string; provider: string; tokenHash: string; deviceLabel?: string | null },
  executor: Exec = db,
) {
  return one(
    executor,
    `INSERT INTO notification_devices (user_id, provider, token_hash, device_label, last_seen_at)
     VALUES ($1,$2,$3,$4, now())
     ON CONFLICT (token_hash) DO UPDATE
       SET user_id = EXCLUDED.user_id,
           device_label = EXCLUDED.device_label,
           last_seen_at = now(),
           revoked_at = NULL
     RETURNING id, user_id, provider, device_label, last_seen_at, revoked_at`,
    [input.userId, input.provider, input.tokenHash, input.deviceLabel ?? null],
  );
}

export async function revokeDevice(userId: string, deviceId: string, executor: Exec = db) {
  const row = await one<{ id: string }>(
    executor,
    `UPDATE notification_devices SET revoked_at = now() WHERE id = $1 AND user_id = $2 RETURNING id`,
    [deviceId, userId],
  );
  return Boolean(row);
}

export async function findDevicesForUsers(userIds: string[], executor: Exec = db) {
  if (userIds.length === 0) return [];
  return many<{ userId: string; tokenHash: string; provider: string }>(
    executor,
    `SELECT user_id, provider, token_hash FROM notification_devices
      WHERE user_id = ANY($1::uuid[]) AND revoked_at IS NULL`,
    [userIds],
  );
}