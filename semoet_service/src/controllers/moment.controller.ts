import type { Request, Response } from 'express';
import { z } from 'zod';
import { MOMENT_MODERATION_STATUS } from '../config/constants.js';
import * as momentService from '../services/moment.service.js';
import { sendCreated, sendNoContent, sendPaginated, sendSuccess } from '../utils/response.js';
import { getBody, getParams, getQuery, getUserId } from '../utils/request.js';
import {
  listMomentQuerySchema,
  moderateMomentSchema,
  type CreateMomentInput,
  type UpdateMomentInput,
} from '../validators/moment.validator.js';
import { uuidSchema } from '../validators/common.validator.js';

/**
 * Halaman moderasi staff butuh filter status yang tidak ada di schema daftar
 * moment publik, jadi schema-nya diperluas di sini (pola yang sama dipakai
 * router katalog untuk endpoint review).
 */
const listMomentModerationQuerySchema = listMomentQuerySchema.extend({
  moderationStatus: z.enum(MOMENT_MODERATION_STATUS).optional(),
});

/**
 * Body moderasi perlu menunjuk moment yang diubah; schema bawaan hanya memuat
 * status dan catatan, jadi id moment diterima pada key `id` maupun `momentId`.
 */
const moderateMomentBodySchema = moderateMomentSchema.extend({
  id: uuidSchema.optional(),
  momentId: uuidSchema.optional(),
});

/** Parse ulang query sebagai fallback bila middleware validate belum jalan. */
function parseListQuery(query: unknown): momentService.ListMomentsQuery {
  const parsed = listMomentModerationQuerySchema.safeParse(query ?? {});
  return (parsed.success ? parsed.data : query) as momentService.ListMomentsQuery;
}

function getMomentId(req: Request): string {
  return getParams<{ id: string }>(req).id;
}

/** User id opsional untuk endpoint publik (hasil optionalAuthenticate). */
function optionalUserId(req: Request): string | null {
  return req.user?.id ?? null;
}

function isStaffRequest(req: Request): boolean {
  return Boolean(req.user?.isStaff);
}

// GET /moments - feed publik (hanya moment approved)
export async function list(req: Request, res: Response): Promise<Response> {
  const result = await momentService.listMoments(
    optionalUserId(req),
    parseListQuery(getQuery(req)),
    isStaffRequest(req),
  );

  return sendPaginated(res, result.items, {
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
  });
}

// GET /moments/:id - detail moment beserta media
export async function detail(req: Request, res: Response): Promise<Response> {
  const data = await momentService.getMomentById(
    getMomentId(req),
    optionalUserId(req),
    isStaffRequest(req),
  );
  return sendSuccess(res, data);
}

// POST /moments - membuat moment baru (status pending untuk moderasi)
export async function create(req: Request, res: Response): Promise<Response> {
  const body = getBody<CreateMomentInput>(req);
  const data = await momentService.createMoment(getUserId(req), body);
  return sendCreated(res, data);
}

// PATCH /moments/:id - pemilik moment saja
export async function update(req: Request, res: Response): Promise<Response> {
  const body = getBody<UpdateMomentInput>(req);
  const data = await momentService.updateMoment(getUserId(req), getMomentId(req), body);
  return sendSuccess(res, data);
}

// DELETE /moments/:id - pemilik moment saja
export async function remove(req: Request, res: Response): Promise<Response> {
  await momentService.removeMoment(getUserId(req), getMomentId(req));
  return sendNoContent(res);
}

// PATCH /admin/moments/moderate - staff memoderasi moment
export async function moderate(req: Request, res: Response): Promise<Response> {
  const body = getBody<z.infer<typeof moderateMomentBodySchema>>(req);
  // Path ini tidak punya segmen :id, jadi moment ditunjuk lewat body (id atau
  // momentId). Query id/momentId diterima sebagai fallback.
  const params = getQuery<{ id?: string; momentId?: string }>(req);
  const momentId = body.id ?? body.momentId ?? params.momentId ?? params.id;

  const data = await momentService.moderateMoment(getUserId(req), momentId, {
    moderationStatus: body.moderationStatus,
    note: body.note,
  });
  return sendSuccess(res, data);
}