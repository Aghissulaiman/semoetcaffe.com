import type { Request, Response } from 'express';
import * as profileService from '../services/profile.service.js';
import { sendSuccess } from '../utils/response.js';
import { getBody, getUserId } from '../utils/request.js';
import type {
  UpdateMeInput,
  UpdatePreferencesInput,
} from '../validators/user.validator.js';

export async function getMe(req: Request, res: Response): Promise<Response> {
  const userId = getUserId(req);
  const data = await profileService.getMyProfile(userId);
  return sendSuccess(res, data);
}

export async function updateMe(req: Request, res: Response): Promise<Response> {
  const userId = getUserId(req);
  const body = getBody<UpdateMeInput>(req);
  const data = await profileService.updateMe(userId, body);
  return sendSuccess(res, data);
}

export async function getPreferences(req: Request, res: Response): Promise<Response> {
  const userId = getUserId(req);
  const data = await profileService.getPreferences(userId);
  return sendSuccess(res, data);
}

export async function updatePreferences(req: Request, res: Response): Promise<Response> {
  const userId = getUserId(req);
  const body = getBody<UpdatePreferencesInput>(req);
  const data = await profileService.updatePreferences(userId, body);
  return sendSuccess(res, data);
}

export async function getTiers(req: Request, res: Response): Promise<Response> {
  const userId = getUserId(req);
  const data = await profileService.getTiers(userId);
  return sendSuccess(res, data);
}