import type { Request, Response } from 'express';
import { readRawBody, readSignatureHeader } from '../config/rawBody.js';
import * as paymentService from '../services/payment.service.js';
import { sendCreated, sendPaginated, sendSuccess } from '../utils/response.js';
import { getBody, getIdempotencyKey, getIp, getParams, getQuery, getUserId } from '../utils/request.js';
import {
  listOrderPaymentQuerySchema,
  orderPaymentParamSchema,
  type CreateChargeInput,
  type ListOrderPaymentQuery,
  type PaymentWebhookInput,
  type RefundInput,
} from '../validators/payment.validator.js';

function isStaffRequest(req: Request): boolean {
  return Boolean(req.user?.isStaff);
}

/** Param orderId, di-parse ulang sebagai fallback bila validate tidak terpasang. */
function getOrderId(req: Request): string {
  const params = getParams<{ orderId: string }>(req);
  const parsed = orderPaymentParamSchema.safeParse(params);
  return parsed.success ? parsed.data.orderId : params.orderId;
}

/** Parse ulang query list sebagai fallback bila validate tidak terpasang. */
function parseListQuery(query: unknown): ListOrderPaymentQuery {
  const parsed = listOrderPaymentQuerySchema.safeParse(query ?? {});
  return (parsed.success ? parsed.data : query) as ListOrderPaymentQuery;
}

// POST /payments/charge
export async function create(req: Request, res: Response): Promise<Response> {
  const userId = getUserId(req);
  const body = getBody<CreateChargeInput>(req);

  const result = await paymentService.createCharge(userId, body, {
    idempotencyKey: getIdempotencyKey(req),
    ipAddress: getIp(req),
    requestId: req.requestId ?? null,
  });

  // Retry dengan Idempotency-Key yang sama mengembalikan transaksi lama (200),
  // bukan membuat transaksi kedua.
  return result.replayed ? sendSuccess(res, result) : sendCreated(res, result);
}

// GET /payments/:id
export async function detail(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await paymentService.getPayment(id, getUserId(req), isStaffRequest(req));
  return sendSuccess(res, data);
}

// GET /payments/:id/verify
export async function verify(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await paymentService.verifyPayment(id, getUserId(req));
  return sendSuccess(res, data);
}

// POST /payments/:id/simulate — khusus demo/development (gateway stub).
export async function simulate(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await paymentService.simulatePaymentSuccess(id, getUserId(req), {
    requestId: req.requestId ?? null,
    ipAddress: getIp(req),
  });
  return sendSuccess(res, data);
}

// POST /payments/:id/refund
export async function refund(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const body = getBody<RefundInput>(req);

  const data = await paymentService.refund(
    getUserId(req),
    { paymentId: id, ...body },
    isStaffRequest(req),
    { requestId: req.requestId ?? null, ipAddress: getIp(req) },
  );
  return sendCreated(res, data);
}

// GET /orders/:orderId/payments
export async function listForOrder(req: Request, res: Response): Promise<Response> {
  const result = await paymentService.listOrderPayments(
    getOrderId(req),
    getUserId(req),
    parseListQuery(getQuery(req)),
  );

  return sendPaginated(res, result.items, {
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
  });
}

// POST /payments/webhook (publik, tanpa authenticate)
export async function webhook(req: Request, res: Response): Promise<Response> {
  const body = getBody<PaymentWebhookInput>(req);
  // Signature wajib dihitung dari byte asli (req.rawBody), bukan dari body
  // yang sudah di-parse ulang menjadi objek.
  const result = await paymentService.handleWebhook(body, readRawBody(req), readSignatureHeader(req), {
    requestId: req.requestId ?? null,
    ipAddress: getIp(req),
  });
  return sendSuccess(res, result);
}