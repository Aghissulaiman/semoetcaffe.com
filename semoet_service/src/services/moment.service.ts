import {
  MOMENT_MODERATION_STATUS,
  type MomentModerationStatus,
} from '../config/constants.js';
import { withTransaction } from '../config/database.js';
import { badRequest, forbidden, notFound } from '../errors/AppError.js';
import * as momentRepo from '../repositories/moment.repository.js';
import { sendPush } from '../utils/notifier.js';
import {
  buildPaginationMeta,
  parsePagination,
  type Pagination,
} from '../utils/pagination.js';
import { iso, num, str, strOrNull } from '../utils/serialize.js';
import type {
  CreateMomentInput,
  ListMomentQuery,
  UpdateMomentInput,
} from '../validators/moment.validator.js';

export interface Paginated<T> {
  items: T[];
  meta: ReturnType<typeof buildPaginationMeta>;
}

/** Batas jumlah media per moment, mengikuti aturan schema createMomentSchema. */
const MAX_MEDIA_PER_MOMENT = 10;

export interface MomentMedia {
  id: string | null;
  storageKey: string;
  publicUrl: string | null;
  mediaType: string;
  sortOrder: number;
}

export interface Moment {
  id: string;
  userId: string | null;
  authorName: string | null;
  title: string | null;
  caption: string | null;
  eventType: string | null;
  moderationStatus: string;
  createdAt: string | null;
  /** True bila moment ini milik pengguna yang sedang login. */
  isOwner: boolean;
  media: MomentMedia[];
}

/**
 * Query daftar moment. `moderationStatus` hanya dipakai halaman moderasi staff,
 * jadi ditambahkan di sini (schema daftar moment publik tidak menyertakannya).
 */
export type ListMomentsQuery = ListMomentQuery & {
  moderationStatus?: MomentModerationStatus;
};

export interface ModerateMomentInput {
  moderationStatus: MomentModerationStatus;
  note?: string;
}

/** Pesan yang dikirim ke penulis moment setiap kali status moderasi berubah. */
const MODERATION_MESSAGE: Record<MomentModerationStatus, string> = {
  pending: 'Moment Anda sedang ditinjau moderator.',
  approved: 'Moment Anda sudah disetujui dan tayang di feed komunitas.',
  rejected: 'Moment Anda ditolak moderator. Mohon periksa kembali isi moment.',
  hidden: 'Moment Anda disembunyikan dari feed komunitas.',
};

// --------------------------------------------------------------------------
// Helper shaping
// --------------------------------------------------------------------------
function shapeMedia(row: Record<string, unknown>): MomentMedia {
  return {
    id: strOrNull(row.id),
    storageKey: str(row.storageKey),
    publicUrl: strOrNull(row.publicUrl),
    mediaType: str(row.mediaType ?? 'image', 'image'),
    sortOrder: num(row.sortOrder),
  };
}

/**
 * Daftar media bisa berasal dari jsonb (query list) maupun dari baris media
 * terpisah (query detail), keduanya sudah memakai key camelCase.
 */
function shapeMediaList(value: unknown): MomentMedia[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => shapeMedia(item as Record<string, unknown>));
}

function shapeMoment(
  row: Record<string, unknown>,
  media: MomentMedia[],
  viewerId: string | null,
): Moment {
  const userId = strOrNull(row.userId);
  return {
    id: str(row.id),
    userId,
    authorName: strOrNull(row.authorName),
    title: strOrNull(row.title),
    caption: strOrNull(row.caption),
    eventType: strOrNull(row.eventType),
    moderationStatus: str(row.moderationStatus),
    createdAt: iso(row.createdAt),
    isOwner: viewerId !== null && userId === viewerId,
    media,
  };
}

function isModerationStatus(value: string): value is MomentModerationStatus {
  return (MOMENT_MODERATION_STATUS as readonly string[]).includes(value);
}

