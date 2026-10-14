import type { Request, Response } from 'express';
import * as adminService from '../services/admin.service.js';
import { sendCreated, sendPaginated, sendSuccess } from '../utils/response.js';
import { getBody, getIp, getParams, getQuery, getUserId } from '../utils/request.js';
import type {
  AssignRoleInput,
  AuditLogQuery,
  CreateRoleInput,
  ListAdminUserQuery,
  SalesDashboardQuery,
} from '../validators/admin.validator.js';
import type {
  ListPermissionQuery,
  ListRoleQuery,
  ReportProductQuery,
  ReportSalesQuery,
  SalesSummaryQuery,
  TopProductQuery,
  UpdateRoleInput,
  UpdateUserStatusInput,
  UpdateVariantCostsInput,
} from '../services/admin.service.js';

type AuditContext = adminService.AuditContext;

/** Konteks audit diambil dari request yang sudah lewat middleware context. */
function auditContext(req: Request): AuditContext {
  return { requestId: req.requestId ?? null, ipAddress: getIp(req) };
}

// GET /admin/dashboard/sales
export async function salesDashboard(req: Request, res: Response): Promise<Response> {
  const result = await adminService.salesDashboard(getQuery<SalesDashboardQuery>(req));
  return sendPaginated(res, result.items, {
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
  });
}

// GET /admin/dashboard/sales-summary
export async function salesSummary(req: Request, res: Response): Promise<Response> {
  const data = await adminService.salesSummary(getQuery<SalesSummaryQuery>(req));
  return sendSuccess(res, data);
}

// GET /admin/dashboard/top-products
export async function topProducts(req: Request, res: Response): Promise<Response> {
  const data = await adminService.topProducts(getQuery<TopProductQuery>(req));
  return sendSuccess(res, data);
}

// GET /admin/dashboard/overview
export async function overview(req: Request, res: Response): Promise<Response> {
  const data = await adminService.overview();
  return sendSuccess(res, data);
}

// GET /admin/reports/sales - akumulasi diskon, kotor/bersih, modal, laba, qty
export async function reportSales(req: Request, res: Response): Promise<Response> {
  const data = await adminService.reportSales(getQuery<ReportSalesQuery>(req));
  return sendSuccess(res, data);
}

// GET /admin/reports/products - rekap penjualan per produk (dengan pencarian)
export async function reportProducts(req: Request, res: Response): Promise<Response> {
  const result = await adminService.reportProducts(getQuery<ReportProductQuery>(req));
  return sendPaginated(res, result.items, {
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
  });
}

// GET /admin/reports/daily - deret harian (kotor, diskon, bersih, modal, laba, qty)
export async function reportDaily(req: Request, res: Response): Promise<Response> {
  const data = await adminService.reportDaily(getQuery<ReportSalesQuery>(req));
  return sendSuccess(res, data);
}

// GET /admin/reports/breakdown - sebaran metode pesanan/pembayaran, jam, hari, status
export async function reportBreakdown(req: Request, res: Response): Promise<Response> {
  const data = await adminService.reportBreakdown(getQuery<ReportSalesQuery>(req));
  return sendSuccess(res, data);
}

// GET /admin/reports/categories - rekap penjualan per kategori produk
export async function reportCategories(req: Request, res: Response): Promise<Response> {
  const data = await adminService.reportCategories(getQuery<ReportSalesQuery>(req));
  return sendSuccess(res, data);
}

// GET /admin/products/:id/variants - varian + HPP (khusus admin)
export async function productVariantsWithCost(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await adminService.listProductVariantsWithCost(id);
  return sendSuccess(res, data);
}

// PATCH /admin/products/:id/variant-costs - perbarui HPP varian
export async function updateVariantCosts(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const body = getBody<UpdateVariantCostsInput>(req);
  const data = await adminService.updateVariantCosts(id, getUserId(req), body, auditContext(req));
  return sendSuccess(res, data);
}

// GET /admin/audit-logs
export async function listAuditLogs(req: Request, res: Response): Promise<Response> {
  const result = await adminService.listAuditLogs(getQuery<AuditLogQuery>(req));
  return sendPaginated(res, result.items, {
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
  });
}

// GET /admin/roles
export async function listRoles(req: Request, res: Response): Promise<Response> {
  const result = await adminService.listRoles(getQuery<ListRoleQuery>(req));
  return sendPaginated(res, result.items, {
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
  });
}

// POST /admin/roles
export async function createRole(req: Request, res: Response): Promise<Response> {
  const body = getBody<CreateRoleInput>(req);
  const data = await adminService.createRole(getUserId(req), body, auditContext(req));
  return sendCreated(res, data);
}

// PATCH /admin/roles/:id
export async function updateRole(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const body = getBody<UpdateRoleInput>(req);
  const data = await adminService.updateRole(id, getUserId(req), body, auditContext(req));
  return sendSuccess(res, data);
}

// GET /admin/permissions
export async function listPermissions(req: Request, res: Response): Promise<Response> {
  const data = await adminService.listPermissions(getQuery<ListPermissionQuery>(req));
  return sendSuccess(res, data);
}

// GET /admin/users
export async function listUsers(req: Request, res: Response): Promise<Response> {
  const result = await adminService.listUsers(getQuery<ListAdminUserQuery>(req));
  return sendPaginated(res, result.items, {
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
  });
}

// POST /admin/users/:id/roles
export async function assignUserRoles(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const body = getBody<AssignRoleInput>(req);
  const data = await adminService.assignUserRoles(id, getUserId(req), body, auditContext(req));
  return sendSuccess(res, data);
}

// PATCH /admin/users/:id/status
export async function updateUserStatus(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const body = getBody<UpdateUserStatusInput>(req);
  const data = await adminService.updateUserStatus(id, getUserId(req), body, auditContext(req));
  return sendSuccess(res, data);
}