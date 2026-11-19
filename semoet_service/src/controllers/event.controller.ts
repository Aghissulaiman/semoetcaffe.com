import type { Request, Response } from 'express';
import * as eventService from '../services/event.service.js';
import { getBody, getParams, getQuery, getIdempotencyKey, getUserId } from '../utils/request.js';
import { sendCreated, sendPaginated, sendSuccess } from '../utils/response.js';
import type {
  CancelEventBookingInput,
  CreateEventBookingInput,
  ListEventAgendaQuery,
  ListMyEventBookingQuery,
} from '../validators/event.validator.js';

/** Staff boleh membuka booking event milik customer mana saja. */
function isStaffRequest(req: Request): boolean {
  return Boolean(req.user?.isStaff);
}

// GET /event-packages
export async function listEventPackages(req: Request, res: Response): Promise<Response> {
  const query = getQuery<eventService.EventPackageQuery>(req);
  const result = await eventService.listEventPackages(query);

  return sendPaginated(res, result.items, {
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
  });
}

// GET /event-packages/:code
export async function getEventPackage(req: Request, res: Response): Promise<Response> {
  const params = getParams<{ code: string }>(req);
  const data = await eventService.getEventPackage(params.code);

  return sendSuccess(res, data);
}

// GET /catering-packages
export async function listCateringPackages(req: Request, res: Response): Promise<Response> {
  const query = getQuery<eventService.CateringPackageQuery>(req);
  const result = await eventService.listCateringPackages(query);

  return sendPaginated(res, result.items, {
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
  });
}

// GET /catering-packages/:code
export async function getCateringPackage(req: Request, res: Response): Promise<Response> {
  const params = getParams<{ code: string }>(req);
  const data = await eventService.getCateringPackage(params.code);

  return sendSuccess(res, data);
}

// POST /event-bookings
export async function createBooking(req: Request, res: Response): Promise<Response> {
  const userId = getUserId(req);
  const body = getBody<CreateEventBookingInput>(req);

  const data = await eventService.createBooking(userId, body, {
    idempotencyKey: getIdempotencyKey(req),
  });

  return sendCreated(res, data);
}

// GET /me/event-bookings
export async function listMineBookings(req: Request, res: Response): Promise<Response> {
  const userId = getUserId(req);
  const query = getQuery<ListMyEventBookingQuery>(req);

  const result = await eventService.listMineBookings(userId, query);

  return sendPaginated(res, result.items, {
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
  });
}

// GET /event-bookings/:id
export async function detail(req: Request, res: Response): Promise<Response> {
  const params = getParams<{ id: string }>(req);
  const data = await eventService.detail(params.id, getUserId(req), isStaffRequest(req));

  return sendSuccess(res, data);
}

// POST /event-bookings/:id/cancel
export async function cancel(req: Request, res: Response): Promise<Response> {
  const params = getParams<{ id: string }>(req);
  const body = getBody<CancelEventBookingInput>(req);
  const data = await eventService.cancel(params.id, getUserId(req), body);

  return sendSuccess(res, data);
}

// GET /event-availability
export async function checkAvailability(req: Request, res: Response): Promise<Response> {
  const query = getQuery<eventService.EventAvailabilityQuery>(req);
  const data = await eventService.checkAvailability(query);

  return sendSuccess(res, data);
}

// GET /event-agenda - agenda publik (hanya yang aktif)
export async function listAgenda(req: Request, res: Response): Promise<Response> {
  const query = getQuery<ListEventAgendaQuery>(req);
  const result = await eventService.listEventAgenda(query, { activeOnly: true });

  return sendPaginated(res, result.items, {
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
  });
}