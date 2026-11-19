import { db, many, one, scalar, type Exec } from './base.js';
import { paginationSql, type Paging } from '../utils/pagination.js';

const MOMENT_COLUMNS = `
  sm.id, sm.user_id, sm.title, sm.caption, sm.event_type, sm.moderation_status, sm.created_at
`;

export interface ListMomentFilters {
  eventType?: string;
  userId?: string;
  /** Endpoint publik: hanya approved. Endpoint staff: semua. */
  moderationStatus?: string;
}

export async function listMoments(
  filters: ListMomentFilters,
  pagination: Paging,
  executor: Exec = db,
) {
  return many(
    executor,
    `SELECT ${MOMENT_COLUMNS},
            u.display_name AS author_name,
            media.list AS media
       FROM semoet_moments sm
       LEFT JOIN users u ON u.id = sm.user_id
       LEFT JOIN LATERAL (
         SELECT jsonb_agg(jsonb_build_object(
                  'id', smm.id, 'storageKey', smm.storage_key, 'publicUrl', smm.public_url,
                  'mediaType', smm.media_type, 'sortOrder', smm.sort_order
                ) ORDER BY smm.sort_order ASC) AS list
           FROM semoet_moment_media smm
          WHERE smm.moment_id = sm.id
       ) media ON true
      WHERE ($1::text IS NULL OR sm.event_type = $1)
        AND ($2::uuid IS NULL OR sm.user_id = $2)
        AND ($3::text IS NULL OR sm.moderation_status = $3)
      ORDER BY sm.created_at DESC
      ${paginationSql(pagination)}`,
    [filters.eventType ?? null, filters.userId ?? null, filters.moderationStatus ?? null],
  );
}

export async function countMoments(filters: ListMomentFilters, executor: Exec = db) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int
       FROM semoet_moments sm
      WHERE ($1::text IS NULL OR sm.event_type = $1)
        AND ($2::uuid IS NULL OR sm.user_id = $2)
        AND ($3::text IS NULL OR sm.moderation_status = $3)`,
    [filters.eventType ?? null, filters.userId ?? null, filters.moderationStatus ?? null],
  );
  return Number(value ?? 0);
}

export async function findMomentById(momentId: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT ${MOMENT_COLUMNS},
            u.display_name AS author_name
       FROM semoet_moments sm
       LEFT JOIN users u ON u.id = sm.user_id
      WHERE sm.id = $1`,
    [momentId],
  );
}

export async function findMomentWithMedia(momentId: string, executor: Exec = db) {
  const moment = await findMomentById(momentId, executor);
  if (!moment) return null;
  const media = await listMomentMedia(momentId, executor);
  return { ...moment, media };
}

export async function listMomentMedia(momentId: string, executor: Exec = db) {
  return many(
    executor,
    `SELECT id, moment_id, storage_key, public_url, media_type, sort_order, created_at
       FROM semoet_moment_media
      WHERE moment_id = $1
      ORDER BY sort_order ASC`,
    [momentId],
  );
}

export async function insertMoment(
  input: { userId: string | null; title?: string | null; caption?: string | null; eventType?: string | null; moderationStatus: string },
  executor: Exec,
) {
  return one<{ id: string }>(
    executor,
    `INSERT INTO semoet_moments AS sm (user_id, title, caption, event_type, moderation_status)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING ${MOMENT_COLUMNS}`,
    [input.userId, input.title ?? null, input.caption ?? null, input.eventType ?? null, input.moderationStatus],
  );
}

export async function insertMomentMedia(
  input: { momentId: string; storageKey: string; publicUrl?: string | null; mediaType: string; sortOrder: number },
  executor: Exec,
) {
  await executor.query(
    `INSERT INTO semoet_moment_media (moment_id, storage_key, public_url, media_type, sort_order)
     VALUES ($1,$2,$3,$4,$5)`,
    [input.momentId, input.storageKey, input.publicUrl ?? null, input.mediaType, input.sortOrder],
  );
}