/**
 * Feed publik hanya menampilkan moment yang sudah `approved`. Staff boleh
 * melihat seluruh status (atau memfilter per status), sedangkan pemilik tetap
 * melihat moment miliknya sendiri walau masih pending/hidden/rejected.
 */
function resolveModerationFilter(
  requested: MomentModerationStatus | undefined,
  isMine: boolean,
  isStaff: boolean,
): string | undefined {
  if (requested) {
    if (!isStaff) throw forbidden('Filter status moderasi hanya bisa dipakai oleh staff');
    return requested;
  }
  if (isStaff || isMine) return undefined;
  return 'approved';
}

// --------------------------------------------------------------------------
// GET /moments
// --------------------------------------------------------------------------
export async function listMoments(
  viewerId: string | null,
  query: ListMomentsQuery,
  isStaff = false,
): Promise<Paginated<Moment>> {
  if (query.mine && !viewerId) {
    throw badRequest('Filter mine hanya bisa dipakai oleh user yang sudah login');
  }

  const isMine = query.mine === true;
  const paging = parsePagination(query);
  const filters: momentRepo.ListMomentFilters = {
    eventType: query.eventType,
    userId: isMine ? viewerId ?? undefined : query.userId,
    moderationStatus: resolveModerationFilter(query.moderationStatus, isMine, isStaff),
  };

  const rows = await momentRepo.listMoments(filters, paging);
  const total = await momentRepo.countMoments(filters);
  const pagination: Pagination = {
    page: paging.page,
    limit: paging.limit,
    offset: paging.offset,
    total,
  };

  return {
    items: rows.map((row) => shapeMoment(row, shapeMediaList(row.media), viewerId)),
    meta: buildPaginationMeta(pagination),
  };
}

// --------------------------------------------------------------------------
// GET /moments/:id
// --------------------------------------------------------------------------
export async function getMomentById(
  momentId: string,
  viewerId: string | null,
  isStaff = false,
): Promise<Moment> {
  const found = await momentRepo.findMomentWithMedia(momentId);
  if (!found) throw notFound('Moment', momentId);

  const row = found as unknown as Record<string, unknown>;
  const isOwner = viewerId !== null && strOrNull(row.userId) === viewerId;

  // Moment yang belum lolos moderasi hanya terlihat oleh pemiliknya dan staff.
  if (str(row.moderationStatus) !== 'approved' && !isOwner && !isStaff) {
    throw notFound('Moment', momentId);
  }

  return shapeMoment(row, shapeMediaList(found.media), viewerId);
}

// --------------------------------------------------------------------------
// POST /moments
// --------------------------------------------------------------------------
export async function createMoment(
  userId: string,
  input: CreateMomentInput,
): Promise<Moment> {
  const media = input.media ?? [];

  // Schema sudah memvalidasi bentuk payload, aturan domain tetap dijaga di service.
  if (!input.caption && media.length === 0) {
    throw badRequest('Caption atau minimal satu media wajib diisi');
  }
  if (media.length > MAX_MEDIA_PER_MOMENT) {
    throw badRequest(`Maksimal ${MAX_MEDIA_PER_MOMENT} media pada satu moment`);
  }

  return withTransaction(async (tx) => {
    const created = await momentRepo.insertMoment(
      {
        userId,
        title: input.title ?? null,
        caption: input.caption ?? null,
        eventType: input.eventType ?? null,
        // Moment baru selalu menunggu hasil moderasi sebelum tampil di feed publik.
        moderationStatus: 'pending',
      },
      tx,
    );

    const row = created as unknown as Record<string, unknown> | null;
    const momentId = str(row?.id);
    if (!row || !momentId) throw badRequest('Moment gagal disimpan');

    const savedMedia: MomentMedia[] = [];
    for (const [index, item] of media.entries()) {
      const sortOrder = item.sortOrder ?? index;
      await momentRepo.insertMomentMedia(
        {
          momentId,
          storageKey: item.storageKey,
          publicUrl: item.publicUrl ?? null,
          mediaType: item.mediaType,
          sortOrder,
        },
        tx,
      );
      savedMedia.push({
        id: null,
        storageKey: item.storageKey,
        publicUrl: item.publicUrl ?? null,
        mediaType: item.mediaType,
        sortOrder,
      });
    }

    return shapeMoment(row, savedMedia, userId);
  });
}

