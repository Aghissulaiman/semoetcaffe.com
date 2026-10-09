import type { Request, Response } from 'express';
import * as reviewService from '../services/review.service.js';
import { sendCreated, sendNoContent, sendPaginated, sendSuccess } from '../utils/response.js';
import { getBody, getParams, getQuery, getUserId } from '../utils/request.js';
import type { CreateReviewInput, ListMyReviewQuery } from '../validators/review.validator.js';

// POST /reviews
export async function create(req: Request, res: Response): Promise<Response> {
  const userId = getUserId(req);
  const body = getBody<CreateReviewInput>(req);
  const data = await reviewService.createReview(userId, body);
  return sendCreated(res, data);
}

// GET /me/reviews
export async function listMine(req: Request, res: Response): Promise<Response> {
  const userId = getUserId(req);
  const query = getQuery<ListMyReviewQuery>(req);
  const result = await reviewService.listMyReviews(userId, query);

  return sendPaginated(res, result.items, {
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
  });
}

// PATCH /me/reviews/:id
export async function update(req: Request, res: Response): Promise<Response> {
  const userId = getUserId(req);
  const { id } = getParams<{ id: string }>(req);
  const body = getBody<reviewService.UpdateReviewInput>(req);
  const data = await reviewService.updateReview(userId, id, body);
  return sendSuccess(res, data);
}

// DELETE /me/reviews/:id
export async function remove(req: Request, res: Response): Promise<Response> {
  const userId = getUserId(req);
  const { id } = getParams<{ id: string }>(req);
  await reviewService.deleteReview(userId, id);
  return sendNoContent(res);
}