export async function updateMoment(
  momentId: string,
  userId: string | null,
  data: Record<string, unknown>,
  executor: Exec = db,
) {
  const columns = Object.keys(data);
  if (columns.length === 0) return null;
  const assignments = columns.map((column, index) => `${column} = $${index + 3}`).join(', ');
  return one(
    executor,
    `UPDATE semoet_moments sm SET ${assignments}
      WHERE sm.id = $1 AND ($2::uuid IS NULL OR sm.user_id = $2)
      RETURNING ${MOMENT_COLUMNS}`,
    [momentId, userId, ...Object.values(data)],
  );
}

export async function moderateMoment(momentId: string, moderationStatus: string, executor: Exec = db) {
  return one(
    executor,
    `UPDATE semoet_moments sm SET moderation_status = $2 WHERE sm.id = $1 RETURNING ${MOMENT_COLUMNS}`,
    [momentId, moderationStatus],
  );
}

export async function deleteMoment(momentId: string, userId: string | null, executor: Exec = db) {
  const row = await one<{ id: string }>(
    executor,
    `DELETE FROM semoet_moments sm WHERE sm.id = $1 AND ($2::uuid IS NULL OR sm.user_id = $2) RETURNING id`,
    [momentId, userId],
  );
  return Boolean(row);
}

export async function deleteMomentMedia(momentId: string, executor: Exec) {
  await executor.query(`DELETE FROM semoet_moment_media WHERE moment_id = $1`, [momentId]);
}

/** Jumlah moment per status - untuk badge moderasi di admin. */
export async function countMomentsByStatus(executor: Exec = db) {
  return many<{ moderationStatus: string; total: number }>(
    executor,
    `SELECT moderation_status, COUNT(*)::int AS total
       FROM semoet_moments
      GROUP BY moderation_status`,
  );
}

// --------------------------------------------------------------------------
// Admin: list all moments with filters
// --------------------------------------------------------------------------
export interface ListAdminMomentFilters {
  moderationStatus?: string;
  q?: string;
}

export async function listAdminMoments(
  filters: ListAdminMomentFilters,
  pagination: { page: number; limit: number; offset: number },
  executor: Exec = db,
) {
  return many(
    executor,
    `SELECT ${MOMENT_COLUMNS},
            u.display_name AS author_name, u.email AS author_email,
            media.list AS media
       FROM semoet_moments sm
       LEFT JOIN users u ON u.id = sm.user_id
       LEFT JOIN LATERAL (
         SELECT jsonb_agg(jsonb_build_object(
                  'id', smm.id, 'storageKey', smm.storage_key, 'publicUrl', smm.public_url,
                  'mediaType', smm.media_type, 'sortOrder', smm.sort_order
                ) ORDER BY smm.sort_order ASC) AS list
           FROM semoet_moment_media smm
          WHERE smm.moment_id = sm.id
       ) media ON true
      WHERE ($1::text IS NULL OR sm.moderation_status = $1)
        AND ($2::text IS NULL OR u.display_name ILIKE '%' || $2 || '%'
                          OR u.email ILIKE '%' || $2 || '%'
                          OR sm.title ILIKE '%' || $2 || '%'
                          OR sm.caption ILIKE '%' || $2 || '%')
      ORDER BY sm.created_at DESC
      ${paginationSql(pagination)}`,
    [filters.moderationStatus ?? null, filters.q ?? null],
  );
}

export async function countAdminMoments(filters: ListAdminMomentFilters, executor: Exec = db) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int
       FROM semoet_moments sm
       LEFT JOIN users u ON u.id = sm.user_id
      WHERE ($1::text IS NULL OR sm.moderation_status = $1)
        AND ($2::text IS NULL OR u.display_name ILIKE '%' || $2 || '%'
                          OR u.email ILIKE '%' || $2 || '%'
                          OR sm.title ILIKE '%' || $2 || '%'
                          OR sm.caption ILIKE '%' || $2 || '%')`,
    [filters.moderationStatus ?? null, filters.q ?? null],
  );
  return Number(value ?? 0);
}