import type { Request, Response } from 'express';
import * as loyaltyService from '../services/loyalty.service.js';
import { sendCreated, sendPaginated, sendSuccess } from '../utils/response.js';
import { getBody, getIdempotencyKey, getQuery, getUserId } from '../utils/request.js';
import type {
  ListRedemptionQuery,
  ListRewardQuery,
  PointsHistoryQuery,
  RedeemRewardInput,
} from '../validators/loyalty.validator.js';

// GET /me/points (saldo, total poin, dan tier user)
export async function getPoints(req: Request, res: Response): Promise<Response> {
  const data = await loyaltyService.getPoints(getUserId(req));
  return sendSuccess(res, data);
}

// GET /me/points/history (mutasi poin, dipaginasi)
export async function listPointsHistory(req: Request, res: Response): Promise<Response> {
  const result = await loyaltyService.listPointsHistory(
    getUserId(req),
    getQuery<PointsHistoryQuery>(req),
  );

  return sendPaginated(res, result.items, {
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
  });
}

// GET /loyalty/rewards (katalog hadiah yang bisa ditukar dengan poin)
export async function listRewards(req: Request, res: Response): Promise<Response> {
  const result = await loyaltyService.listRewards(getQuery<ListRewardQuery>(req));

  return sendPaginated(res, result.items, {
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
  });
}

// POST /loyalty/redeem (tukar poin dengan hadiah)
export async function redeemReward(req: Request, res: Response): Promise<Response> {
  const data = await loyaltyService.redeemReward(
    getUserId(req),
    getBody<RedeemRewardInput>(req),
    { idempotencyKey: getIdempotencyKey(req) },
  );

  return sendCreated(res, data);
}

// GET /me/redemptions (riwayat penukaran poin, dipaginasi)
export async function listRedemptions(req: Request, res: Response): Promise<Response> {
  const result = await loyaltyService.listRedemptions(
    getUserId(req),
    getQuery<ListRedemptionQuery>(req),
  );

  return sendPaginated(res, result.items, {
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
  });
}