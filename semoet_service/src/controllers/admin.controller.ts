import type { Request, Response } from 'express';
import * as adminService from '../services/admin.service.js';
import * as catalogService from '../services/catalog.service.js';
import * as eventService from '../services/event.service.js';
import * as expenseService from '../services/expense.service.js';
import * as orderService from '../services/order.service.js';
import * as paymentService from '../services/payment.service.js';
import * as promoService from '../services/promo.service.js';
import * as prepStationService from '../services/preparationStation.service.js';
import { sendCreated, sendPaginated, sendSuccess } from '../utils/response.js';
import { getBody, getIp, getParams, getQuery, getUserId } from '../utils/request.js';
import type {
  AssignRoleInput,
  AuditLogQuery,
  CreateAreaInput,
  CreateRoleInput,
  CreateTableInput,
  ListAdminOrderQuery,
  ListAdminUserQuery,
  RecordManualPaymentInput,
  SalesDashboardQuery,
  ListAdminReservationQuery,
  UpdateAreaInput,
  UpdateDepositSettingsInput,
  UpdateReservationStatusInput,
  UpdateTableInput,
  CreateAdminReservationInput,
  ListAdminEventBookingQuery,
  UpdateEventBookingStatusInput,
  CreateAdminEventBookingInput,
  ListAdminChatConversationQuery,
  ListAdminMomentQuery,
  ListDeletedProductQuery,
  ModerateMomentInput,
} from '../validators/admin.validator.js';
import type {
  CreateEventAgendaInput,
  ListEventAgendaQuery,
  UpdateEventAgendaInput,
} from '../validators/event.validator.js';
import type {
  CreateExpenseInput,
  ListExpenseQuery,
  UpdateExpenseInput,
} from '../validators/expense.validator.js';
import type {
  CreateAdminPromoInput,
  ListAdminPromoQuery,
  UpdateAdminPromoInput,
} from '../validators/promo.validator.js';
import type {
  CreateCategoryInput,
  UpdateCategoryInput,
} from '../validators/admin.validator.js';
import type { ListProductQuery } from '../validators/catalog.validator.js';
import type { UpdateOrderStatusInput } from '../validators/order.validator.js';
import type {
  CreateProductInput,
  CreateUserInput,
  ListPermissionQuery,
  ListRoleQuery,
  ProductVariantInput,
  ReportProductQuery,
  ReportSalesQuery,
  SalesSummaryQuery,
  TopProductQuery,
  UpdateProductInput,
  UpdateRoleInput,
  UpdateUserInput,
  UpdateUserStatusInput,
  UpdateVariantCostsInput,
  UpdateVariantInput,
  UploadImageInput,
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

// --------------------------------------------------------------------------
// Admin/kasir: antrean pesanan & pembayaran manual
// --------------------------------------------------------------------------
// GET /admin/orders - antrean pesanan semua pelanggan (branch-scoped)
export async function listOrders(req: Request, res: Response): Promise<Response> {
  const query = getQuery<ListAdminOrderQuery>(req);
  const result = await orderService.listAdminOrders(query);
  return sendPaginated(res, result.items, {
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
  });
}

// PATCH /admin/orders/:id/status - ubah status pesanan dari kasir
export async function updateOrderStatus(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const body = getBody<UpdateOrderStatusInput>(req);
  const data = await orderService.updateOrderStatusByStaff(
    id,
    { toStatus: body.toStatus, note: body.note },
    getUserId(req),
    auditContext(req),
  );
  return sendSuccess(res, data);
}

// POST /admin/orders/:id/payments - catat pembayaran manual (tunai/QRIS/kartu)
export async function recordOrderPayment(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const body = getBody<RecordManualPaymentInput>(req);
  const data = await paymentService.recordManualPayment(
    id,
    {
      paymentMethod: body.paymentMethod,
      amountReceivedIdr: body.amountReceivedIdr,
      note: body.note,
    },
    getUserId(req),
    auditContext(req),
  );
  return sendCreated(res, data);
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

// GET /admin/audit-logs/filters - opsi filter aktivitas sistem
export async function auditLogFilters(_req: Request, res: Response): Promise<Response> {
  const data = await adminService.auditLogFilters();
  return sendSuccess(res, data);
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

// POST /admin/users - tambah anggota
export async function createUser(req: Request, res: Response): Promise<Response> {
  const body = getBody<CreateUserInput>(req);
  const data = await adminService.createUser(getUserId(req), body, auditContext(req));
  return sendCreated(res, data);
}

// PATCH /admin/users/:id - ubah profil anggota
export async function updateUser(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const body = getBody<UpdateUserInput>(req);
  const data = await adminService.updateUserProfile(id, getUserId(req), body, auditContext(req));
  return sendSuccess(res, data);
}

// GET /admin/roles/:id - detail role + izin
export async function getRole(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await adminService.getRole(id);
  return sendSuccess(res, data);
}

// DELETE /admin/roles/:id - hapus role
export async function deleteRole(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await adminService.deleteRole(id, getUserId(req), auditContext(req));
  return sendSuccess(res, data);
}

// POST /admin/uploads/images - unggah gambar ke object storage
export async function uploadImage(req: Request, res: Response): Promise<Response> {
  const body = getBody<UploadImageInput>(req);
  const data = await adminService.uploadImage(getUserId(req), body, auditContext(req));
  return sendCreated(res, data);
}

// --------------------------------------------------------------------------
// Admin: kategori menu
// --------------------------------------------------------------------------

// POST /admin/categories - tambah kategori
export async function createCategory(req: Request, res: Response): Promise<Response> {
  const body = getBody<CreateCategoryInput>(req);
  const data = await adminService.createCategory(getUserId(req), body, auditContext(req));
  return sendCreated(res, data);
}

// PATCH /admin/categories/:id - ubah kategori
export async function updateCategory(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const body = getBody<UpdateCategoryInput>(req);
  const data = await adminService.updateCategory(id, getUserId(req), body, auditContext(req));
  return sendSuccess(res, data);
}

// DELETE /admin/categories/:id - hapus kategori yang belum dipakai
export async function deleteCategory(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await adminService.deleteCategory(id, getUserId(req), auditContext(req));
  return sendSuccess(res, data);
}

// GET /admin/preparation-stations
export async function listPreparationStations(req: Request, res: Response): Promise<Response> {
  const data = await prepStationService.listPreparationStations(false);
  return sendSuccess(res, data);
}

// POST /admin/preparation-stations
export async function createPreparationStation(req: Request, res: Response): Promise<Response> {
  const body = getBody<{ name: string; code?: string; sortOrder?: number; isActive?: boolean }>(req);
  const data = await prepStationService.createPreparationStation(body as any);
  return sendCreated(res, data);
}

// PATCH /admin/preparation-stations/:id
export async function updatePreparationStation(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const body = getBody<{ name?: string; code?: string; sortOrder?: number; isActive?: boolean }>(req);
  const data = await prepStationService.updatePreparationStation(id, body as any);
  return sendSuccess(res, data);
}

// DELETE /admin/preparation-stations/:id
export async function deletePreparationStation(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await prepStationService.deletePreparationStation(id);
  return sendSuccess(res, data);
}

// GET /admin/products - daftar produk termasuk yang nonaktif
export async function listProducts(req: Request, res: Response): Promise<Response> {
  const query = getQuery<ListProductQuery>(req);
  const result = await catalogService.listAdminProducts(query);
  return sendPaginated(res, result.items, {
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
  });
}

// POST /admin/products - tambah produk + varian
export async function createProduct(req: Request, res: Response): Promise<Response> {
  const body = getBody<CreateProductInput>(req);
  const data = await adminService.createProduct(getUserId(req), body, auditContext(req));
  return sendCreated(res, data);
}

// PATCH /admin/products/:id - ubah produk
export async function updateProduct(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const body = getBody<UpdateProductInput>(req);
  const data = await adminService.updateProduct(id, getUserId(req), body, auditContext(req));
  return sendSuccess(res, data);
}

// DELETE /admin/products/:id - soft delete produk
export async function deleteProduct(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await adminService.deleteProduct(id, getUserId(req), auditContext(req));
  return sendSuccess(res, data);
}

// GET /admin/products/trash - riwayat produk terhapus + sisa masa pemulihan
export async function listDeletedProducts(req: Request, res: Response): Promise<Response> {
  const result = await adminService.listDeletedProducts(
    getQuery<ListDeletedProductQuery>(req),
  );
  return sendPaginated(res, result.items, {
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
  });
}

// POST /admin/products/:id/restore - pulihkan produk dari tempat sampah
export async function restoreProduct(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await adminService.restoreProduct(id, getUserId(req), auditContext(req));
  return sendSuccess(res, data);
}

// DELETE /admin/products/:id/permanent - hapus permanen dari tempat sampah
export async function purgeProduct(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await adminService.purgeProduct(id, getUserId(req), auditContext(req));
  return sendSuccess(res, data);
}

// POST /admin/products/:id/variants - tambah varian
export async function createVariant(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const body = getBody<ProductVariantInput>(req);
  const data = await adminService.createVariant(id, getUserId(req), body, auditContext(req));
  return sendCreated(res, data);
}

// PATCH /admin/products/:id/variants/:variantId - ubah varian
export async function updateProductVariant(req: Request, res: Response): Promise<Response> {
  const { id, variantId } = getParams<{ id: string; variantId: string }>(req);
  const body = getBody<UpdateVariantInput>(req);
  const data = await adminService.updateProductVariant(
    id,
    variantId,
    getUserId(req),
    body,
    auditContext(req),
  );
  return sendSuccess(res, data);
}

// DELETE /admin/products/:id/variants/:variantId - hapus varian
export async function deleteVariant(req: Request, res: Response): Promise<Response> {
  const { id, variantId } = getParams<{ id: string; variantId: string }>(req);
  const data = await adminService.deleteVariant(id, variantId, getUserId(req), auditContext(req));
  return sendSuccess(res, data);
}

// --------------------------------------------------------------------------
// Admin: Area tempat duduk & meja
// --------------------------------------------------------------------------
// POST /admin/branches/:id/areas - tambah area
export async function createArea(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const body = getBody<CreateAreaInput>(req);
  const data = await adminService.createArea(id, body, getUserId(req), auditContext(req));
  return sendCreated(res, data);
}

// PATCH /admin/areas/:areaId - ubah area
export async function updateArea(req: Request, res: Response): Promise<Response> {
  const { areaId } = getParams<{ areaId: string }>(req);
  const body = getBody<UpdateAreaInput>(req);
  const data = await adminService.updateArea(areaId, body, getUserId(req), auditContext(req));
  return sendSuccess(res, data);
}

// DELETE /admin/areas/:areaId - hapus area
export async function deleteArea(req: Request, res: Response): Promise<Response> {
  const { areaId } = getParams<{ areaId: string }>(req);
  const data = await adminService.deleteArea(areaId, getUserId(req), auditContext(req));
  return sendSuccess(res, data);
}

// POST /admin/tables - tambah meja
export async function createTable(req: Request, res: Response): Promise<Response> {
  const body = getBody<CreateTableInput>(req);
  const data = await adminService.createTable(body, getUserId(req), auditContext(req));
  return sendCreated(res, data);
}

// PATCH /admin/tables/:tableId - ubah meja
export async function updateTable(req: Request, res: Response): Promise<Response> {
  const { tableId } = getParams<{ tableId: string }>(req);
  const body = getBody<UpdateTableInput>(req);
  const data = await adminService.updateTable(tableId, body, getUserId(req), auditContext(req));
  return sendSuccess(res, data);
}

// DELETE /admin/tables/:tableId - hapus meja
export async function deleteTable(req: Request, res: Response): Promise<Response> {
  const { tableId } = getParams<{ tableId: string }>(req);
  const data = await adminService.deleteTable(tableId, getUserId(req), auditContext(req));
  return sendSuccess(res, data);
}

// --------------------------------------------------------------------------
// Admin: Reservasi
// --------------------------------------------------------------------------

// GET /admin/reservation-settings - ketentuan DP (persen & batas nominal)
export async function getReservationSettings(
  _req: Request,
  res: Response,
): Promise<Response> {
  const data = await adminService.getReservationDepositSettings();
  return sendSuccess(res, data);
}

// PATCH /admin/reservation-settings - ubah ketentuan DP
export async function updateReservationSettings(
  req: Request,
  res: Response,
): Promise<Response> {
  const body = getBody<UpdateDepositSettingsInput>(req);
  const data = await adminService.updateReservationDepositSettings(
    body,
    getUserId(req),
    auditContext(req),
  );
  return sendSuccess(res, data);
}

// GET /admin/reservations - daftar semua reservasi
export async function listReservations(req: Request, res: Response): Promise<Response> {
  const query = getQuery<ListAdminReservationQuery>(req);
  const page = query.page ?? 1;
  const limit = query.limit ?? 30;
  const { items, meta } = await adminService.listAdminReservations(
    {
      branchId: query.branchId,
      status: query.status,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      q: query.q,
    },
    { page, limit, offset: (page - 1) * limit },
  );
  return sendPaginated(res, items, { page, limit, total: meta.total });
}

// GET /admin/reservations/:id - detail reservasi
export async function getReservation(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await adminService.getAdminReservation(id);
  return sendSuccess(res, data);
}

// PATCH /admin/reservations/:id - update status reservasi (+ data DP opsional)
export async function updateReservation(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const body = getBody<UpdateReservationStatusInput>(req);
  const data = await adminService.updateAdminReservationStatus(
    id,
    body,
    getUserId(req),
    auditContext(req),
  );
  return sendSuccess(res, data);
}

// POST /admin/reservations - tambah reservasi atas nama pelanggan
export async function createReservation(req: Request, res: Response): Promise<Response> {
  const body = getBody<CreateAdminReservationInput>(req);
  const data = await adminService.createAdminReservation(body, getUserId(req), auditContext(req));
  return sendCreated(res, data);
}

// POST /admin/reservations/:id/deposit-charge - buat link pembayaran DP (Midtrans)
export async function createReservationDepositCharge(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const body = getBody<{
    amountIdr?: number | null;
    stage?: 'deposit' | 'deposit2' | 'settlement';
    paymentMethod?: string;
    idempotencyKey?: string;
  }>(req);
  const data = await adminService.createReservationDepositCharge(
    id,
    body,
    getUserId(req),
    auditContext(req),
  );
  return sendCreated(res, data);
}

// DELETE /admin/reservations/:id - hapus reservasi
export async function deleteReservation(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await adminService.deleteAdminReservation(id, getUserId(req), auditContext(req));
  return sendSuccess(res, data);
}

// --------------------------------------------------------------------------
// Admin: Booking Event
// --------------------------------------------------------------------------

// GET /admin/event-bookings - daftar semua booking event
export async function listEventBookings(req: Request, res: Response): Promise<Response> {
  const query = getQuery<ListAdminEventBookingQuery>(req);
  const page = query.page ?? 1;
  const limit = query.limit ?? 30;
  const { items, meta } = await adminService.listAdminEventBookings(
    {
      branchId: query.branchId,
      status: query.status,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      q: query.q,
    },
    { page, limit, offset: (page - 1) * limit },
  );
  return sendPaginated(res, items, { page, limit, total: meta.total });
}

// GET /admin/event-bookings/:id - detail booking event
export async function getEventBooking(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await adminService.getAdminEventBooking(id);
  return sendSuccess(res, data);
}

// PATCH /admin/event-bookings/:id - update status booking event
export async function updateEventBooking(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const body = getBody<UpdateEventBookingStatusInput>(req);
  const data = await adminService.updateAdminEventBookingStatus(
    id,
    body.status,
    body.note ?? null,
    body.quoteIdr ?? null,
    body.depositPercent ?? null,
    getUserId(req),
    auditContext(req),
  );
  return sendSuccess(res, data);
}

// POST /admin/event-bookings - tambah booking event atas nama pelanggan
export async function createEventBooking(req: Request, res: Response): Promise<Response> {
  const body = getBody<CreateAdminEventBookingInput>(req);
  const data = await adminService.createAdminEventBooking(body, getUserId(req), auditContext(req));
  return sendCreated(res, data);
}

// DELETE /admin/event-bookings/:id - hapus booking event
export async function deleteEventBooking(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await adminService.deleteAdminEventBooking(id, getUserId(req), auditContext(req));
  return sendSuccess(res, data);
}

// --------------------------------------------------------------------------
// Admin: Agenda Event (Ramadan, Lebaran, promo musiman, dsb)
// --------------------------------------------------------------------------

// GET /admin/event-agenda - daftar agenda event
export async function listEventAgenda(req: Request, res: Response): Promise<Response> {
  const query = getQuery<ListEventAgendaQuery>(req);
  const result = await eventService.listEventAgenda(query);
  return sendPaginated(res, result.items, {
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
  });
}

// GET /admin/event-agenda/:id - detail agenda event
export async function getEventAgenda(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await eventService.getEventAgenda(id);
  return sendSuccess(res, data);
}

// POST /admin/event-agenda - tambah agenda event
export async function createEventAgenda(req: Request, res: Response): Promise<Response> {
  const body = getBody<CreateEventAgendaInput>(req);
  const data = await eventService.createEventAgenda(body, getUserId(req), auditContext(req));
  return sendCreated(res, data);
}

// PATCH /admin/event-agenda/:id - ubah agenda event
export async function updateEventAgenda(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const body = getBody<UpdateEventAgendaInput>(req);
  const data = await eventService.updateEventAgenda(id, body, getUserId(req), auditContext(req));
  return sendSuccess(res, data);
}

// DELETE /admin/event-agenda/:id - hapus agenda event
export async function deleteEventAgenda(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await eventService.deleteEventAgenda(id, getUserId(req), auditContext(req));
  return sendSuccess(res, data);
}

// --------------------------------------------------------------------------
// Admin: Promo (voucher code & diskon langsung menu)
// --------------------------------------------------------------------------

// GET /admin/promos - daftar seluruh promo
export async function listPromos(req: Request, res: Response): Promise<Response> {
  const query = getQuery<ListAdminPromoQuery>(req);
  const result = await promoService.listAdminPromos(query);
  return sendPaginated(res, result.items, {
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
  });
}

// GET /admin/promos/:id - detail promo beserta menu/kategori sasaran
export async function getPromo(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await promoService.getAdminPromo(id);
  return sendSuccess(res, data);
}

// POST /admin/promos - buat promo voucher atau diskon menu
export async function createPromo(req: Request, res: Response): Promise<Response> {
  const body = getBody<CreateAdminPromoInput>(req);
  const data = await promoService.createAdminPromo(body, getUserId(req), auditContext(req));
  return sendCreated(res, data);
}

// PATCH /admin/promos/:id - ubah promo
export async function updatePromo(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const body = getBody<UpdateAdminPromoInput>(req);
  const data = await promoService.updateAdminPromo(id, body, getUserId(req), auditContext(req));
  return sendSuccess(res, data);
}

// DELETE /admin/promos/:id - hapus promo yang belum pernah dipakai
export async function deletePromo(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await promoService.deleteAdminPromo(id, getUserId(req), auditContext(req));
  return sendSuccess(res, data);
}

// --------------------------------------------------------------------------
// Admin: Chat / Support
// --------------------------------------------------------------------------

// GET /admin/chat/conversations - daftar percakapan support
export async function listChatConversations(req: Request, res: Response): Promise<Response> {
  const query = getQuery<ListAdminChatConversationQuery>(req);
  const page = query.page ?? 1;
  const limit = query.limit ?? 30;
  const { items, meta } = await adminService.listAdminChatConversations(
    {
      status: query.status,
      category: query.category,
      assignedStaffId: query.assignedStaffId,
      q: query.q,
    },
    { page, limit, offset: (page - 1) * limit },
  );
  return sendPaginated(res, items, { page, limit, total: meta.total });
}

// --------------------------------------------------------------------------
// Admin: Moment Moderation
// --------------------------------------------------------------------------

// GET /admin/moments - daftar moment untuk moderasi
export async function listMoments(req: Request, res: Response): Promise<Response> {
  const query = getQuery<ListAdminMomentQuery>(req);
  const page = query.page ?? 1;
  const limit = query.limit ?? 30;
  const { items, meta } = await adminService.listAdminMoments(
    {
      moderationStatus: query.moderationStatus,
      q: query.q,
    },
    { page, limit, offset: (page - 1) * limit },
  );
  return sendPaginated(res, items, { page, limit, total: meta.total });
}

// PATCH /admin/moments/moderate - moderasi moment
export async function moderateMoment(req: Request, res: Response): Promise<Response> {
  const body = getBody<ModerateMomentInput>(req);
  const momentId = body.id ?? body.momentId;
  if (!momentId) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'momentId wajib diisi' },
    });
  }
  const data = await adminService.moderateMoment(momentId, body.moderationStatus, body.note ?? null, getUserId(req), auditContext(req));
  return sendSuccess(res, data);
}

