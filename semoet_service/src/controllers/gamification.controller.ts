import type { Request, Response } from 'express';
import * as gamificationService from '../services/gamification.service.js';
import { sendCreated, sendPaginated, sendSuccess } from '../utils/response.js';
import { getBody, getIdempotencyKey, getParams, getQuery, getUserId } from '../utils/request.js';
import {
  activityCodeParamSchema,
  type ListActivityQuery,
  type ListPlayHistoryQuery,
  type PlayActivityInput,
} from '../validators/gamification.validator.js';

/** Param code aktivitas sudah diuppercase oleh activityCodeParamSchema. */
function getActivityCode(req: Request): string {
  const params = getParams<{ code: string }>(req);
  const parsed = activityCodeParamSchema.safeParse(params);
  return parsed.success ? parsed.data.code : params.code;
}

// GET /gamification/activities (publik: katalog aktivitas yang aktif)
export async function listActivities(req: Request, res: Response): Promise<Response> {
  const result = await gamificationService.listActivities(getQuery<ListActivityQuery>(req));

  return sendPaginated(res, result.items, {
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
  });
}

// GET /gamification/activities/:code (publik: detail aktivitas beserta hadiahnya)
export async function activityDetail(req: Request, res: Response): Promise<Response> {
  const data = await gamificationService.getActivityDetail(
    getActivityCode(req),
    req.user?.id ?? null,
  );
  return sendSuccess(res, data);
}

// POST /gamification/play (mainkan aktivitas dan dapatkan hadiah)
export async function play(req: Request, res: Response): Promise<Response> {
  const data = await gamificationService.playActivity(
    getUserId(req),
    getBody<PlayActivityInput>(req),
    { idempotencyKey: getIdempotencyKey(req) },
  );
  return sendCreated(res, data);
}

// GET /me/gamification/history (riwayat main milik user yang login)
export async function history(req: Request, res: Response): Promise<Response> {
  const result = await gamificationService.listPlayHistory(
    getUserId(req),
    getQuery<ListPlayHistoryQuery>(req),
  );

  return sendPaginated(
    res,
    result.items,
    {
      page: result.meta.page,
      limit: result.meta.limit,
      total: result.meta.total,
    },
    { totalPointsFromGames: result.totalPointsFromGames },
  );
}
