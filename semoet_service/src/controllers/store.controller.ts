import type { Request, Response } from 'express';
import * as storeService from '../services/store.service.js';
import { sendSuccess } from '../utils/response.js';
import { getBody, getQuery, getUserId } from '../utils/request.js';
import type {
  PublicStoreQuery,
  StoreQuery,
  UpdateStoreScheduleInput,
  UpdateStoreStatusInput,
} from '../validators/store.validator.js';

// GET /admin/store?branchId=...
export async function get(req: Request, res: Response): Promise<Response> {
  const query = getQuery<StoreQuery>(req);
  const data = await storeService.getStore(query.branchId);
  return sendSuccess(res, data);
}

// GET /store/status?branchId=...
export async function getPublicStatus(
  req: Request,
  res: Response,
): Promise<Response> {
  const query = getQuery<PublicStoreQuery>(req);
  const data = await storeService.getPublicStoreStatus(query.branchId);
  return sendSuccess(res, data);
}

// PATCH /admin/store/status
export async function updateStatus(
  req: Request,
  res: Response,
): Promise<Response> {
  const body = getBody<UpdateStoreStatusInput>(req);
  const data = await storeService.updateStoreStatus(getUserId(req), body);
  return sendSuccess(res, data);
}

// PUT /admin/store/schedule
export async function updateSchedule(
  req: Request,
  res: Response,
): Promise<Response> {
  const body = getBody<UpdateStoreScheduleInput>(req);
  const data = await storeService.updateStoreSchedule(getUserId(req), body);
  return sendSuccess(res, data);
}