// DELETE /admin/moments/:id - hapus moment
export async function deleteMoment(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await adminService.deleteAdminMoment(id, getUserId(req), auditContext(req));
  return sendSuccess(res, data);
}

// --------------------------------------------------------------------------
// Admin: Pengeluaran operasional
// --------------------------------------------------------------------------

// GET /admin/expenses - daftar pengeluaran operasional
export async function listExpenses(req: Request, res: Response): Promise<Response> {
  const query = getQuery<ListExpenseQuery>(req);
  const result = await expenseService.listExpenses(query);
  return sendPaginated(res, result.items, {
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
  });
}

// GET /admin/expenses/:id - detail pengeluaran
export async function getExpense(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await expenseService.getExpense(id);
  return sendSuccess(res, data);
}

// POST /admin/expenses - tambah pengeluaran operasional
export async function createExpense(req: Request, res: Response): Promise<Response> {
  const body = getBody<CreateExpenseInput>(req);
  const data = await expenseService.createExpense(body, getUserId(req), auditContext(req));
  return sendCreated(res, data);
}

// PATCH /admin/expenses/:id - ubah pengeluaran operasional
export async function updateExpense(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const body = getBody<UpdateExpenseInput>(req);
  const data = await expenseService.updateExpense(id, body, getUserId(req), auditContext(req));
  return sendSuccess(res, data);
}

// DELETE /admin/expenses/:id - hapus pengeluaran operasional
export async function deleteExpense(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await expenseService.deleteExpense(id, getUserId(req), auditContext(req));
  return sendSuccess(res, data);
}