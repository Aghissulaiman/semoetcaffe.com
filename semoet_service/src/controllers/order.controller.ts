import type { Request, Response } from 'express';
import * as orderService from '../services/order.service.js';
import { getBody, getIdempotencyKey, getIp, getParams, getQuery, getUserId } from '../utils/request.js';
import { sendCreated, sendPaginated, sendSuccess } from '../utils/response.js';
import {
  orderIdParamSchema,
  type CancelOrderInput,
  type CreateOrderInput,
  type ListMyOrderQuery,
} from '../validators/order.validator.js';

function isStaffRequest(req: Request): boolean {
  return Boolean(req.user?.isStaff);
}

/** Param id, di-parse ulang sebagai fallback bila validate tidak terpasang. */
function getOrderId(req: Request): string {
  const params = getParams<{ id: string }>(req);
  const parsed = orderIdParamSchema.safeParse(params);
  return parsed.success ? parsed.data.id : params.id;
}

// POST /orders
export async function create(req: Request, res: Response): Promise<Response> {
  const body = getBody<CreateOrderInput>(req);
  const data = await orderService.createOrder(getUserId(req), body, {
    // Header Idempotency-Key lebih diprioritaskan daripada body.
    idempotencyKey: getIdempotencyKey(req),
    ipAddress: getIp(req),
    // Kasir tetap boleh mencatat pesanan saat toko tutup; order pelanggan
    // (web/app) ditolak bila toko sedang tutup.
    isStaff: isStaffRequest(req),
  });
  return sendCreated(res, data);
}

// GET /me/orders
export async function listMine(req: Request, res: Response): Promise<Response> {
  const result = await orderService.listOrders(getUserId(req), getQuery<ListMyOrderQuery>(req));

  return sendPaginated(res, result.items, {
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
  });
}

// GET /orders/:id
export async function detail(req: Request, res: Response): Promise<Response> {
  const data = await orderService.getOrder(getOrderId(req), getUserId(req), isStaffRequest(req));
  return sendSuccess(res, data);
}

// POST /orders/:id/cancel
export async function cancel(req: Request, res: Response): Promise<Response> {
  const orderId = getOrderId(req);
  const body = getBody<CancelOrderInput>(req);

  const data = await orderService.cancelOrder(getUserId(req), { ...body, orderId });
  return sendSuccess(res, data);
}

// GET /orders/:id/status
export async function statusHistory(req: Request, res: Response): Promise<Response> {
  const data = await orderService.getStatusHistory(
    getOrderId(req),
    getUserId(req),
    isStaffRequest(req),
  );
  return sendSuccess(res, data);
}

// GET /orders/:id/items
export async function listItems(req: Request, res: Response): Promise<Response> {
  const items = await orderService.listOrderItems(
    getOrderId(req),
    getUserId(req),
    isStaffRequest(req),
  );
  return sendSuccess(res, items);
}