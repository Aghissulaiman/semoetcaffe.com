import type { Request, Response } from 'express';
import * as familyService from '../services/family.service.js';
import { sendCreated, sendPaginated, sendSuccess } from '../utils/response.js';
import { getBody, getParams, getQuery, getUserId } from '../utils/request.js';
import type {
  CreateFamilyMemberInput,
  ListFavoriteQuery,
  UpdateFamilyMemberInput,
} from '../validators/user.validator.js';

export async function getFamily(req: Request, res: Response): Promise<Response> {
  const userId = getUserId(req);
  const data = await familyService.getFamily(userId);
  return sendSuccess(res, data);
}

export async function updateFamily(req: Request, res: Response): Promise<Response> {
  const userId = getUserId(req);
  const body = getBody<{ name: string }>(req);
  const data = await familyService.updateFamily(userId, { name: body.name } as any);
  return sendSuccess(res, data);
}

export async function listMembers(req: Request, res: Response): Promise<Response> {
  const userId = getUserId(req);
  const query = getQuery<ListFavoriteQuery>(req);
  const result = await familyService.listMembers(userId, query);
  return sendPaginated(res, result.items, {
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
  });
}

export async function createMember(req: Request, res: Response): Promise<Response> {
  const userId = getUserId(req);
  const body = getBody<CreateFamilyMemberInput>(req);
  const data = await familyService.createMember(userId, body);
  return sendCreated(res, data);
}

export async function updateMember(req: Request, res: Response): Promise<Response> {
  const userId = getUserId(req);
  const { id } = getParams<{ id: string }>(req);
  const body = getBody<UpdateFamilyMemberInput>(req);
  const data = await familyService.updateMember(userId, id, body);
  return sendSuccess(res, data);
}

export async function deleteMember(req: Request, res: Response): Promise<Response> {
  const userId = getUserId(req);
  const { id } = getParams<{ id: string }>(req);
  await familyService.deleteMember(userId, id);
  return sendSuccess(res, { deleted: true });
}

export async function setPrimaryMember(req: Request, res: Response): Promise<Response> {
  const userId = getUserId(req);
  const { id } = getParams<{ id: string }>(req);
  const data = await familyService.setPrimaryMember(userId, id);
  return sendSuccess(res, data);
}