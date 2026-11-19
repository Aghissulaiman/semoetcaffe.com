import type { Request, Response } from 'express';
import * as purchaseService from '../services/purchase.service.js';
import { sendCreated, sendPaginated, sendSuccess } from '../utils/response.js';
import { getBody, getIp, getParams, getQuery, getUserId } from '../utils/request.js';
import type {
  CancelPurchaseOrderInput,
  CreateGoodsReceiptInput,
  CreatePurchaseOrderInput,
  CreateSupplierInput,
  CreateSupplierPaymentInput,
  ListGoodsReceiptQuery,
  ListPayableQuery,
  ListPurchaseOrderQuery,
  ListSupplierQuery,
  UpdatePurchaseOrderInput,
  UpdateSupplierInput,
} from '../validators/purchase.validator.js';

/** Konteks audit dari request untuk halaman Aktivitas Sistem. */
function auditContext(req: Request) {
  return { requestId: req.requestId ?? null, ipAddress: getIp(req) };
}

function paginationMeta(result: {
  meta: { page: number; limit: number; total: number };
}): { page: number; limit: number; total: number; [key: string]: number } {
  return { page: result.meta.page, limit: result.meta.limit, total: result.meta.total };
}

// --------------------------------------------------------------------------
// Supplier
// --------------------------------------------------------------------------
export async function listSuppliers(req: Request, res: Response): Promise<Response> {
  const result = await purchaseService.listSuppliers(getQuery<ListSupplierQuery>(req));
  return sendPaginated(res, result.items, paginationMeta(result));
}

export async function supplierDetail(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  return sendSuccess(res, await purchaseService.supplierDetail(id));
}

export async function createSupplier(req: Request, res: Response): Promise<Response> {
  const data = await purchaseService.createSupplier(
    getUserId(req),
    getBody<CreateSupplierInput>(req),
    auditContext(req),
  );
  return sendCreated(res, data);
}

export async function updateSupplier(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await purchaseService.updateSupplier(
    id,
    getUserId(req),
    getBody<UpdateSupplierInput>(req),
    auditContext(req),
  );
  return sendSuccess(res, data);
}

export async function deleteSupplier(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await purchaseService.deleteSupplier(id, getUserId(req), auditContext(req));
  return sendSuccess(res, data);
}

// --------------------------------------------------------------------------
// Purchase order
// --------------------------------------------------------------------------
export async function listPurchaseOrders(req: Request, res: Response): Promise<Response> {
  const result = await purchaseService.listPurchaseOrders(
    getQuery<ListPurchaseOrderQuery>(req),
  );
  return sendPaginated(res, result.items, paginationMeta(result));
}

export async function purchaseOrderDetail(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  return sendSuccess(res, await purchaseService.purchaseOrderDetail(id));
}

export async function createPurchaseOrder(req: Request, res: Response): Promise<Response> {
  const data = await purchaseService.createPurchaseOrder(
    getUserId(req),
    getBody<CreatePurchaseOrderInput>(req),
    auditContext(req),
  );
  return sendCreated(res, data);
}

export async function updatePurchaseOrder(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await purchaseService.updatePurchaseOrder(
    id,
    getUserId(req),
    getBody<UpdatePurchaseOrderInput>(req),
    auditContext(req),
  );
  return sendSuccess(res, data);
}

export async function confirmPurchaseOrder(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await purchaseService.confirmPurchaseOrder(id, getUserId(req), auditContext(req));
  return sendSuccess(res, data);
}

export async function cancelPurchaseOrder(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await purchaseService.cancelPurchaseOrder(
    id,
    getUserId(req),
    getBody<CancelPurchaseOrderInput>(req),
    auditContext(req),
  );
  return sendSuccess(res, data);
}

export async function deletePurchaseOrder(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await purchaseService.deletePurchaseOrder(id, getUserId(req), auditContext(req));
  return sendSuccess(res, data);
}

// --------------------------------------------------------------------------
// Goods receipt
// --------------------------------------------------------------------------
export async function listGoodsReceipts(req: Request, res: Response): Promise<Response> {
  const result = await purchaseService.listGoodsReceipts(
    getQuery<ListGoodsReceiptQuery>(req),
  );
  return sendPaginated(res, result.items, paginationMeta(result));
}

export async function goodsReceiptDetail(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  return sendSuccess(res, await purchaseService.goodsReceiptDetail(id));
}

export async function receivePurchaseOrder(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await purchaseService.receivePurchaseOrder(
    id,
    getUserId(req),
    getBody<CreateGoodsReceiptInput>(req),
    auditContext(req),
  );
  return sendCreated(res, data);
}

export async function postGoodsReceipt(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await purchaseService.postGoodsReceipt(id, getUserId(req), auditContext(req));
  return sendSuccess(res, data);
}

// --------------------------------------------------------------------------
// Supplier payment / hutang
// --------------------------------------------------------------------------
export async function addSupplierPayment(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await purchaseService.addSupplierPayment(
    id,
    getUserId(req),
    getBody<CreateSupplierPaymentInput>(req),
    auditContext(req),
  );
  return sendCreated(res, data);
}

export async function listPayables(req: Request, res: Response): Promise<Response> {
  const result = await purchaseService.listPayables(getQuery<ListPayableQuery>(req));
  return sendSuccess(res, result.items, {
    meta: { ...paginationMeta(result), totalOutstandingIdr: result.summary.totalOutstandingIdr },
  });
}
