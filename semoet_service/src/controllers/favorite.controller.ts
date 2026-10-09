import type { Request, Response } from 'express';
import * as favoriteService from '../services/favorite.service.js';
import { sendCreated, sendPaginated, sendSuccess } from '../utils/response.js';
import { getBody, getParams, getQuery, getUserId } from '../utils/request.js';
import type { AddFavoriteInput, ListFavoriteQuery } from '../validators/user.validator.js';
import { addFavoriteSchema } from '../validators/user.validator.js';
export type { AddFavoriteInput } from '../validators/user.validator.js';

export async function list(req: Request, res: Response): Promise<Response> {
  const userId = getUserId(req);
  const query = getQuery<ListFavoriteQuery>(req);
  const result = await favoriteService.listFavorites(userId, query);
  return sendPaginated(res, result.items, {
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
  });
}

export async function add(req: Request, res: Response): Promise<Response> {
  const userId = getUserId(req);
  const body = getBody<AddFavoriteInput>(req);
  const data = await favoriteService.addFavorite(userId, body);
  return sendCreated(res, data);
}

export async function remove(req: Request, res: Response): Promise<Response> {
  const userId = getUserId(req);
  const { productId } = getParams<{ productId: string }>(req);
  await favoriteService.removeFavorite(userId, productId);
  return sendSuccess(res, { deleted: true });
}

export async function ids(req: Request, res: Response): Promise<Response> {
  const userId = getUserId(req);
  const productIds = getQuery<{ productIds?: string | string[] }>(req)?.productIds;
  let idsArray: string[] = [];
  if (Array.isArray(productIds)) {
    idsArray = productIds;
  } else if (typeof productIds === 'string') {
    idsArray = productIds.split(',').filter(Boolean);
  }
  const data = await favoriteService.getFavoriteIds(userId, idsArray);
  return sendSuccess(res, data);
}