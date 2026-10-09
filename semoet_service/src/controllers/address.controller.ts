import type { Request, Response } from 'express';
import * as addressService from '../services/address.service.js';
import { sendPaginated, sendSuccess } from '../utils/response.js';
import { getBody, getParams, getQuery, getUserId } from '../utils/request.js';
import type {
  CreateAddressInput,
  ListAddressQuery,
  UpdateAddressInput,
} from '../validators/user.validator.js';
import { sendCreated } from '../utils/response.js';

export async function list(req: Request, res: Response): Promise<Response> {
  const userId = getUserId(req);
  const query = getQuery<ListAddressQuery>(req);
  const result = await addressService.listAddresses(userId, query);
  return sendPaginated(res, result.items, {
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
  });
}

export async function create(req: Request, res: Response): Promise<Response> {
  const userId = getUserId(req);
  const body = getBody<CreateAddressInput>(req);
  const data = await addressService.createAddress(userId, body);
  return sendCreated(res, data);
}

export async function detail(req: Request, res: Response): Promise<Response> {
  const userId = getUserId(req);
  const { id } = getParams<{ id: string }>(req);
  const data = await addressService.getAddress(userId, id);
  return sendSuccess(res, data);
}

export async function update(req: Request, res: Response): Promise<Response> {
  const userId = getUserId(req);
  const { id } = getParams<{ id: string }>(req);
  const body = getBody<UpdateAddressInput>(req);
  const data = await addressService.updateAddress(userId, id, body);
  return sendSuccess(res, data);
}

export async function remove(req: Request, res: Response): Promise<Response> {
  const userId = getUserId(req);
  const { id } = getParams<{ id: string }>(req);
  await addressService.deleteAddress(userId, id);
  return sendSuccess(res, { deleted: true });
}

export async function setDefault(req: Request, res: Response): Promise<Response> {
  const userId = getUserId(req);
  const { id } = getParams<{ id: string }>(req);
  const data = await addressService.setDefaultAddress(userId, id);
  return sendSuccess(res, data);
}