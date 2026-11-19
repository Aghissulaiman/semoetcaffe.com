import type { Request, Response } from 'express';
import * as shiftService from '../services/shift.service.js';
import { sendCreated, sendPaginated, sendSuccess } from '../utils/response.js';
import { getBody, getParams, getQuery, getUserId } from '../utils/request.js';
import type {
  ActiveShiftQuery,
  CloseShiftInput,
  HandoverShiftInput,
  ListShiftQuery,
  StartShiftInput,
  UpdateShiftPlanInput,
} from '../validators/shift.validator.js';

// GET /admin/shifts/staff
export async function listStaff(_req: Request, res: Response): Promise<Response> {
  const data = await shiftService.listShiftStaff();
  return sendSuccess(res, data);
}

// GET /admin/shifts/active
export async function activeShift(req: Request, res: Response): Promise<Response> {
  const data = await shiftService.activeShift(getQuery<ActiveShiftQuery>(req));
  return sendSuccess(res, data);
}

// GET /admin/shifts
export async function listShifts(req: Request, res: Response): Promise<Response> {
  const result = await shiftService.listShifts(getQuery<ListShiftQuery>(req));
  return sendPaginated(res, result.items, {
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
  });
}

// POST /admin/shifts/start
export async function startShift(req: Request, res: Response): Promise<Response> {
  const data = await shiftService.startShift(
    getUserId(req),
    getBody<StartShiftInput>(req),
  );
  return sendCreated(res, data);
}

// POST /admin/shifts/:id/close
export async function closeShift(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await shiftService.closeShift(
    getUserId(req),
    id,
    getBody<CloseShiftInput>(req),
  );
  return sendSuccess(res, data);
}

// PATCH /admin/shifts/:id/plan - ubah jam rencana shift aktif
export async function updateShiftPlan(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await shiftService.updateShiftPlan(
    id,
    getBody<UpdateShiftPlanInput>(req),
  );
  return sendSuccess(res, data);
}

// POST /admin/shifts/:id/handover - tutup shift lama + buka shift baru
export async function handoverShift(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await shiftService.handoverShift(
    getUserId(req),
    id,
    getBody<HandoverShiftInput>(req),
  );
  return sendSuccess(res, data);
}