// --------------------------------------------------------------------------
// PATCH /moments/:id
// --------------------------------------------------------------------------
export async function updateMoment(
  userId: string,
  momentId: string,
  input: UpdateMomentInput,
): Promise<Moment> {
  const current = await momentRepo.findMomentById(momentId);
  if (!current) throw notFound('Moment', momentId);
  if (str(current.userId) !== userId) {
    throw forbidden('Hanya pemilik moment yang dapat mengubah moment ini');
  }

  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.caption !== undefined) data.caption = input.caption;
  if (input.eventType !== undefined) data.event_type = input.eventType;
  if (Object.keys(data).length === 0) throw badRequest('Minimal satu field harus dikirim');

  // Isi moment yang berubah wajib ditinjau ulang oleh moderator.
  data.moderation_status = 'pending';

  const updated = await momentRepo.updateMoment(momentId, userId, data);
  if (!updated) throw notFound('Moment', momentId);

  const media = await momentRepo.listMomentMedia(momentId);
  return shapeMoment(updated as unknown as Record<string, unknown>, media.map(shapeMedia), userId);
}

// --------------------------------------------------------------------------
// DELETE /moments/:id
// --------------------------------------------------------------------------
export async function removeMoment(
  userId: string,
  momentId: string,
): Promise<{ id: string; deleted: boolean }> {
  const current = await momentRepo.findMomentById(momentId);
  if (!current) throw notFound('Moment', momentId);
  if (str(current.userId) !== userId) {
    throw forbidden('Hanya pemilik moment yang dapat menghapus moment ini');
  }

  // Baris media ikut terhapus melalui cascade foreign key di tabel moment.
  const removed = await momentRepo.deleteMoment(momentId, userId);
  if (!removed) throw notFound('Moment', momentId);

  return { id: momentId, deleted: true };
}

// --------------------------------------------------------------------------
// PATCH /admin/moments/moderate
// --------------------------------------------------------------------------
export async function moderateMoment(
  actorUserId: string,
  momentId: string | null | undefined,
  input: ModerateMomentInput,
) {
  if (!momentId) throw badRequest('id moment wajib diisi');
  if (!isModerationStatus(input.moderationStatus)) {
    throw badRequest('Status moderasi tidak valid');
  }

  const current = await momentRepo.findMomentById(momentId);
  if (!current) throw notFound('Moment', momentId);

  const previousStatus = str(current.moderationStatus);
  const updated = await momentRepo.moderateMoment(momentId, input.moderationStatus);
  if (!updated) throw notFound('Moment', momentId);

  const authorId = strOrNull(current.userId);
  const media = await momentRepo.listMomentMedia(momentId);

  // Notifikasi dikirim setelah perubahan status tersimpan, bukan di dalam transaksi.
  if (authorId && authorId !== actorUserId) {
    const note = input.note?.trim();
    const message = MODERATION_MESSAGE[input.moderationStatus];
    await sendPush({
      userId: authorId,
      title: 'Status moment diperbarui',
      body: note ? `${message} Catatan moderator: ${note}` : message,
      actionUrl: `/moments/${momentId}`,
    });
  }

  return {
    moment: shapeMoment(
      updated as unknown as Record<string, unknown>,
      media.map(shapeMedia),
      actorUserId,
    ),
    previousModerationStatus: previousStatus,
    changed: previousStatus !== input.moderationStatus,
    note: input.note ?? null,
    moderatedBy: actorUserId,
  };
}