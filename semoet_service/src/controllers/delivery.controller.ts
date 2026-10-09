import type { Request, Response } from 'express';
import * as deliveryService from '../services/delivery.service.js';
import { sendSuccess, sendPaginated } from '../utils/response.js';
import { getBody, getParams, getQuery, getUserId } from '../utils/request.js';
import { parsePagination, type Pagination } from '../utils/pagination.js';
import {
  listActiveDeliveryQuerySchema,
  listDeliveryQuerySchema,
  orderDeliveryParamSchema,
  type ListDeliveryQuery,
} from '../validators/delivery.validator.js';
import type {
  AssignDeliveryInput,
  DeliveryTrackingInput,
  UpdateDeliveryStatusInput,
} from '../validators/review.validator.js';

function isStaffRequest(req: Request): boolean {
  return Boolean(req.user?.isStaff);
}

/** Param orderId, di-parse ulang sebagai fallback bila validate tidak terpasang. */
function getOrderId(req: Request): string {
  const params = getParams<{ orderId: string }>(req);
  const parsed = orderDeliveryParamSchema.safeParse(params);
  return parsed.success ? parsed.data.orderId : params.orderId;
}

function parseListQuery(query: unknown): ListDeliveryQuery {
  const parsed = listDeliveryQuerySchema.safeParse(query ?? {});
  return (parsed.success ? parsed.data : query) as ListDeliveryQuery;
}

// GET /deliveries
export async function list(req: Request, res: Response): Promise<Response> {
  const result = await deliveryService.listDeliveries(parseListQuery(getQuery(req)), isStaffRequest(req));

  return sendPaginated(res, result.items, {
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
  });
}

// GET /deliveries/active
export async function active(req: Request, res: Response): Promise<Response> {
  const parsed = listActiveDeliveryQuerySchema.safeParse(getQuery(req) ?? {});
  const branchId = parsed.success ? parsed.data.branchId : undefined;
  const items = await deliveryService.listActiveDeliveries(branchId, isStaffRequest(req));
  return sendSuccess(res, items);
}

// GET /orders/:orderId/delivery
export async function detail(req: Request, res: Response): Promise<Response> {
  const data = await deliveryService.getDeliveryByOrder(
    getOrderId(req),
    getUserId(req),
    isStaffRequest(req),
  );
  return sendSuccess(res, data);
}

// POST /orders/:orderId/delivery/assign
export async function assignCourier(req: Request, res: Response): Promise<Response> {
  const orderId = getOrderId(req);
  const body = getBody<AssignDeliveryInput>(req);

  const data = await deliveryService.assignCourier(
    getUserId(req),
    { ...body, orderId },
    isStaffRequest(req),
  );
  return sendSuccess(res, data);
}

// POST /orders/:orderId/delivery/tracking
export async function addTrackingPoint(req: Request, res: Response): Promise<Response> {
  const orderId = getOrderId(req);
  const body = getBody<DeliveryTrackingInput>(req);

  const data = await deliveryService.updateTracking(
    getUserId(req),
    { ...body, orderId },
    isStaffRequest(req),
  );
  return sendSuccess(res, data);
}

// GET /orders/:orderId/delivery/tracking
export async function getTracking(req: Request, res: Response): Promise<Response> {
  const orderId = getOrderId(req);
  const query = parsePagination(getQuery(req)) as Pagination;
  const data = await deliveryService.getTracking(
    orderId,
    getUserId(req),
    isStaffRequest(req),
    query,
  );
  return sendPaginated(
    res,
    data.trackingLogs,
    { page: data.meta.page, limit: data.meta.limit, total: data.meta.total },
  );
}

// PATCH /orders/:orderId/delivery/status
export async function updateStatus(req: Request, res: Response): Promise<Response> {
  const orderId = getOrderId(req);
  const body = getBody<UpdateDeliveryStatusInput>(req);

  const data = await deliveryService.updateStatus(
    getUserId(req),
    { ...body, orderId },
    isStaffRequest(req),
  );
  return sendSuccess(res, data);
}