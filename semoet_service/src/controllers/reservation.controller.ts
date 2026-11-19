import type { Request, Response } from 'express';
import * as reservationService from '../services/reservation.service.js';
import { sendCreated, sendPaginated, sendSuccess } from '../utils/response.js';
import { getBody, getParams, getQuery, getUserId } from '../utils/request.js';
import type { CheckAvailabilityQuery, CreateReservationInput, ListMyReservationQuery } from '../validators/reservation.validator.js';

function isStaffRequest(req: Request): boolean {
  return Boolean(req.user?.isStaff);
}

// POST /reservations
export async function create(req: Request, res: Response): Promise<Response> {
  const userId = getUserId(req);
  const body = getBody<CreateReservationInput>(req);
  const data = await reservationService.createReservation(userId, body);
  return sendCreated(res, data);
}

// GET /me/reservations
export async function listMine(req: Request, res: Response): Promise<Response> {
  const userId = getUserId(req);
  const query = getQuery<ListMyReservationQuery>(req);
  const result = await reservationService.listMyReservations(userId, query);

  return sendPaginated(res, result.items, {
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
  });
}

// GET /reservations/:id
export async function detail(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await reservationService.getReservation(id, getUserId(req), isStaffRequest(req));
  return sendSuccess(res, data);
}

// POST /reservations/:id/cancel
export async function cancel(req: Request, res: Response): Promise<Response> {
  const userId = getUserId(req);
  const { id } = getParams<{ id: string }>(req);
  const body = getBody<reservationService.CancelReservationInput>(req);
  const data = await reservationService.cancelReservation(userId, id, body ?? {});
  return sendSuccess(res, data);
}

// POST /reservations/:id/deposit-charge - pelanggan bayar DP sendiri (Midtrans)
export async function createDepositCharge(req: Request, res: Response): Promise<Response> {
  const userId = getUserId(req);
  const { id } = getParams<{ id: string }>(req);
  const body = getBody<{
    stage?: 'deposit' | 'deposit2' | 'settlement';
    amountIdr?: number | null;
    paymentMethod?: string;
    idempotencyKey?: string;
  }>(req);
  const data = await reservationService.createMyDepositCharge(userId, id, body);
  return sendCreated(res, data);
}

// POST /reservations/:id/deposit-proof - pelanggan unggah bukti transfer DP
export async function uploadDepositProof(req: Request, res: Response): Promise<Response> {
  const userId = getUserId(req);
  const { id } = getParams<{ id: string }>(req);
  const body = getBody<{
    stage?: 'deposit' | 'deposit2' | 'settlement';
    data: string;
    contentType?: string;
    amountIdr?: number | null;
    note?: string | null;
  }>(req);
  const data = await reservationService.uploadMyDepositProof(userId, id, body);
  return sendCreated(res, data);
}

// GET /reservations/availability (publik, tanpa login)
export async function checkAvailability(req: Request, res: Response): Promise<Response> {
  const query = getQuery<CheckAvailabilityQuery>(req);
  const data = await reservationService.checkAvailability(query);
  return sendSuccess(res, data);
}