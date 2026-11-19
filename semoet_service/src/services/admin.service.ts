import type { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { withTransaction, type TransactionClient } from '../config/database.js';
import { ROLE_CODE, USER_STATUS, type UserStatus } from '../config/constants.js';
import { badRequest, conflict, notFound, unprocessable } from '../errors/AppError.js';
import * as adminRepo from '../repositories/admin.repository.js';
import * as authRepo from '../repositories/auth.repository.js';
import * as branchRepo from '../repositories/branch.repository.js';
import * as catalogRepo from '../repositories/catalog.repository.js';
import * as chatRepo from '../repositories/chat.repository.js';
import * as eventRepo from '../repositories/event.repository.js';
import * as inventoryRepo from '../repositories/inventory.repository.js';
import * as momentRepo from '../repositories/moment.repository.js';
import * as paymentRepo from '../repositories/payment.repository.js';
import * as reservationRepo from '../repositories/reservation.repository.js';
import * as storageService from './storage.service.js';
import * as eventService from './event.service.js';
import {
  DEFAULT_DEPOSIT_SETTINGS,
  defaultDepositAmount,
  getDepositSettings,
} from './reservation.service.js';
import { getPaymentGateway } from './paymentGateway.provider.js';
import { generateReservationNumber, generateUniqueSlug } from '../utils/codeGenerator.js';
import { roundIdr } from '../utils/money.js';
import {
  assertPasswordStrength,
  hashPassword,
  normalizeEmail,
  normalizePhone,
} from '../utils/password.js';
import {
  buildPaginationMeta,
  parsePagination,
  MAX_LIMIT,
  type Pagination,
} from '../utils/pagination.js';
import { bool, iso, num, str, strOrNull } from '../utils/serialize.js';
import {
  createCategorySchema,
  createProductSchema,
  createUserSchema,
  listPermissionQuerySchema,
  listRoleQuerySchema,
  productVariantInputSchema,
  reportProductQuerySchema,
  reportSalesQuerySchema,
  salesSummaryQuerySchema,
  topProductQuerySchema,
  updateCategorySchema,
  updateProductSchema,
  updateRoleSchema,
  updateUserSchema,
  updateUserStatusSchema,
  updateVariantCostsSchema,
  updateVariantSchema,
  uploadImageSchema,
  type AssignRoleInput,
  type AuditLogQuery,
  type CreateAreaInput,
  type CreateRoleInput,
  type CreateTableInput,
  type UpdateAreaInput,
  type UpdateTableInput,
  type ListAdminUserQuery,
  type SalesDashboardQuery,
  type ListAdminReservationQuery,
  type UpdateReservationStatusInput,
  type CreateAdminReservationInput,
  type ListAdminEventBookingQuery,
  type UpdateEventBookingStatusInput,
  type CreateAdminEventBookingInput,
  type ListAdminChatConversationQuery,
  type ListAdminMomentQuery,
  type ListDeletedProductQuery,
  type ModerateMomentInput,
} from '../validators/admin.validator.js';

/** Tipe query/input yang validator hanya mengekspor skema-nya. */
export type SalesSummaryQuery = z.infer<typeof salesSummaryQuerySchema>;
export type TopProductQuery = z.infer<typeof topProductQuerySchema>;
export type ReportSalesQuery = z.infer<typeof reportSalesQuerySchema>;
export type ReportProductQuery = z.infer<typeof reportProductQuerySchema>;
export type UpdateVariantCostsInput = z.infer<typeof updateVariantCostsSchema>;
export type ListRoleQuery = z.infer<typeof listRoleQuerySchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
export type ListPermissionQuery = z.infer<typeof listPermissionQuerySchema>;
export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type UpdateVariantInput = z.infer<typeof updateVariantSchema>;
export type ProductVariantInput = z.infer<typeof productVariantInputSchema>;
export type UploadImageInput = z.infer<typeof uploadImageSchema>;
// Re-export admin query types for use in controllers
export type { ListAdminReservationQuery, UpdateReservationStatusInput, ListAdminEventBookingQuery, UpdateEventBookingStatusInput, ListAdminChatConversationQuery, ListAdminMomentQuery, ModerateMomentInput };

/** Konteks audit yang diteruskan dari controller. */
export interface AuditContext {
  requestId?: string | null;
  ipAddress?: string | null;
}

export interface Paginated<T> {
  items: T[];
  meta: ReturnType<typeof buildPaginationMeta>;
}

/** Status yang membuat seluruh sesi aktif user dicabut. */
const BLOCKING_STATUS: UserStatus[] = ['suspended', 'deleted'];

// --------------------------------------------------------------------------
// Helper shaping
// --------------------------------------------------------------------------
function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/** Tanggal dari PostgreSQL bisa datang sebagai Date atau string 'YYYY-MM-DD'. */
function toDateOnly(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = `${value.getMonth() + 1}`.padStart(2, '0');
    const day = `${value.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const text = String(value);
  return text.length >= 10 ? text.slice(0, 10) : text;
}

function shapeDailySales(row: Record<string, unknown>) {
  return {
    businessDate: toDateOnly(row.businessDate),
    orderCount: num(row.orderCount),
    paidSalesIdr: roundIdr(num(row.paidSalesIdr)),
  };
}

function shapeAuditLog(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    actorUserId: strOrNull(row.actorUserId),
    actorName: strOrNull(row.actorName),
    action: str(row.action),
    entityType: str(row.entityType),
    entityId: strOrNull(row.entityId),
    oldData: row.oldData ?? null,
    newData: row.newData ?? null,
    requestId: strOrNull(row.requestId),
    ipAddress: strOrNull(row.ipAddress),
    createdAt: iso(row.createdAt),
  };
}

function shapeRole(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    code: str(row.code),
    name: str(row.name),
    description: strOrNull(row.description),
    permissionCount: num(row.permissionCount),
    userCount: num(row.userCount),
    createdAt: iso(row.createdAt),
  };
}

function shapePermission(row: Record<string, unknown>) {
  const resource = str(row.resource);
  const action = str(row.action);
  return {
    id: str(row.id),
    resource,
    action,
    // Format key yang dipakai middleware rbac dan UI pengaturan role.
    key: `${resource}:${action}`,
    roleCount: num(row.roleCount),
  };
}

function shapeAdminUser(row: Record<string, unknown>) {
  const roleCodes = Array.isArray(row.roleCodes) ? row.roleCodes.map((code) => str(code)) : [];
  return {
    id: str(row.id),
    email: strOrNull(row.email),
    phoneE164: strOrNull(row.phoneE164),
    displayName: str(row.displayName),
    status: str(row.status),
    emailVerifiedAt: iso(row.emailVerifiedAt),
    phoneVerifiedAt: iso(row.phoneVerifiedAt),
    lastLoginAt: iso(row.lastLoginAt),
    createdAt: iso(row.createdAt),
    roleCodes,
    orderCount: num(row.orderCount),
    lifetimeValueIdr: roundIdr(num(row.lifetimeValueIdr)),
  };
}

function shapeVariantCost(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    productId: str(row.productId),
    sku: strOrNull(row.sku),
    name: str(row.name),
    priceIdr: roundIdr(num(row.priceIdr)),
    costIdr: roundIdr(num(row.costIdr)),
    compareAtPriceIdr: row.compareAtPriceIdr == null ? null : roundIdr(num(row.compareAtPriceIdr)),
    sortOrder: num(row.sortOrder),
    isDefault: bool(row.isDefault),
    isActive: bool(row.isActive),
  };
}

/** Bentuk produk untuk panel admin: field katalog + seluruh varian (termasuk HPP). */
function shapeAdminProduct(
  row: Record<string, unknown>,
  variants: Record<string, unknown>[],
  images: Record<string, unknown>[] = [],
) {
  const primary = images.find((image) => bool(image.isPrimary)) ?? images[0] ?? null;
  return {
    id: str(row.id),
    name: str(row.name),
    slug: str(row.slug),
    categoryId: str(row.categoryId),
    categoryName: strOrNull(row.categoryName),
    productKind: str(row.productKind),
    description: strOrNull(row.description),
    isActive: bool(row.isActive),
    isFeatured: bool(row.isFeatured),
    imageUrl: primary ? strOrNull(primary.publicUrl) : null,
    imageStorageKey: primary ? strOrNull(primary.storageKey) : null,
    imageAltText: primary ? strOrNull(primary.altText) : null,
    images: images.map((image) => ({
      id: str(image.id),
      url: strOrNull(image.publicUrl),
      storageKey: strOrNull(image.storageKey),
      altText: strOrNull(image.altText),
      sortOrder: num(image.sortOrder),
      isPrimary: bool(image.isPrimary),
    })),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    variants: variants.map(shapeVariantCost),
  };
}

function permissionKeyOf(row: Record<string, unknown>): string {
  return `${str(row.resource)}:${str(row.action)}`;
}

/**
 * Baris dari repository sebenarnya sudah camelCase saat runtime, tapi sebagian
 * generics repository masih menyebut kolom snake_case. Helper ini membaca
 * keduanya supaya bentuk tipe dan data tidak berbeda.
 */
function pick(row: unknown, camelKey: string, snakeKey: string): unknown {
  const record = (row ?? {}) as Record<string, unknown>;
  return record[camelKey] ?? record[snakeKey];
}

/** Bentuk seragam satu baris sebaran (metode pesanan/pembayaran, jam, hari). */
function shapeBreakdownItem(row: Record<string, unknown>) {
  return {
    key: str(pick(row, 'key', 'key')),
    orderCount: num(pick(row, 'orderCount', 'order_count')),
    revenueIdr: roundIdr(num(pick(row, 'revenueIdr', 'revenue_idr'))),
  };
}

/**
 * Terjemahkan daftar 'resource:action' menjadi id permission. Key yang tidak
 * terdaftar ditolak supaya role tidak diam-diam punya permission tak berguna.
 */
async function resolvePermissionIds(keys: string[], tx: TransactionClient): Promise<string[]> {
  const unique = [...new Set(keys.map((key) => key.trim().toLowerCase()).filter((key) => key.length > 0))];
  if (unique.length === 0) return [];

  const permissions = await adminRepo.listPermissions({}, tx);
  const idByKey = new Map<string, string>();
  for (const row of permissions) idByKey.set(permissionKeyOf(row), str(row.id));

  const missing = unique.filter((key) => !idByKey.has(key));
  if (missing.length > 0) {
    throw unprocessable(
      `Permission tidak dikenal: ${missing.join(', ')}`,
      missing.map((key) => ({ field: 'permissionKeys', message: `Permission '${key}' tidak terdaftar` })),
    );
  }

  return unique
    .map((key) => idByKey.get(key))
    .filter((id): id is string => Boolean(id));
}

/** Jumlah user yang masih memegang sebuah role (dipakai untuk jagaan super admin). */
async function countUsersWithRole(code: string, tx: TransactionClient): Promise<number> {
  return adminRepo.countUsers({ roleCode: code }, tx);
}

async function userHasRole(userId: string, code: string, tx: TransactionClient): Promise<boolean> {
  const roles = await authRepo.findRolesByUserId(userId, tx);
  return roles.some((role) => role.code === code);
}

// --------------------------------------------------------------------------
// GET /admin/dashboard/sales
// --------------------------------------------------------------------------
export async function salesDashboard(query: SalesDashboardQuery): Promise<Paginated<unknown>> {
  // Schema dashboard mengizinkan limit sampai 365, parsePagination membatasi 100.
  const paging = parsePagination({ ...query, limit: Math.min(num(query.limit, MAX_LIMIT), MAX_LIMIT) });
  const filters = { branchId: query.branchId, from: query.from, to: query.to };

  const rows = await adminRepo.dailySales(filters, paging);
  const total = await adminRepo.countDailySales(filters);

  const pagination: Pagination = { page: paging.page, limit: paging.limit, offset: paging.offset, total };
  return { items: rows.map(shapeDailySales), meta: buildPaginationMeta(pagination) };
}

// --------------------------------------------------------------------------
// GET /admin/dashboard/sales-summary
// --------------------------------------------------------------------------
export async function salesSummary(query: SalesSummaryQuery) {
  const filters = { branchId: query.branchId, from: query.from, to: query.to };

  const [summary, statusRows] = await Promise.all([
    adminRepo.salesSummary(filters),
    adminRepo.ordersByStatus(filters),
  ]);

  const ordersByStatus = statusRows.map((row) => ({
    orderStatus: str(pick(row, 'orderStatus', 'order_status')),
    count: num(pick(row, 'count', 'total')),
  }));
  const cancelledOrderCount = ordersByStatus
    .filter((item) => item.orderStatus === 'cancelled' || item.orderStatus === 'rejected')
    .reduce((total, item) => total + item.count, 0);

  return {
    branchId: query.branchId ?? null,
    from: query.from ?? null,
    to: query.to ?? null,
    totalOrders: num(pick(summary, 'totalOrders', 'total_orders')),
    paidSalesIdr: roundIdr(num(pick(summary, 'paidSalesIdr', 'paid_sales_idr'))),
    averageOrderIdr: roundIdr(num(pick(summary, 'avgOrderValueIdr', 'avg_order_value_idr'))),
    activeDays: num(pick(summary, 'activeDays', 'active_days')),
    cancelledOrderCount,
    ordersByStatus,
  };
}

// --------------------------------------------------------------------------
// GET /admin/dashboard/top-products
// --------------------------------------------------------------------------
export async function topProducts(query: TopProductQuery) {
  const rows = await adminRepo.topProducts({
    branchId: query.branchId,
    from: query.from,
    to: query.to,
    limit: num(query.limit, 10),
  });

  return rows.map((row) => ({
    productId: str(row.productId),
    productName: str(row.name),
    totalQuantity: num(row.totalQuantity),
    totalRevenueIdr: roundIdr(num(row.totalRevenueIdr)),
  }));
}

// --------------------------------------------------------------------------
// GET /admin/reports/sales - akumulasi diskon, penjualan kotor/bersih, modal, laba, qty
// --------------------------------------------------------------------------
export async function reportSales(query: ReportSalesQuery) {
  const filters = { branchId: query.branchId, from: query.from, to: query.to };

  const [summary, items] = await Promise.all([
    adminRepo.reportSalesSummary(filters),
    adminRepo.reportItemSummary(filters),
  ]);

  const grossSalesIdr = roundIdr(num(pick(summary, 'grossSalesIdr', 'gross_sales_idr')));
  const discountIdr = roundIdr(num(pick(summary, 'discountIdr', 'discount_idr')));
  const netSalesIdr = Math.max(0, grossSalesIdr - discountIdr);
  const cogsIdr = roundIdr(num(pick(items, 'cogsIdr', 'cogs_idr')));

  return {
    branchId: query.branchId ?? null,
    from: query.from ?? null,
    to: query.to ?? null,
    grossSalesIdr,
    discountIdr,
    netSalesIdr,
    taxIdr: roundIdr(num(pick(summary, 'taxIdr', 'tax_idr'))),
    serviceFeeIdr: roundIdr(num(pick(summary, 'serviceFeeIdr', 'service_fee_idr'))),
    deliveryFeeIdr: roundIdr(num(pick(summary, 'deliveryFeeIdr', 'delivery_fee_idr'))),
    totalBilledIdr: roundIdr(num(pick(summary, 'totalBilledIdr', 'total_billed_idr'))),
    cogsIdr,
    profitIdr: netSalesIdr - cogsIdr,
    itemsSold: num(pick(items, 'itemsSold', 'items_sold')),
    itemRevenueIdr: roundIdr(num(pick(items, 'itemRevenueIdr', 'item_revenue_idr'))),
    orderCount: num(pick(summary, 'orderCount', 'order_count')),
    productCount: num(pick(items, 'productCount', 'product_count')),
  };
}

// --------------------------------------------------------------------------
// GET /admin/reports/products - rekap penjualan per produk (dengan pencarian)
// --------------------------------------------------------------------------
export async function reportProducts(query: ReportProductQuery): Promise<Paginated<unknown>> {
  const paging = parsePagination(query);
  const filters = {
    branchId: query.branchId,
    from: query.from,
    to: query.to,
    q: query.q,
    sort: query.sort,
  };

  const rows = await adminRepo.reportProducts(filters, paging);
  const total = await adminRepo.countReportProducts(filters);

  const items = rows.map((row) => {
    const revenueIdr = roundIdr(num(pick(row, 'revenueIdr', 'revenue_idr')));
    const cogsIdr = roundIdr(num(pick(row, 'cogsIdr', 'cogs_idr')));
    return {
      productId: str(pick(row, 'productId', 'product_id')),
      productName: str(pick(row, 'productName', 'product_name')),
      quantity: num(pick(row, 'quantity', 'quantity')),
      orderCount: num(pick(row, 'orderCount', 'order_count')),
      revenueIdr,
      cogsIdr,
      profitIdr: revenueIdr - cogsIdr,
    };
  });

  const pagination: Pagination = { page: paging.page, limit: paging.limit, offset: paging.offset, total };
  return { items, meta: buildPaginationMeta(pagination) };
}

// --------------------------------------------------------------------------
// GET /admin/reports/daily - deret harian (kotor, diskon, bersih, modal, laba, qty)
// --------------------------------------------------------------------------
export async function reportDaily(query: ReportSalesQuery) {
  const filters = { branchId: query.branchId, from: query.from, to: query.to };
  const rows = await adminRepo.reportDailyFinancials(filters);

  return rows.map((row) => ({
    businessDate: toDateOnly(pick(row, 'businessDate', 'business_date')),
    orderCount: num(pick(row, 'orderCount', 'order_count')),
    grossIdr: roundIdr(num(pick(row, 'grossIdr', 'gross_idr'))),
    discountIdr: roundIdr(num(pick(row, 'discountIdr', 'discount_idr'))),
    netIdr: roundIdr(num(pick(row, 'netIdr', 'net_idr'))),
    itemsSold: num(pick(row, 'itemsSold', 'items_sold')),
    cogsIdr: roundIdr(num(pick(row, 'cogsIdr', 'cogs_idr'))),
    profitIdr: roundIdr(num(pick(row, 'profitIdr', 'profit_idr'))),
  }));
}

// --------------------------------------------------------------------------
// GET /admin/reports/breakdown - sebaran metode pesanan/pembayaran, jam, hari, status
// --------------------------------------------------------------------------
export async function reportBreakdown(query: ReportSalesQuery) {
  const filters = { branchId: query.branchId, from: query.from, to: query.to };

  const [fulfillment, payment, hourly, weekday, status] = await Promise.all([
    adminRepo.reportFulfillmentBreakdown(filters),
    adminRepo.reportPaymentBreakdown(filters),
    adminRepo.reportHourlyBreakdown(filters),
    adminRepo.reportWeekdayBreakdown(filters),
    adminRepo.reportStatusBreakdown(filters),
  ]);

  return {
    fulfillment: fulfillment.map(shapeBreakdownItem),
    payment: payment.map(shapeBreakdownItem),
    hourly: hourly.map(shapeBreakdownItem),
    weekday: weekday.map(shapeBreakdownItem),
    status: status.map((row) => ({
      orderStatus: str(pick(row, 'key', 'key')),
      count: num(pick(row, 'orderCount', 'order_count')),
    })),
  };
}

// --------------------------------------------------------------------------
// GET /admin/reports/categories - rekap penjualan per kategori produk
// --------------------------------------------------------------------------
export async function reportCategories(query: ReportSalesQuery) {
  const filters = { branchId: query.branchId, from: query.from, to: query.to };
  const rows = await adminRepo.reportCategoryBreakdown(filters);

  return rows.map((row) => {
    const revenueIdr = roundIdr(num(pick(row, 'revenueIdr', 'revenue_idr')));
    const cogsIdr = roundIdr(num(pick(row, 'cogsIdr', 'cogs_idr')));
    return {
      categoryId: str(pick(row, 'categoryId', 'category_id')),
      categoryName: str(pick(row, 'categoryName', 'category_name')),
      quantity: num(pick(row, 'quantity', 'quantity')),
      orderCount: num(pick(row, 'orderCount', 'order_count')),
      revenueIdr,
      cogsIdr,
      profitIdr: revenueIdr - cogsIdr,
    };
  });
}

// --------------------------------------------------------------------------
// GET /admin/products/:id/variants - varian + HPP (khusus admin)
// --------------------------------------------------------------------------
export async function listProductVariantsWithCost(productId: string) {
  const product = await catalogRepo.findProductById(productId);
  if (!product) throw notFound('Produk', productId);

  const variants = await catalogRepo.listVariantsWithCost(productId);
  return {
    productId,
    productName: str(product.name),
    variants: variants.map(shapeVariantCost),
  };
}

// --------------------------------------------------------------------------
// PATCH /admin/products/:id/variant-costs - perbarui HPP varian
// --------------------------------------------------------------------------
export async function updateVariantCosts(
  productId: string,
  actorUserId: string,
  input: UpdateVariantCostsInput,
  audit: AuditContext = {},
) {
  // Gabungkan item duplikat: entri terakhir menang.
  const byVariant = new Map<string, number>();
  for (const item of input.items) byVariant.set(item.variantId, item.costIdr);
  const items = [...byVariant.entries()].map(([variantId, costIdr]) => ({ variantId, costIdr }));

  return withTransaction(async (tx) => {
    const product = await catalogRepo.findProductById(productId, tx);
    if (!product) throw notFound('Produk', productId);

    const existing = await catalogRepo.listVariantsWithCost(productId, tx);
    const knownIds = new Set(existing.map((row) => str(row.id)));
    const unknown = items.filter((item) => !knownIds.has(item.variantId));
    if (unknown.length > 0) {
      throw unprocessable(
        'Ada varian yang bukan milik produk ini',
        unknown.map((item) => ({ field: 'items', message: `Varian ${item.variantId} tidak dikenal` })),
      );
    }

    const oldCostById = new Map(existing.map((row) => [str(row.id), num(row.costIdr)]));
    await catalogRepo.updateVariantCosts(productId, items, tx);

    const updated = await catalogRepo.listVariantsWithCost(productId, tx);

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'admin.product.variant.cost.update',
        entityType: 'product',
        entityId: productId,
        oldData: { costs: items.map((item) => ({ variantId: item.variantId, costIdr: oldCostById.get(item.variantId) ?? 0 })) },
        newData: { costs: items },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return {
      productId,
      productName: str(product.name),
      variants: updated.map(shapeVariantCost),
    };
  });
}

// --------------------------------------------------------------------------
// GET /admin/dashboard/overview
// --------------------------------------------------------------------------
export async function overview() {
  const [snapshot, ordersByStatus, lowStockIngredients, activeBranches, unassignedChats, moments] =
    await Promise.all([
      adminRepo.operationalSnapshot(),
      adminRepo.ordersByStatus({}),
      inventoryRepo.countIngredients({ lowStockOnly: true }),
      branchRepo.countBranches({ isActive: true }),
      chatRepo.countUnassignedConversations(),
      momentRepo.countMomentsByStatus(),
    ]);

  const pendingMomentCount = moments
    .filter((row) => str(pick(row, 'moderationStatus', 'moderation_status')) === 'pending')
    .reduce((total, row) => total + num(pick(row, 'total', 'total')), 0);

  return {
    orders: {
      activeOrders: num(pick(snapshot, 'activeOrders', 'active_orders')),
      pendingOrders: num(pick(snapshot, 'pendingOrders', 'pending_orders')),
      todayOrders: num(pick(snapshot, 'todayOrders', 'today_orders')),
      todayRevenueIdr: roundIdr(num(pick(snapshot, 'todayRevenueIdr', 'today_revenue_idr'))),
      byStatus: ordersByStatus.map((row) => ({
        orderStatus: str(pick(row, 'orderStatus', 'order_status')),
        count: num(pick(row, 'count', 'total')),
      })),
    },
    branches: { activeBranches: num(activeBranches) },
    reservations: {
      activeReservations: num(pick(snapshot, 'activeReservations', 'active_reservations')),
    },
    events: {
      pendingEventBookings: num(pick(snapshot, 'pendingEventBookings', 'pending_event_bookings')),
    },
    users: { newUsersToday: num(pick(snapshot, 'newUsersToday', 'new_users_today')) },
    inventory: { lowStockIngredients: num(lowStockIngredients) },
    support: { unassignedConversations: num(unassignedChats) },
    moderation: { pendingMoments: num(pendingMomentCount) },
  };
}

// --------------------------------------------------------------------------
// GET /admin/audit-logs
// --------------------------------------------------------------------------
export async function listAuditLogs(query: AuditLogQuery): Promise<Paginated<unknown>> {
  const paging = parsePagination(query);
  const filters = {
    actorUserId: query.actorUserId,
    action: query.action,
    entityType: query.entityType,
    entityId: query.entityId,
    requestId: query.requestId,
    q: query.q,
    from: query.from,
    to: query.to,
  };

  const rows = await adminRepo.listAuditLogs(filters, paging);
  const total = await adminRepo.countAuditLogs(filters);

  const pagination: Pagination = { page: paging.page, limit: paging.limit, offset: paging.offset, total };
  return { items: rows.map(shapeAuditLog), meta: buildPaginationMeta(pagination) };
}

// --------------------------------------------------------------------------
// GET /admin/audit-logs/filters - pilihan filter aktivitas sistem
// --------------------------------------------------------------------------
export async function auditLogFilters() {
  const facets = await adminRepo.auditLogFacets();
  return {
    actors: facets.actors.map((row) => ({
      id: str(row.id),
      name: strOrNull(row.name) ?? str(row.id),
    })),
    actions: facets.actions.map((row) => str(row.action)),
    entityTypes: facets.entityTypes.map((row) => str(row.entityType)),
  };
}

// --------------------------------------------------------------------------
// GET /admin/roles
// --------------------------------------------------------------------------
export async function listRoles(query: ListRoleQuery): Promise<Paginated<unknown>> {
  const paging = parsePagination(query);
  const code = query.code?.trim().toLowerCase();

  const rows = await adminRepo.listRoles(paging, code);
  const total = await adminRepo.countRoles(code);

  const pagination: Pagination = { page: paging.page, limit: paging.limit, offset: paging.offset, total };
  return { items: rows.map(shapeRole), meta: buildPaginationMeta(pagination) };
}

// --------------------------------------------------------------------------
// POST /admin/roles
// --------------------------------------------------------------------------
export async function createRole(
  actorUserId: string,
  input: CreateRoleInput,
  audit: AuditContext = {},
) {
  const code = input.code.trim().toLowerCase();
  const name = normalizeText(input.name);

  return withTransaction(async (tx) => {
    const existing = await adminRepo.findRoleByCode(code, tx);
    if (existing) throw conflict(`Role '${code}' sudah ada`);

    const row = await adminRepo.insertRole(
      { code, name, description: input.description ?? null },
      tx,
    );
    if (!row) throw unprocessable('Role gagal disimpan, coba lagi');

    const roleId = str(row.id);
    const permissionIds = await resolvePermissionIds(input.permissionKeys, tx);
    await adminRepo.replaceRolePermissions(roleId, permissionIds, tx);

    const permissions = await adminRepo.listRolePermissions(roleId, tx);

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'admin.role.create',
        entityType: 'role',
        entityId: roleId,
        newData: { code, name, permissionKeys: permissions.map(permissionKeyOf) },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return {
      ...shapeRole({ ...row, permissionCount: permissionIds.length }),
      permissions: permissions.map(permissionKeyOf),
    };
  });
}

// --------------------------------------------------------------------------
// PATCH /admin/roles/:id
// --------------------------------------------------------------------------
export async function updateRole(
  roleId: string,
  actorUserId: string,
  input: UpdateRoleInput,
  audit: AuditContext = {},
) {
  // updateRole memakai nama kolom PostgreSQL langsung.
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = normalizeText(input.name);
  if (input.description !== undefined) data.description = input.description;

  return withTransaction(async (tx) => {
    const current = await adminRepo.findRoleById(roleId, tx);
    if (!current) throw notFound('Role', roleId);

    let updated = current;
    if (Object.keys(data).length > 0) {
      const row = await adminRepo.updateRole(roleId, data, tx);
      if (!row) throw notFound('Role', roleId);
      updated = row;
    }

    if (input.permissionKeys !== undefined) {
      const permissionIds = await resolvePermissionIds(input.permissionKeys, tx);
      await adminRepo.replaceRolePermissions(roleId, permissionIds, tx);
    }

    const permissions = await adminRepo.listRolePermissions(roleId, tx);

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'admin.role.update',
        entityType: 'role',
        entityId: roleId,
        oldData: {
          name: strOrNull(current.name),
          description: strOrNull(current.description),
        },
        newData: {
          name: str(updated.name),
          description: strOrNull(updated.description),
          permissionKeys: permissions.map(permissionKeyOf),
        },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return {
      ...shapeRole(updated),
      permissions: permissions.map(permissionKeyOf),
    };
  });
}

// --------------------------------------------------------------------------
// GET /admin/permissions
// --------------------------------------------------------------------------
export async function listPermissions(query: ListPermissionQuery) {
  const rows = await adminRepo.listPermissions({
    resource: query.resource?.trim().toLowerCase(),
    action: query.action?.trim().toLowerCase(),
  });
  return rows.map(shapePermission);
}

// --------------------------------------------------------------------------
// GET /admin/users
// --------------------------------------------------------------------------
export async function listUsers(query: ListAdminUserQuery): Promise<Paginated<unknown>> {
  const paging = parsePagination(query);
  const filters: adminRepo.ListAdminUserFilters = {
    status: query.status,
    roleCode: query.roleCode?.trim().toLowerCase(),
    q: query.q,
    includeDeleted: query.includeDeleted ?? query.status === 'deleted',
  };

  // Kolom yang dikembalikan repository tidak pernah memuat password_hash
  // maupun refresh token, jadi tidak ada data sensitif yang ikut terbawa.
  const rows = await adminRepo.listUsers(filters, paging);
  const total = await adminRepo.countUsers(filters);

  const pagination: Pagination = { page: paging.page, limit: paging.limit, offset: paging.offset, total };
  return { items: rows.map(shapeAdminUser), meta: buildPaginationMeta(pagination) };
}

// --------------------------------------------------------------------------
// POST /admin/users/:id/roles
// --------------------------------------------------------------------------
export async function assignUserRoles(
  userId: string,
  actorUserId: string,
  input: AssignRoleInput,
  audit: AuditContext = {},
) {
  const roleIds = [...new Set(input.roleIds)];

  return withTransaction(async (tx) => {
    const user = await adminRepo.findUserById(userId, tx);
    if (!user) throw notFound('User', userId);

    const roles = [];
    for (const roleId of roleIds) {
      const role = await adminRepo.findRoleById(roleId, tx);
      if (!role) throw notFound('Role', roleId);
      roles.push({ id: str(role.id), code: str(role.code), name: str(role.name) });
    }

    if (input.replace) {
      const melepasSuperAdmin = await userHasRole(userId, ROLE_CODE.SUPER_ADMIN, tx);
      const masihSuperAdmin = roles.some((role) => role.code === ROLE_CODE.SUPER_ADMIN);
      if (melepasSuperAdmin && !masihSuperAdmin) {
        const totalSuperAdmin = await countUsersWithRole(ROLE_CODE.SUPER_ADMIN, tx);
        if (totalSuperAdmin <= 1) {
          throw conflict('Role super_admin terakhir tidak boleh dilepas dari user ini');
        }
      }
    }

    await adminRepo.assignUserRoles(userId, roleIds, actorUserId, input.replace, tx);

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'admin.user.roles.assign',
        entityType: 'user',
        entityId: userId,
        newData: { roleIds, replace: input.replace },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return {
      userId,
      replaced: input.replace,
      roleIds,
      roles,
      displayName: str(user.displayName),
    };
  });
}

// --------------------------------------------------------------------------
// PATCH /admin/users/:id/status
// --------------------------------------------------------------------------
export async function updateUserStatus(
  userId: string,
  actorUserId: string,
  input: UpdateUserStatusInput,
  audit: AuditContext = {},
) {
  if (userId === actorUserId) {
    throw badRequest('Anda tidak dapat mengubah status akun sendiri');
  }

  const status = input.status as UserStatus;
  if (!USER_STATUS.includes(status)) throw badRequest(`Status '${input.status}' tidak dikenal`);

  return withTransaction(async (tx) => {
    const user = await adminRepo.findUserById(userId, tx);
    if (!user) throw notFound('User', userId);

    // Akun super admin terakhir harus selalu bisa masuk untuk memperbaiki sistem.
    if (status !== 'active' && (await userHasRole(userId, ROLE_CODE.SUPER_ADMIN, tx))) {
      const totalSuperAdmin = await countUsersWithRole(ROLE_CODE.SUPER_ADMIN, tx);
      if (totalSuperAdmin <= 1) {
        throw conflict('Status super_admin terakhir tidak boleh diubah');
      }
    }

    const updated = await adminRepo.updateUserStatus(userId, status, tx);
    if (!updated) throw notFound('User', userId);

    // Suspend atau hapus akun langsung mencabut seluruh sesi yang masih hidup.
    if (BLOCKING_STATUS.includes(status)) {
      await authRepo.revokeAllUserSessions(userId, null, tx);
    }

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'admin.user.status.update',
        entityType: 'user',
        entityId: userId,
        oldData: { status: str(user.status) },
        newData: { status, reason: input.reason ?? null },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return {
      user: {
        id: str(updated.id),
        email: strOrNull(user.email),
        phoneE164: strOrNull(user.phoneE164),
        displayName: str(user.displayName),
        status: str(updated.status),
        deletedAt: iso(updated.deletedAt),
      },
      previousStatus: str(user.status),
      reason: input.reason ?? null,
      sessionsRevoked: BLOCKING_STATUS.includes(status),
    };
  });
}

// --------------------------------------------------------------------------
// POST /admin/users - tambah anggota
// --------------------------------------------------------------------------
export async function createUser(
  actorUserId: string,
  input: CreateUserInput,
  audit: AuditContext = {},
) {
  const email = input.email ? normalizeEmail(input.email) : null;
  const phoneE164 = input.phoneE164 ? normalizePhone(input.phoneE164) : null;
  const displayName = normalizeText(input.displayName);

  assertPasswordStrength(input.password);
  if (email && (await authRepo.emailExists(email))) throw conflict('Email sudah terdaftar');
  if (phoneE164 && (await authRepo.phoneExists(phoneE164))) {
    throw conflict('Nomor telepon sudah terdaftar');
  }

  const passwordHash = await hashPassword(input.password);
  const roleIds = [...new Set(input.roleIds)];

  return withTransaction(async (tx) => {
    const roles: { id: string; code: string; name: string }[] = [];
    for (const roleId of roleIds) {
      const role = await adminRepo.findRoleById(roleId, tx);
      if (!role) throw notFound('Role', roleId);
      roles.push({ id: str(role.id), code: str(role.code), name: str(role.name) });
    }

    const created = await authRepo.insertUser(
      { email, phoneE164, displayName, passwordHash, status: input.status },
      tx,
    );
    if (!created) throw unprocessable('Anggota gagal disimpan, coba lagi');
    const userId = str(created.id);

    if (roleIds.length > 0) {
      await adminRepo.assignUserRoles(userId, roleIds, actorUserId, true, tx);
    }

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'admin.user.create',
        entityType: 'user',
        entityId: userId,
        newData: { email, phoneE164, displayName, status: input.status, roleIds },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return {
      id: userId,
      email: strOrNull(created.email),
      phoneE164: strOrNull(created.phoneE164),
      displayName,
      status: str(created.status),
      roles,
    };
  });
}

// --------------------------------------------------------------------------
// PATCH /admin/users/:id - ubah profil anggota
// --------------------------------------------------------------------------
export async function updateUserProfile(
  userId: string,
  actorUserId: string,
  input: UpdateUserInput,
  audit: AuditContext = {},
) {
  return withTransaction(async (tx) => {
    const current = await adminRepo.findUserById(userId, tx);
    if (!current) throw notFound('User', userId);
    if (str(current.status) === 'deleted') {
      throw badRequest('Anggota yang dihapus harus dipulihkan dulu sebelum diedit');
    }

    const data: Record<string, unknown> = {};
    if (input.displayName !== undefined) data.display_name = normalizeText(input.displayName);

    if (input.email !== undefined) {
      const email = input.email ? normalizeEmail(input.email) : null;
      if (email && email !== strOrNull(current.email)) {
        if (await authRepo.emailExists(email, tx)) throw conflict('Email sudah terdaftar');
      }
      data.email = email;
    }

    if (input.phoneE164 !== undefined) {
      const phoneE164 = input.phoneE164 ? normalizePhone(input.phoneE164) : null;
      if (phoneE164 && phoneE164 !== strOrNull(current.phoneE164)) {
        if (await authRepo.phoneExists(phoneE164, tx)) {
          throw conflict('Nomor telepon sudah terdaftar');
        }
      }
      data.phone_e164 = phoneE164;
    }

    const updated = await adminRepo.updateUserProfile(userId, data, tx);
    if (!updated) throw notFound('User', userId);

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'admin.user.update',
        entityType: 'user',
        entityId: userId,
        oldData: {
          displayName: str(current.displayName),
          email: strOrNull(current.email),
          phoneE164: strOrNull(current.phoneE164),
        },
        newData: {
          displayName: str(updated.displayName),
          email: strOrNull(updated.email),
          phoneE164: strOrNull(updated.phoneE164),
        },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return {
      id: str(updated.id),
      email: strOrNull(updated.email),
      phoneE164: strOrNull(updated.phoneE164),
      displayName: str(updated.displayName),
      status: str(updated.status),
    };
  });
}

// --------------------------------------------------------------------------
// GET /admin/roles/:id - detail role + daftar izin (untuk form edit)
// --------------------------------------------------------------------------
export async function getRole(roleId: string) {
  const role = await adminRepo.findRoleById(roleId);
  if (!role) throw notFound('Role', roleId);

  const [permissions, userCount] = await Promise.all([
    adminRepo.listRolePermissions(roleId),
    adminRepo.countRoleUsers(roleId),
  ]);

  return {
    ...shapeRole({ ...role, permissionCount: permissions.length, userCount }),
    permissions: permissions.map(permissionKeyOf),
    isSystem: (Object.values(ROLE_CODE) as string[]).includes(str(role.code)),
  };
}

// --------------------------------------------------------------------------
// DELETE /admin/roles/:id - hapus role non-sistem yang tidak terpakai
// --------------------------------------------------------------------------
export async function deleteRole(
  roleId: string,
  actorUserId: string,
  audit: AuditContext = {},
) {
  return withTransaction(async (tx) => {
    const role = await adminRepo.findRoleById(roleId, tx);
    if (!role) throw notFound('Role', roleId);

    const code = str(role.code);
    if ((Object.values(ROLE_CODE) as string[]).includes(code)) {
      throw conflict(`Role sistem '${code}' tidak boleh dihapus`);
    }

    const userCount = await adminRepo.countRoleUsers(roleId, tx);
    if (userCount > 0) {
      throw conflict(
        `Masih ada ${userCount} anggota memakai role ini. Pindahkan mereka ke role lain dulu.`,
      );
    }

    await adminRepo.deleteRole(roleId, tx);

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'admin.role.delete',
        entityType: 'role',
        entityId: roleId,
        oldData: { code, name: str(role.name), description: strOrNull(role.description) },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return { id: roleId, code, deleted: true };
  });
}

// --------------------------------------------------------------------------
// Produk: helper
// --------------------------------------------------------------------------
/** Pastikan produk punya tepat satu varian default. */
async function ensureSingleDefaultVariant(productId: string, tx: TransactionClient) {
  const variants = await catalogRepo.listVariantsWithCost(productId, tx);
  if (variants.length === 0) return;

  const defaults = variants.filter((row) => bool(row.isDefault));
  if (defaults.length === 1) return;

  if (defaults.length === 0) {
    await adminRepo.updateVariant(str(variants[0].id), { is_default: true }, tx);
    return;
  }

  for (const extra of defaults.slice(1)) {
    await adminRepo.updateVariant(str(extra.id), { is_default: false }, tx);
  }
}

async function loadAdminProduct(productId: string, tx: TransactionClient) {
  const product = await catalogRepo.findProductById(productId, tx);
  if (!product) throw notFound('Produk', productId);
  const [variants, images] = await Promise.all([
    catalogRepo.listVariantsWithCost(productId, tx),
    catalogRepo.listProductImages(productId, tx),
  ]);
  return shapeAdminProduct(product, variants, images);
}

// --------------------------------------------------------------------------
// Gambar produk: normalisasi payload & helper penyimpanan
// --------------------------------------------------------------------------
type ProductImageMutation =
  | { kind: 'none' }
  | { kind: 'remove' }
  | { kind: 'set'; storageKey: string; publicUrl: string; altText: string | null };

/**
 * Terjemahkan field gambar pada body create/update menjadi aksi:
 * - tidak ada field  -> tidak mengubah apa pun
 * - null/kosong      -> hapus gambar
 * - key + url        -> pasang gambar baru (menggantikan yang lama)
 */
function resolveImageMutation(input: {
  imageStorageKey?: string | null;
  imagePublicUrl?: string | null;
  imageAltText?: string | null;
}): ProductImageMutation {
  const keyProvided = input.imageStorageKey !== undefined;
  const urlProvided = input.imagePublicUrl !== undefined;
  if (!keyProvided && !urlProvided) return { kind: 'none' };

  const storageKey = keyProvided ? input.imageStorageKey?.trim() || null : null;
  const publicUrl = urlProvided ? input.imagePublicUrl?.trim() || null : null;

  if (storageKey === null && publicUrl === null) return { kind: 'remove' };
  if (!storageKey || !publicUrl) {
    throw badRequest('Data gambar tidak lengkap: storageKey dan publicUrl wajib dikirim bersamaan');
  }
  return { kind: 'set', storageKey, publicUrl, altText: input.imageAltText?.trim() || null };
}

async function attachPrimaryImage(
  productId: string,
  image: { storageKey: string; publicUrl: string; altText: string | null },
  tx: TransactionClient,
) {
  await adminRepo.insertProductImage(
    {
      productId,
      storageKey: image.storageKey,
      publicUrl: image.publicUrl,
      altText: image.altText,
      isPrimary: true,
    },
    tx,
  );
}

// --------------------------------------------------------------------------
// POST /admin/uploads/images - unggah gambar ke object storage
// --------------------------------------------------------------------------
export async function uploadImage(actorUserId: string, input: UploadImageInput, audit: AuditContext = {}) {
  const uploaded = await storageService.uploadImage({
    data: input.data,
    contentType: input.contentType,
    folder: input.folder ?? 'products',
  });

  await adminRepo.insertAuditLog({
    actorUserId,
    action: 'admin.upload.image',
    entityType: 'storage',
    entityId: null,
    newData: { storageKey: uploaded.storageKey, sizeBytes: uploaded.sizeBytes, contentType: uploaded.contentType },
    requestId: audit.requestId ?? null,
    ipAddress: audit.ipAddress ?? null,
  });

  return uploaded;
}

function assertCompareAtPrice(priceIdr: number, compareAtPriceIdr: number | null | undefined) {
  if (compareAtPriceIdr != null && compareAtPriceIdr < priceIdr) {
    throw unprocessable('Harga sebelum diskon tidak boleh lebih kecil dari harga jual', [
      { field: 'compareAtPriceIdr', message: 'Harga sebelum diskon harus >= harga jual' },
    ]);
  }
}

// --------------------------------------------------------------------------
// Admin: kategori menu (product_categories)
// --------------------------------------------------------------------------
async function assertValidCategoryParent(
  parentId: string | null | undefined,
  categoryId: string | null,
  tx: TransactionClient,
): Promise<void> {
  if (!parentId) return;
  if (categoryId && parentId === categoryId) {
    throw unprocessable('Kategori tidak boleh menjadi induk dirinya sendiri', [
      { field: 'parentId', message: 'Pilih kategori lain' },
    ]);
  }

  const parent = await catalogRepo.findCategoryById(parentId, tx);
  if (!parent) throw notFound('Kategori induk', parentId);
  if (!categoryId) return;

  // Cegah siklus: induk baru tidak boleh berada di bawah kategori ini.
  const rows = await catalogRepo.listCategories({}, tx);
  const byId = new Map(rows.map((row) => [String(row.id), row]));
  const guard = new Set<string>();
  let current: Record<string, unknown> | undefined = byId.get(parentId);

  while (current && !guard.has(String(current.id))) {
    if (String(current.id) === categoryId) {
      throw unprocessable('Kategori induk membentuk siklus', [
        { field: 'parentId', message: 'Pilih kategori induk lain' },
      ]);
    }
    guard.add(String(current.id));
    const nextId =
      current.parentId === null || current.parentId === undefined
        ? null
        : String(current.parentId);
    current = nextId ? byId.get(nextId) : undefined;
  }
}

export async function createCategory(
  actorUserId: string,
  input: CreateCategoryInput,
  audit: AuditContext = {},
) {
  const name = normalizeText(input.name);

  return withTransaction(async (tx) => {
    await assertValidCategoryParent(input.parentId, null, tx);

    let slug = input.slug?.trim();
    if (slug) {
      if (await catalogRepo.categorySlugExists(slug, null, tx)) {
        throw conflict(`Slug kategori '${slug}' sudah dipakai`);
      }
    } else {
      slug = await generateUniqueSlug(name, (candidate) =>
        catalogRepo.categorySlugExists(candidate, null, tx),
      );
    }

    const created = await catalogRepo.insertCategory(
      {
        name,
        slug,
        parentId: input.parentId ?? null,
        sortOrder: input.sortOrder,
        isActive: input.isActive,
      },
      tx,
    );
    if (!created) throw unprocessable('Kategori gagal disimpan, coba lagi');

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'admin.category.create',
        entityType: 'product_category',
        entityId: str(created.id),
        newData: { name, slug, parentId: input.parentId ?? null, isActive: input.isActive },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return created;
  });
}

export async function updateCategory(
  categoryId: string,
  actorUserId: string,
  input: UpdateCategoryInput,
  audit: AuditContext = {},
) {
  return withTransaction(async (tx) => {
    const current = await catalogRepo.findCategoryById(categoryId, tx);
    if (!current) throw notFound('Kategori', categoryId);

    const data: Partial<catalogRepo.CategoryWriteInput> = {};

    if (input.name !== undefined) data.name = normalizeText(input.name);
    if (input.slug !== undefined) {
      const slug = input.slug.trim();
      if (slug !== str(current.slug) && (await catalogRepo.categorySlugExists(slug, categoryId, tx))) {
        throw conflict(`Slug kategori '${slug}' sudah dipakai`);
      }
      data.slug = slug;
    }
    if (input.parentId !== undefined) {
      await assertValidCategoryParent(input.parentId, categoryId, tx);
      data.parentId = input.parentId ?? null;
    }
    if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
    if (input.isActive !== undefined) data.isActive = input.isActive;

    const updated = await catalogRepo.updateCategory(categoryId, data, tx);
    if (!updated) throw notFound('Kategori', categoryId);

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'admin.category.update',
        entityType: 'product_category',
        entityId: categoryId,
        oldData: {
          name: str(current.name),
          slug: str(current.slug),
          parentId: current.parentId ?? null,
          isActive: bool(current.isActive),
        },
        newData: {
          name: str(updated.name),
          slug: str(updated.slug),
          parentId: updated.parentId ?? null,
          isActive: bool(updated.isActive),
        },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return updated;
  });
}

export async function deleteCategory(
  categoryId: string,
  actorUserId: string,
  audit: AuditContext = {},
) {
  return withTransaction(async (tx) => {
    const current = await catalogRepo.findCategoryById(categoryId, tx);
    if (!current) throw notFound('Kategori', categoryId);

    const children = await catalogRepo.countChildCategories(categoryId, tx);
    if (children > 0) {
      throw conflict(
        'Kategori ini masih memiliki subkategori. Pindahkan atau hapus subkategorinya terlebih dahulu.',
      );
    }

    const products = await catalogRepo.countCategoryProducts(categoryId, tx);
    if (products > 0) {
      throw conflict(
        'Kategori ini masih dipakai produk. Pindahkan produk ke kategori lain terlebih dahulu.',
      );
    }

    await catalogRepo.deleteCategory(categoryId, tx);

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'admin.category.delete',
        entityType: 'product_category',
        entityId: categoryId,
        oldData: { name: str(current.name), slug: str(current.slug) },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return { id: categoryId, deleted: true };
  });
}

// --------------------------------------------------------------------------
// POST /admin/products - tambah produk + varian
// --------------------------------------------------------------------------
export async function createProduct(
  actorUserId: string,
  input: CreateProductInput,
  audit: AuditContext = {},
) {
  const name = normalizeText(input.name);

  // Nama varian harus unik di dalam satu produk.
  const variantNames = input.variants.map((variant) => normalizeText(variant.name).toLowerCase());
  if (new Set(variantNames).size !== variantNames.length) {
    throw unprocessable('Nama varian tidak boleh kembar dalam satu produk', [
      { field: 'variants', message: 'Ada nama varian yang dupikat' },
    ]);
  }
  for (const variant of input.variants) {
    assertCompareAtPrice(variant.priceIdr, variant.compareAtPriceIdr);
  }

  return withTransaction(async (tx) => {
    const category = await catalogRepo.findCategoryById(input.categoryId, tx);
    if (!category) throw notFound('Kategori', input.categoryId);

    let slug = input.slug?.trim();
    if (slug) {
      if (await adminRepo.productSlugExists(slug, null, tx)) {
        throw conflict(`Slug '${slug}' sudah dipakai produk lain`);
      }
    } else {
      slug = await generateUniqueSlug(name, (candidate) => adminRepo.productSlugExists(candidate, null, tx));
    }

    const created = await adminRepo.insertProduct(
      {
        categoryId: input.categoryId,
        name,
        slug,
        description: input.descriptionShort ?? null,
        productKind: input.productKind,
        isActive: input.isActive,
        isFeatured: input.isFeatured,
      },
      tx,
    );
    if (!created) throw unprocessable('Produk gagal disimpan, coba lagi');
    const productId = str(created.id);

    // Tandai satu varian default (yang pertama bila tidak ada yang ditandai).
    const explicitDefaultIndex = input.variants.findIndex((variant) => variant.isDefault);
    const defaultIndex = explicitDefaultIndex >= 0 ? explicitDefaultIndex : 0;

    for (const [index, variant] of input.variants.entries()) {
      const sku = variant.sku?.trim() || null;
      if (sku && (await adminRepo.variantSkuExists(sku, null, tx))) {
        throw conflict(`SKU '${sku}' sudah dipakai varian lain`);
      }
      await adminRepo.insertVariant(
        {
          productId,
          sku,
          name: normalizeText(variant.name),
          priceIdr: variant.priceIdr,
          costIdr: variant.costIdr,
          compareAtPriceIdr: variant.compareAtPriceIdr ?? null,
          isDefault: index === defaultIndex,
          isActive: variant.isActive,
        },
        tx,
      );
    }

    // Gambar utama (opsional) — unggahan sudah dilakukan lewat /admin/uploads/images.
    const image = resolveImageMutation(input);
    if (image.kind === 'set') {
      await attachPrimaryImage(productId, image, tx);
    }

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'admin.product.create',
        entityType: 'product',
        entityId: productId,
        newData: {
          name,
          slug,
          categoryId: input.categoryId,
          variantCount: input.variants.length,
          imageUrl: image.kind === 'set' ? image.publicUrl : null,
        },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return loadAdminProduct(productId, tx);
  });
}

// --------------------------------------------------------------------------
// PATCH /admin/products/:id - ubah produk
// --------------------------------------------------------------------------
export async function updateProduct(
  productId: string,
  actorUserId: string,
  input: UpdateProductInput,
  audit: AuditContext = {},
) {
  const image = resolveImageMutation(input);
  const orphanedKeys: string[] = [];

  const result = await withTransaction(async (tx) => {
    const current = await catalogRepo.findProductById(productId, tx);
    if (!current) throw notFound('Produk', productId);

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = normalizeText(input.name);
    if (input.categoryId !== undefined) {
      const category = await catalogRepo.findCategoryById(input.categoryId, tx);
      if (!category) throw notFound('Kategori', input.categoryId);
      data.category_id = input.categoryId;
    }
    if (input.productKind !== undefined) data.product_kind = input.productKind;
    if (input.descriptionShort !== undefined) data.description = input.descriptionShort;
    if (input.isActive !== undefined) data.is_active = input.isActive;
    if (input.isFeatured !== undefined) data.is_featured = input.isFeatured;

    if (input.slug !== undefined) {
      const slug = input.slug.trim();
      if (slug !== str(current.slug) && (await adminRepo.productSlugExists(slug, productId, tx))) {
        throw conflict(`Slug '${slug}' sudah dipakai produk lain`);
      }
      data.slug = slug;
    }

    if (Object.keys(data).length > 0) {
      const updated = await adminRepo.updateProduct(productId, data, tx);
      if (!updated) throw notFound('Produk', productId);
    }

    // Ganti / hapus gambar utama bila diminta.
    if (image.kind !== 'none') {
      const existing = await adminRepo.listProductImageKeys(productId, tx);
      await adminRepo.clearProductImages(productId, tx);
      for (const row of existing) {
        const key = str(row.storageKey);
        if (image.kind === 'remove' || key !== image.storageKey) orphanedKeys.push(key);
      }
      if (image.kind === 'set') {
        await attachPrimaryImage(productId, image, tx);
      }
    }

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'admin.product.update',
        entityType: 'product',
        entityId: productId,
        oldData: { name: str(current.name), isActive: bool(current.isActive), isFeatured: bool(current.isFeatured) },
        newData: { ...data, image: image.kind === 'none' ? undefined : image },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return loadAdminProduct(productId, tx);
  });

  // Bersihkan objek lama dari storage setelah transaksi sukses (best effort).
  for (const key of orphanedKeys) {
    void storageService.deleteImage(key);
  }

  return result;
}

// --------------------------------------------------------------------------
// DELETE /admin/products/:id - soft delete produk
// --------------------------------------------------------------------------
export async function deleteProduct(
  productId: string,
  actorUserId: string,
  audit: AuditContext = {},
) {
  return withTransaction(async (tx) => {
    const current = await catalogRepo.findProductById(productId, tx);
    if (!current) throw notFound('Produk', productId);

    const deleted = await adminRepo.softDeleteProduct(productId, actorUserId, tx);
    if (!deleted) throw notFound('Produk', productId);

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'admin.product.delete',
        entityType: 'product',
        entityId: productId,
        oldData: { name: str(current.name), isActive: bool(current.isActive) },
        newData: { deleted: true, soft: true, restoreBeforeDays: 30 },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return { id: productId, deleted: true, soft: true };
  });
}

// --------------------------------------------------------------------------
// GET /admin/products/trash - riwayat produk terhapus (bisa dipulihkan)
// --------------------------------------------------------------------------
export async function listDeletedProducts(query: ListDeletedProductQuery) {
  // Purge lazy: setiap kali tempat sampah dibuka, produk yang sudah lewat 30
  // hari dibersihkan permanen. Tidak butuh cron terpisah.
  const purged = await adminRepo.purgeExpiredProducts();
  if (purged.length > 0) {
    await adminRepo.insertAuditLog({
      actorUserId: null,
      action: 'admin.product.purge_expired',
      entityType: 'product',
      entityId: null,
      oldData: { products: purged.map((row) => ({ id: str(row.id), name: str(row.name) })) },
      newData: { purgedCount: purged.length, retentionDays: 30 },
    });
  }

  const paging = parsePagination(query);
  const filters = { q: query.q };
  const rows = await adminRepo.listDeletedProducts(filters, paging);
  const total = await adminRepo.countDeletedProducts(filters);

  const pagination: Pagination = {
    page: paging.page,
    limit: paging.limit,
    offset: paging.offset,
    total,
  };

  return {
    items: rows.map((row) => ({
      id: str(row.id),
      name: str(row.name),
      slug: str(row.slug),
      productKind: str(row.productKind),
      categoryName: strOrNull(row.categoryName),
      deletedAt: iso(row.deletedAt),
      deletedBy: strOrNull(row.deletedBy),
      deletedByName: strOrNull(row.deletedByName),
      variantCount: num(row.variantCount),
      daysLeft: num(row.daysLeft),
    })),
    meta: buildPaginationMeta(pagination),
  };
}

// --------------------------------------------------------------------------
// POST /admin/products/:id/restore - pulihkan produk dari tempat sampah
// --------------------------------------------------------------------------
export async function restoreProduct(
  productId: string,
  actorUserId: string,
  audit: AuditContext = {},
) {
  return withTransaction(async (tx) => {
    const restored = await adminRepo.restoreProduct(productId, tx);
    if (!restored) throw notFound('Produk di tempat sampah', productId);

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'admin.product.restore',
        entityType: 'product',
        entityId: productId,
        newData: { deleted: false, restored: true },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return { id: productId, restored: true };
  });
}

// --------------------------------------------------------------------------
// DELETE /admin/products/:id/permanent - hapus permanen dari tempat sampah
// --------------------------------------------------------------------------
export async function purgeProduct(
  productId: string,
  actorUserId: string,
  audit: AuditContext = {},
) {
  return withTransaction(async (tx) => {
    const purged = await adminRepo.purgeProduct(productId, tx);
    if (!purged) throw notFound('Produk di tempat sampah', productId);

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'admin.product.purge',
        entityType: 'product',
        entityId: productId,
        oldData: { name: str(purged.name) },
        newData: { deleted: true, permanent: true },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return { id: productId, deleted: true, permanent: true };
  });
}

// --------------------------------------------------------------------------
// POST /admin/products/:id/variants - tambah varian
// --------------------------------------------------------------------------
export async function createVariant(
  productId: string,
  actorUserId: string,
  input: ProductVariantInput,
  audit: AuditContext = {},
) {
  const name = normalizeText(input.name);
  assertCompareAtPrice(input.priceIdr, input.compareAtPriceIdr);

  return withTransaction(async (tx) => {
    const product = await catalogRepo.findProductById(productId, tx);
    if (!product) throw notFound('Produk', productId);

    const sku = input.sku?.trim() || null;
    if (sku && (await adminRepo.variantSkuExists(sku, null, tx))) {
      throw conflict(`SKU '${sku}' sudah dipakai varian lain`);
    }

    const existing = await catalogRepo.listVariantsWithCost(productId, tx);
    if (existing.some((row) => str(row.name).toLowerCase() === name.toLowerCase())) {
      throw conflict(`Varian '${name}' sudah ada di produk ini`);
    }

    const shouldBeDefault = input.isDefault === true || existing.length === 0;
    if (shouldBeDefault) await adminRepo.clearDefaultVariant(productId, null, tx);

    const created = await adminRepo.insertVariant(
      {
        productId,
        sku,
        name,
        priceIdr: input.priceIdr,
        costIdr: input.costIdr ?? 0,
        compareAtPriceIdr: input.compareAtPriceIdr ?? null,
        isDefault: shouldBeDefault,
        isActive: input.isActive ?? true,
      },
      tx,
    );
    if (!created) throw unprocessable('Varian gagal disimpan, coba lagi');

    await ensureSingleDefaultVariant(productId, tx);

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'admin.product.variant.create',
        entityType: 'product',
        entityId: productId,
        newData: { name, priceIdr: input.priceIdr, costIdr: input.costIdr ?? 0, sku },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return loadAdminProduct(productId, tx);
  });
}

// --------------------------------------------------------------------------
// PATCH /admin/products/:id/variants/:variantId - ubah varian
// --------------------------------------------------------------------------
export async function updateProductVariant(
  productId: string,
  variantId: string,
  actorUserId: string,
  input: UpdateVariantInput,
  audit: AuditContext = {},
) {
  return withTransaction(async (tx) => {
    const product = await catalogRepo.findProductById(productId, tx);
    if (!product) throw notFound('Produk', productId);

    const variant = await adminRepo.findVariantForProduct(variantId, productId, tx);
    if (!variant) throw notFound('Varian', variantId);

    const allVariants = await catalogRepo.listVariantsWithCost(productId, tx);
    const existing = allVariants.find((row) => str(row.id) === variantId);
    const currentPrice = num(existing?.priceIdr);
    const nextPrice = input.priceIdr ?? currentPrice;

    if (input.compareAtPriceIdr !== undefined) {
      assertCompareAtPrice(nextPrice, input.compareAtPriceIdr);
    } else if (existing && existing.compareAtPriceIdr != null && nextPrice > num(existing.compareAtPriceIdr)) {
      throw unprocessable('Harga jual tidak boleh melebihi harga sebelum diskon', [
        { field: 'priceIdr', message: 'Turunkan harga jual atau naikkan harga sebelum diskon' },
      ]);
    }

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) {
      const name = normalizeText(input.name);
      if (allVariants.some((row) => str(row.id) !== variantId && str(row.name).toLowerCase() === name.toLowerCase())) {
        throw conflict(`Varian '${name}' sudah ada di produk ini`);
      }
      data.name = name;
    }
    if (input.sku !== undefined) {
      const sku = input.sku?.trim() || null;
      if (sku && (await adminRepo.variantSkuExists(sku, variantId, tx))) {
        throw conflict(`SKU '${sku}' sudah dipakai varian lain`);
      }
      data.sku = sku;
    }
    if (input.priceIdr !== undefined) data.price_idr = input.priceIdr;
    if (input.costIdr !== undefined) data.cost_idr = input.costIdr;
    if (input.compareAtPriceIdr !== undefined) data.compare_at_price_idr = input.compareAtPriceIdr;
    if (input.isActive !== undefined) data.is_active = input.isActive;

    if (input.isDefault === true) {
      await adminRepo.clearDefaultVariant(productId, variantId, tx);
      data.is_default = true;
    }

    await adminRepo.updateVariant(variantId, data, tx);
    await ensureSingleDefaultVariant(productId, tx);

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'admin.product.variant.update',
        entityType: 'product',
        entityId: productId,
        newData: { variantId, ...data },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return loadAdminProduct(productId, tx);
  });
}

// --------------------------------------------------------------------------
// DELETE /admin/products/:id/variants/:variantId - hapus varian
// --------------------------------------------------------------------------
export async function deleteVariant(
  productId: string,
  variantId: string,
  actorUserId: string,
  audit: AuditContext = {},
) {
  return withTransaction(async (tx) => {
    const product = await catalogRepo.findProductById(productId, tx);
    if (!product) throw notFound('Produk', productId);

    const variant = await adminRepo.findVariantForProduct(variantId, productId, tx);
    if (!variant) throw notFound('Varian', variantId);

    const total = await adminRepo.countVariants(productId, tx);
    if (total <= 1) {
      throw conflict('Produk harus punya minimal satu varian. Hapus produknya bila ingin menghilangkan.');
    }

    await adminRepo.deleteVariant(variantId, tx);
    await ensureSingleDefaultVariant(productId, tx);

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'admin.product.variant.delete',
        entityType: 'product',
        entityId: productId,
        oldData: { variantId },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return loadAdminProduct(productId, tx);
  });
}

// --------------------------------------------------------------------------
// Admin: Area tempat duduk & meja
// --------------------------------------------------------------------------

/** Admin: buat area baru pada sebuah cabang. */
export async function createArea(
  branchId: string,
  input: CreateAreaInput,
  actorUserId: string,
  audit: AuditContext = {},
) {
  const branch = await branchRepo.findBranchById(branchId);
  if (!branch) throw notFound('Cabang', branchId);

  const name = input.name.trim();
  if (await branchRepo.areaNameExists(branchId, name, null)) {
    throw conflict(`Area '${name}' sudah ada di cabang ini`);
  }

  const created = await branchRepo.insertArea({
    branchId,
    name,
    areaType: input.areaType,
    pricePerHourIdr: input.pricePerHourIdr ?? null,
    imageUrl: input.imageUrl ?? null,
    imageStorageKey: input.imageStorageKey ?? null,
    isActive: input.isActive,
  });

  await adminRepo.insertAuditLog({
    actorUserId,
    action: 'admin.area.create',
    entityType: 'dining_area',
    entityId: created ? String(created.id) : null,
    newData: { branchId, name, areaType: input.areaType },
    requestId: audit.requestId ?? null,
    ipAddress: audit.ipAddress ?? null,
  });

  return { imageUrl: null, ...(created ?? {}) };
}

/** Admin: ubah area (nama, tipe, aktif, gambar). Ganti gambar lama bila ada. */
export async function updateArea(
  areaId: string,
  input: UpdateAreaInput,
  actorUserId: string,
  audit: AuditContext = {},
) {
  const area = await branchRepo.findAreaById(areaId);
  if (!area) throw notFound('Area', areaId);

  const branchId = String(area.branchId);
  const name = input.name?.trim();

  if (name && name.toLowerCase() !== String(area.name).toLowerCase()) {
    if (await branchRepo.areaNameExists(branchId, name, areaId)) {
      throw conflict(`Area '${name}' sudah ada di cabang ini`);
    }
  }

  const oldStorageKey = area.imageStorageKey ? String(area.imageStorageKey) : null;

  const updated = await branchRepo.updateArea(areaId, {
    ...(name ? { name } : {}),
    ...(input.areaType ? { areaType: input.areaType } : {}),
    ...(input.pricePerHourIdr !== undefined ? { pricePerHourIdr: input.pricePerHourIdr } : {}),
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    // Kirim field gambar hanya bila memang dikirim (bisa null untuk menghapus).
    ...(input.imageUrl !== undefined || input.imageStorageKey !== undefined
      ? { imageUrl: input.imageUrl ?? null, imageStorageKey: input.imageStorageKey ?? null }
      : {}),
  });

  // Hapus gambar lama dari storage bila diganti/dihapus.
  const newStorageKey = updated?.imageStorageKey ? String(updated.imageStorageKey) : null;
  if (oldStorageKey && oldStorageKey !== newStorageKey) {
    await storageService.deleteImage(oldStorageKey);
  }

  await adminRepo.insertAuditLog({
    actorUserId,
    action: 'admin.area.update',
    entityType: 'dining_area',
    entityId: areaId,
    oldData: { name: area.name, areaType: area.areaType, imageStorageKey: oldStorageKey },
    newData: { name: updated?.name ?? null, areaType: updated?.areaType ?? null, imageStorageKey: newStorageKey },
    requestId: audit.requestId ?? null,
    ipAddress: audit.ipAddress ?? null,
  });

  return updated;
}

/** Admin: hapus area. Ditolak bila masih punya meja atau reservasi aktif. */
export async function deleteArea(areaId: string, actorUserId: string, audit: AuditContext = {}) {
  const area = await branchRepo.findAreaById(areaId);
  if (!area) throw notFound('Area', areaId);

  const tableCount = await branchRepo.countTablesInArea(areaId);
  if (tableCount > 0) {
    throw conflict(`Area masih memiliki ${tableCount} meja. Hapus meja-nya dulu.`);
  }

  const activeReservations = await branchRepo.listActiveReservationsInArea(areaId);
  if (activeReservations.length > 0) {
    const numbers = activeReservations
      .map((r) => r.reservationNumber ?? r.id)
      .slice(0, 3)
      .join(', ');
    const suffix = activeReservations.length > 3 ? ` (+${activeReservations.length - 3} lainnya)` : '';
    throw conflict(
      `Area masih dipakai reservasi aktif (${numbers}${suffix}). Selesaikan/batalkan dulu.`,
    );
  }

  // Lepas tautan ke reservasi yang sudah selesai/dibatalkan (tidak mengubah data reservasi).
  await branchRepo.deleteReservationRoomLinks(areaId);

  await branchRepo.deleteArea(areaId);

  const storageKey = area.imageStorageKey ? String(area.imageStorageKey) : null;
  if (storageKey) await storageService.deleteImage(storageKey);

  await adminRepo.insertAuditLog({
    actorUserId,
    action: 'admin.area.delete',
    entityType: 'dining_area',
    entityId: areaId,
    oldData: { name: area.name, areaType: area.areaType },
    requestId: audit.requestId ?? null,
    ipAddress: audit.ipAddress ?? null,
  });

  return { id: areaId };
}

/** Admin: buat meja baru di dalam sebuah area. */
export async function createTable(
  input: CreateTableInput,
  actorUserId: string,
  audit: AuditContext = {},
) {
  const area = await branchRepo.findAreaById(input.areaId);
  if (!area) throw notFound('Area', input.areaId);

  const tableCode = input.tableCode.trim().toUpperCase();
  const created = await branchRepo.insertTable({
    areaId: input.areaId,
    tableCode,
    capacity: input.capacity,
    isActive: input.isActive,
  });

  await adminRepo.insertAuditLog({
    actorUserId,
    action: 'admin.table.create',
    entityType: 'cafe_table',
    entityId: created ? String(created.id) : null,
    newData: { areaId: input.areaId, tableCode, capacity: input.capacity },
    requestId: audit.requestId ?? null,
    ipAddress: audit.ipAddress ?? null,
  });

  return created;
}

/** Admin: ubah meja (kode, kapasitas, aktif). */
export async function updateTable(
  tableId: string,
  input: UpdateTableInput,
  actorUserId: string,
  audit: AuditContext = {},
) {
  const table = await branchRepo.findTableById(tableId);
  if (!table) throw notFound('Meja', tableId);

  const updated = await branchRepo.updateTable(tableId, {
    ...(input.tableCode ? { tableCode: input.tableCode.trim().toUpperCase() } : {}),
    ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
  });

  await adminRepo.insertAuditLog({
    actorUserId,
    action: 'admin.table.update',
    entityType: 'cafe_table',
    entityId: tableId,
    oldData: { tableCode: table.tableCode, capacity: table.capacity },
    newData: { tableCode: updated?.tableCode ?? null, capacity: updated?.capacity ?? null },
    requestId: audit.requestId ?? null,
    ipAddress: audit.ipAddress ?? null,
  });

  return updated;
}

/** Admin: hapus meja. Ditolak bila masih terikat reservasi aktif. */
export async function deleteTable(tableId: string, actorUserId: string, audit: AuditContext = {}) {
  const table = await branchRepo.findTableById(tableId);
  if (!table) throw notFound('Meja', tableId);

  if (await branchRepo.tableHasReservation(tableId)) {
    throw conflict('Meja masih dipakai reservasi aktif. Selesaikan/batalkan dulu.');
  }

  await branchRepo.deleteTable(tableId);

  await adminRepo.insertAuditLog({
    actorUserId,
    action: 'admin.table.delete',
    entityType: 'cafe_table',
    entityId: tableId,
    oldData: { tableCode: table.tableCode, areaId: table.areaId },
    requestId: audit.requestId ?? null,
    ipAddress: audit.ipAddress ?? null,
  });

  return { id: tableId };
}

// --------------------------------------------------------------------------
// Admin: Reservasi
// --------------------------------------------------------------------------

export async function listAdminReservations(
  filters: reservationRepo.ListAdminReservationFilters,
  pagination: { page: number; limit: number; offset: number },
) {
  const rows = await reservationRepo.listAdminReservations(filters, pagination);
  const total = await reservationRepo.countAdminReservations(filters);
  return { items: rows.map(shapeAdminReservation), meta: buildPaginationMeta({ ...pagination, total }) };
}

export async function getAdminReservation(reservationId: string) {
  const reservation = await reservationRepo.findReservationById(reservationId);
  if (!reservation) throw notFound('Reservasi', reservationId);
  const [rooms, history, menuItems] = await Promise.all([
    reservationRepo.listReservationRooms(reservationId),
    reservationRepo.listReservationStatusHistory(reservationId),
    reservationRepo.listReservationMenuItems(reservationId),
  ]);
  return shapeAdminReservation({
    ...reservation,
    rooms,
    history: history.map(shapeReservationHistory),
    menuItems,
  });
}

export async function getReservationDepositSettings() {
  const row = await reservationRepo.getDepositSettings();
  return shapeDepositSettings(row);
}

export async function updateReservationDepositSettings(
  input: reservationRepo.UpdateDepositSettingsInput,
  actorUserId: string,
  audit: AuditContext = {},
) {
  if (input.dp1MinIdr > input.dp1MaxIdr) {
    throw badRequest('Batas minimum DP1 tidak boleh lebih besar dari batas maksimum');
  }

  return withTransaction(async (tx) => {
    const before = await reservationRepo.getDepositSettings(tx);
    const updated = await reservationRepo.updateDepositSettings(input, actorUserId, tx);

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'admin.reservation-settings.update',
        entityType: 'reservation_deposit_settings',
        entityId: null,
        oldData: before ? { ...before } : null,
        newData: updated ? { ...updated } : null,
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return shapeDepositSettings(updated);
  });
}

/** Bentuk respons pengaturan DP; fallback ke nilai bawaan bila baris kosong. */
function shapeDepositSettings(row: reservationRepo.DepositSettingsRow | null) {
  return {
    dp1Percent: Number(row?.dp1Percent ?? DEFAULT_DEPOSIT_SETTINGS.dp1Percent),
    dp1MinIdr: Number(row?.dp1MinIdr ?? DEFAULT_DEPOSIT_SETTINGS.dp1MinIdr),
    dp1MaxIdr: Number(row?.dp1MaxIdr ?? DEFAULT_DEPOSIT_SETTINGS.dp1MaxIdr),
    dp2Percent: Number(row?.dp2Percent ?? DEFAULT_DEPOSIT_SETTINGS.dp2Percent),
    updatedAt: row?.updatedAt ?? null,
    updatedBy: row?.updatedBy ?? null,
  };
}

export async function updateAdminReservationStatus(
  reservationId: string,
  input: UpdateReservationStatusInput,
  actorUserId: string,
  audit: AuditContext = {},
) {
  const { note, tableIds } = input;
  // Pengaturan DP hanya dipakai sebagai fallback bila nominal tahap belum
  // tersimpan. Reservasi lama tetap memakai nominal yang sudah disepakati.
  const depositSettings = await getDepositSettings();
  return withTransaction(async (tx) => {
    const before = await reservationRepo.findReservationById(reservationId, tx);
    if (!before) throw notFound('Reservasi', reservationId);
    const fromStatus = before.status ? String(before.status) : null;
    // `status` opsional: admin boleh hanya memverifikasi tahap DP (mis. DP2
    // lunas) tanpa mengubah status reservasi. Bila kosong, status tetap.
    const status = input.status ?? (fromStatus as NonNullable<typeof input.status> | null) ?? 'requested';

    // Jaga alur: status hanya boleh maju mengikuti langkah yang sah (atau
    // dibatalkan / ditandai tidak hadir). Mencegah lompatan seperti
    // 'requested' langsung 'completed'.
    if (fromStatus && fromStatus !== status && !isAllowedTransition(fromStatus, status)) {
      throw conflict(
        `Status tidak bisa diubah dari "${RESERVATION_STATUS_LABEL_ID[fromStatus] ?? fromStatus}" ke "${
          RESERVATION_STATUS_LABEL_ID[status] ?? status
        }"`,
      );
    }

    // DP hanya relevan setelah reservasi diterima.
    const touchesDeposit =
      input.depositStatus !== undefined ||
      input.deposit2Status !== undefined ||
      input.settlementStatus !== undefined;
    if (touchesDeposit && status === 'requested') {
      throw badRequest('Reservasi harus diterima dulu sebelum mengatur DP');
    }

    const updated = await reservationRepo.updateReservationStatusByStaff(reservationId, status, tx);
    if (!updated) throw notFound('Reservasi', reservationId);

    if (input.roomIds && input.roomIds.length > 0) {
      await reservationRepo.replaceReservationRooms(reservationId, input.roomIds, tx);
    } else if (tableIds && tableIds.length > 0) {
      await reservationRepo.updateReservationTables(reservationId, tableIds, tx);
    }

    // --- Data DP per tahap (kalau dikirim) --------------------------------
    // Tahap 1 (DP1): deposit* — nominal SELALU dihitung sistem (Rp300.000–500.000)
    const hasDeposit1 =
      input.depositStatus !== undefined ||
      input.depositProofUrl !== undefined ||
      input.depositProofStorageKey !== undefined ||
      input.depositNote !== undefined;

    if (hasDeposit1) {
      // Pastikan nominal DP1 selalu sesuai nominal sistem/tahap tersimpan
      // (tidak bisa diubah admin).
      const amountIdr = defaultDepositAmount('deposit', before, depositSettings);
      await reservationRepo.updateReservationDepositStage(
        reservationId,
        '',
        {
          amountIdr,
          status: input.depositStatus,
          proofUrl: input.depositProofUrl,
          proofStorageKey: input.depositProofStorageKey,
          note: input.depositNote,
          markPaid: true,
        },
        tx,
      );
    }

    // Tahap 2 (DP2 setelah konfirmasi): deposit* — nominal dihitung sistem (30% dari sisa)
    const hasDeposit2 =
      input.deposit2Status !== undefined ||
      input.deposit2ProofUrl !== undefined ||
      input.deposit2ProofStorageKey !== undefined ||
      input.deposit2Note !== undefined;

    if (hasDeposit2) {
      const amountIdr = defaultDepositAmount('deposit2', before, depositSettings);
      await reservationRepo.updateReservationDepositStage(
        reservationId,
        'deposit2',
        {
          amountIdr,
          status: input.deposit2Status,
          proofUrl: input.deposit2ProofUrl,
          proofStorageKey: input.deposit2ProofStorageKey,
          note: input.deposit2Note,
          markPaid: true,
        },
        tx,
      );
    }

    // Tahap 3 (pelunasan): settlement* — nominal dihitung sistem
    const hasSettlement =
      input.settlementStatus !== undefined ||
      input.settlementProofUrl !== undefined ||
      input.settlementProofStorageKey !== undefined ||
      input.settlementNote !== undefined;

    if (hasSettlement) {
      const amountIdr = defaultDepositAmount('settlement', before, depositSettings);
      await reservationRepo.updateReservationDepositStage(
        reservationId,
        'settlement',
        {
          amountIdr,
          status: input.settlementStatus,
          proofUrl: input.settlementProofUrl,
          proofStorageKey: input.settlementProofStorageKey,
          note: input.settlementNote,
          markPaid: true,
        },
        tx,
      );
    }

    // Catat ke riwayat status (dipakai untuk notifikasi ke pelanggan).
    // Bila admin hanya memverifikasi tahap DP tanpa mengubah status, tetap
    // catat satu entri agar pelanggan tahu pembayarannya sudah dikonfirmasi.
    let historyNote = note ?? null;
    if (!historyNote && fromStatus === status) {
      const verifiedStages: string[] = [];
      if (input.depositStatus === 'paid') verifiedStages.push('DP1');
      if (input.deposit2Status === 'paid') verifiedStages.push('DP2');
      if (input.settlementStatus === 'paid') verifiedStages.push('Pelunasan');
      if (verifiedStages.length > 0) {
        historyNote = `Pembayaran ${verifiedStages.join(' & ')} diverifikasi oleh staff`;
      }
    }
    if (fromStatus !== status || historyNote) {
      await reservationRepo.insertReservationStatusHistory(
        { reservationId, fromStatus, toStatus: status, note: historyNote, actorUserId },
        tx,
      );
    }

    const refreshed = await reservationRepo.findReservationById(reservationId, tx);
    const refreshedRooms = await reservationRepo.listReservationRooms(reservationId, tx);
    const history = await reservationRepo.listReservationStatusHistory(reservationId, tx);

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'admin.reservation.status.update',
        entityType: 'reservation',
        entityId: reservationId,
        oldData: { status: fromStatus },
        newData: {
          status,
          note,
          roomIds: input.roomIds,
          deposit: input.depositStatus,
          deposit2: input.deposit2Status,
          settlement: input.settlementStatus,
        },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return shapeAdminReservation({
      ...refreshed!,
      rooms: refreshedRooms,
      history: history.map(shapeReservationHistory),
    });
  });
}

/**
 * Buat link/QR pembayaran DP reservasi lewat Midtrans (dipakai CS).
 *
 * Alur: pastikan reservasi sudah `confirmed` dan tahap DP belum lunas → bikin
 * baris `payment_transactions` (purpose `reservation_deposit`) → minta Midtrans
 * Snap mengembalikan halaman pembayaran → simpan URL-nya. Saat pelanggan
 * membayar, webhook/verify menandai tahap itu `paid` (lihat
 * `markReservationDepositPaid`).
 *
 * Tahap (`stage`):
 *   deposit    → DP1 (uang muka awal)
 *   deposit2   → DP2 (setelah konfirmasi, default 50% dari total)
 *   settlement → Pelunasan (sisa total − DP1 − DP2)
 */
export async function createReservationDepositCharge(
  reservationId: string,
  input: {
    stage?: 'deposit' | 'deposit2' | 'settlement';
    paymentMethod?: string;
    idempotencyKey?: string | null;
  },
  actorUserId: string,
  audit: AuditContext = {},
) {
  const reservation = await reservationRepo.findReservationById(reservationId);
  if (!reservation) throw notFound('Reservasi', reservationId);

  const stage = input.stage ?? 'deposit';
  const status = reservation.status ? String(reservation.status) : null;
  if (status === 'requested' && stage !== 'deposit') {
    throw badRequest('Terima (konfirmasi) reservasi dulu sebelum membuat pembayaran DP lanjutan');
  }
  if (status === 'cancelled' || status === 'no_show') {
    throw unprocessable('Reservasi sudah dibatalkan/tidak hadir sehingga DP tidak perlu dibayar');
  }

  const totalEstimateIdr = Number(reservation.totalEstimateIdr ?? 0);
  const settlementPaid = reservation.settlementStatus === 'paid';

  // Nominal selalu dari hitungan sistem — tidak bisa ditimpa admin.
  if (stage !== 'settlement' && totalEstimateIdr <= 0) {
    throw badRequest('Total sewa ruangan belum diketahui. Isi harga sewa per jam ruangan dulu');
  }
  const amountIdr = defaultDepositAmount(stage, reservation);

  if (!Number.isFinite(amountIdr) || amountIdr <= 0) {
    throw badRequest(
      stage === 'settlement'
        ? 'Tidak ada sisa yang perlu dilunasi (total belum diisi atau sudah lunas)'
        : 'Nominal DP belum tersedia. Isi harga sewa ruangan dulu',
    );
  }

  const stageStatus = stage === 'deposit' ? 'depositStatus' : stage === 'deposit2' ? 'deposit2Status' : 'settlementStatus';
  const currentStageStatus = reservation[stageStatus] ? String(reservation[stageStatus]) : 'unpaid';
  if (currentStageStatus === 'paid') throw unprocessable('Tahap pembayaran ini sudah lunas');
  if (stage === 'settlement' && settlementPaid) throw unprocessable('Pelunasan sudah lunas');

  const paymentMethod = input.paymentMethod ?? 'qris';
  const idempotencyKey =
    input.idempotencyKey ?? `resv-${stage}-${reservationId}-${randomUUID()}`;
  const provider = 'midtrans';

  // 1) Catat transaksi (status pending) di dalam transaksi DB.
  const payment = await withTransaction(async (tx) => {
    const inserted = await paymentRepo.insertPayment(
      {
        reservationId,
        provider,
        paymentMethod,
        idempotencyKey,
        transactionType: 'charge',
        paymentPurpose: 'reservation_deposit',
        paymentStage: stage,
        amountIdr,
      },
      tx,
    );

    // Tandai tahap ini menunggu pembayaran supaya CS melihat statusnya.
    await reservationRepo.updateReservationDepositStage(
      reservationId,
      stage === 'deposit' ? '' : stage === 'deposit2' ? 'deposit2' : 'settlement',
      { amountIdr, status: 'pending' },
      tx,
    );

    const stageLabel =
      stage === 'deposit' ? 'DP1' : stage === 'deposit2' ? 'DP2' : 'Pelunasan';
    await reservationRepo.insertReservationStatusHistory(
      {
        reservationId,
        fromStatus: status,
        toStatus: status ?? 'confirmed',
        note: `Link pembayaran ${stageLabel} dibuat (Rp${amountIdr.toLocaleString('id-ID')})`,
        actorUserId,
      },
      tx,
    );

    return inserted;
  });

  // 2) Panggil gateway di luar transaksi (Midtrans Snap → redirect_url).
  let paymentUrl: string | null = null;
  let expiresAt: Date | null = null;
  try {
    const charge = await getPaymentGateway().createCharge({
      paymentId: String(payment!.id),
      provider,
      paymentMethod,
      amountIdr,
      currency: 'IDR',
      paymentPurpose: 'reservation_deposit',
      reservationId,
      idempotencyKey,
    });
    paymentUrl = charge.instructions?.paymentUrl ?? null;
    expiresAt = charge.expiresAt ?? null;
    await paymentRepo.updatePaymentStatus(
      String(payment!.id),
      { status: 'pending', paymentUrl, expiresAt },
      undefined,
    );
  } catch (error) {
    await paymentRepo.updatePaymentStatus(String(payment!.id), { status: 'failed' }, undefined);
    throw error;
  }

  await adminRepo.insertAuditLog({
    actorUserId,
    action: 'admin.reservation.deposit.charge',
    entityType: 'reservation',
    entityId: reservationId,
    oldData: { stage, stageStatus: currentStageStatus },
    newData: { stage, amountIdr, paymentId: payment!.id, paymentUrl },
    requestId: audit.requestId ?? null,
    ipAddress: audit.ipAddress ?? null,
  });

  const refreshed = await reservationRepo.findReservationById(reservationId);
  const [rooms, history] = await Promise.all([
    reservationRepo.listReservationRooms(reservationId),
    reservationRepo.listReservationStatusHistory(reservationId),
  ]);

  return {
    reservation: shapeAdminReservation({
      ...refreshed!,
      rooms,
      history: history.map(shapeReservationHistory),
    }),
    payment: {
      id: String(payment!.id),
      stage,
      status: 'pending',
      amountIdr,
      paymentMethod,
      paymentUrl,
      expiresAt: iso(expiresAt),
    },
  };
}

/** Nomor reservasi unik, dibuat di dalam transaksi agar tidak bentrok. */
async function generateUniqueReservationNumber(tx: TransactionClient): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = generateReservationNumber();
    if (!(await reservationRepo.reservationNumberExists(candidate, tx))) return candidate;
  }
  throw conflict('Gagal membuat nomor reservasi unik');
}

/**
 * Tambah reservasi atas nama pelanggan. Staf memilih pelanggan, boleh langsung
 * menetapkan status, dan tidak diwajibkan ada meja tersedia (entri manual).
 */
export async function createAdminReservation(
  input: CreateAdminReservationInput,
  actorUserId: string,
  audit: AuditContext = {},
) {
  const reservedFor = new Date(input.reservedFor);
  if (Number.isNaN(reservedFor.getTime())) throw badRequest('Waktu reservasi tidak valid');

  // Reservasi walk-in/telepon tidak harus punya akun pelanggan. Pemilik baris
  // tetap staf yang mencatat agar FK user_id tetap valid.
  const ownerUserId = input.userId ?? actorUserId;
  const user = await authRepo.findUserById(ownerUserId);
  if (!user) throw notFound('Pengguna', ownerUserId);

  const branch = await branchRepo.findBranchById(input.branchId);
  if (!branch) throw notFound('Cabang', input.branchId);

  if (input.areaId) {
    const area = await branchRepo.findAreaById(input.areaId);
    if (!area) throw notFound('Area', input.areaId);
  }

  return withTransaction(async (tx) => {
    const reservationNumber = await generateUniqueReservationNumber(tx);
    const inserted = await reservationRepo.insertReservation(
      {
        reservationNumber,
        userId: ownerUserId,
        branchId: input.branchId,
        areaId: input.areaId ?? null,
        reservedFor,
        durationMinutes: input.durationMinutes,
        guestCount: input.guestCount,
        seatingPreference: input.seatingPreference ?? null,
        specialRequests: input.specialRequests ?? null,
        contactName: input.contactName ?? null,
        contactPhone: input.contactPhone ?? null,
        status: input.status,
      },
      tx,
    );
    if (!inserted) throw conflict('Reservasi gagal dibuat, silakan coba lagi');

    const reservationId = str(inserted.id);
    if (input.tableIds.length > 0) {
      await reservationRepo.replaceReservationTables(reservationId, input.tableIds, tx);
    }

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'admin.reservation.create',
        entityType: 'reservation',
        entityId: reservationId,
        oldData: null,
        newData: {
          reservationNumber,
          status: input.status,
          userId: ownerUserId,
          contactName: input.contactName ?? null,
          contactPhone: input.contactPhone ?? null,
        },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    const row = await reservationRepo.findAdminReservationById(reservationId, tx);
    return shapeAdminReservation(row ?? {});
  });
}

export async function deleteAdminReservation(
  reservationId: string,
  actorUserId: string,
  audit: AuditContext = {},
) {
  return withTransaction(async (tx) => {
    const existing = await reservationRepo.findReservationById(reservationId, tx);
    if (!existing) throw notFound('Reservasi', reservationId);

    // Baris reservation_tables ikut terhapus lewat cascade FK.
    await reservationRepo.deleteReservation(reservationId, tx);

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'admin.reservation.delete',
        entityType: 'reservation',
        entityId: reservationId,
        oldData: {
          reservationNumber: str(existing.reservation_number),
          status: str(existing.status),
        },
        newData: null,
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return { id: reservationId, deleted: true };
  });
}

/**
 * Transisi status reservasi yang sah. Status final (completed/cancelled/no_show)
 * tidak punya tujuan lanjutan — koreksi hanya lewat database/audit.
 */
const RESERVATION_TRANSITIONS: Record<string, string[]> = {
  requested: ['confirmed', 'cancelled', 'no_show'],
  confirmed: ['seated', 'completed', 'cancelled', 'no_show'],
  seated: ['completed', 'cancelled', 'no_show'],
  completed: [],
  cancelled: [],
  no_show: [],
};

/** Label Bahasa Indonesia untuk pesan galat transisi status. */
const RESERVATION_STATUS_LABEL_ID: Record<string, string> = {
  requested: 'Diajukan',
  confirmed: 'Diterima',
  seated: 'Sudah Duduk',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
  no_show: 'Tidak Hadir',
};

function isAllowedTransition(from: string, to: string): boolean {
  return (RESERVATION_TRANSITIONS[from] ?? []).includes(to);
}

function shapeAdminReservation(row: Record<string, unknown>) {
  const numOrNull = (value: unknown) => (value == null ? null : num(value));
  const reservedFor = iso(row.reservedFor ?? row.reserved_for);
  const durationMinutes = num(row.durationMinutes ?? row.duration_minutes);
  const endsAt =
    reservedFor && durationMinutes > 0
      ? new Date(new Date(reservedFor).getTime() + durationMinutes * 60_000).toISOString()
      : null;
  const rawRooms = Array.isArray(row.rooms) ? row.rooms.filter(Boolean) : [];
  const rooms = rawRooms.map((room) => shapeAdminRoom(room as Record<string, unknown>));
  return {
    id: str(row.id),
    reservationNumber: str(row.reservationNumber ?? row.reservation_number),
    branchId: str(row.branchId ?? row.branch_id),
    branchName: strOrNull(row.branchName ?? row.branch_name),
    branchPhone: strOrNull(row.branchPhone ?? row.branch_phone),
    branchEmail: strOrNull(row.branchEmail ?? row.branch_email),
    branchAddress: strOrNull(row.branchAddress ?? row.branch_address),
    areaId: strOrNull(row.areaId ?? row.area_id),
    areaName: strOrNull(row.areaName ?? row.area_name),
    rooms,
    reservedFor,
    endsAt,
    durationMinutes,
    guestCount: num(row.guestCount ?? row.guest_count),
    status: str(row.status),
    userName: strOrNull(row.userName ?? row.user_name),
    userEmail: strOrNull(row.userEmail ?? row.user_email),
    contactName: strOrNull(row.contactName ?? row.contact_name),
    contactPhone: strOrNull(row.contactPhone ?? row.contact_phone),
    userPhone:
      strOrNull(row.contactPhone ?? row.contact_phone) ??
      strOrNull(row.userPhone ?? row.user_phone),
    specialRequests: strOrNull(row.specialRequests ?? row.special_requests),
    tables: Array.isArray(row.tables) ? row.tables.filter(Boolean) : (row.tables ? [row.tables].filter(Boolean) : []),
    // Sewa ruangan + order menu (total = sewa + makanan/minuman)
    areaPricePerHourIdr: numOrNull(row.areaPricePerHourIdr ?? row.area_price_per_hour_idr),
    totalEstimateIdr: numOrNull(row.totalEstimateIdr ?? row.total_estimate_idr),
    roomTotalIdr: numOrNull(row.roomTotalIdr ?? row.room_total_idr),
    menuTotalIdr: numOrNull(row.menuTotalIdr ?? row.menu_total_idr),
    menuItems: Array.isArray(row.menuItems)
      ? row.menuItems.filter(Boolean).map(shapeAdminMenuItem)
      : [],
    // DP1
    depositAmountIdr: numOrNull(row.depositAmountIdr ?? row.deposit_amount_idr),
    depositStatus: strOrNull(row.depositStatus ?? row.deposit_status) ?? 'unpaid',
    depositProofUrl: strOrNull(row.depositProofUrl ?? row.deposit_proof_url),
    depositPaidAt: iso(row.depositPaidAt ?? row.deposit_paid_at),
    depositNote: strOrNull(row.depositNote ?? row.deposit_note),
    // DP2
    deposit2AmountIdr: numOrNull(row.deposit2AmountIdr ?? row.deposit2_amount_idr),
    deposit2Status: strOrNull(row.deposit2Status ?? row.deposit2_status) ?? 'unpaid',
    deposit2ProofUrl: strOrNull(row.deposit2ProofUrl ?? row.deposit2_proof_url),
    deposit2PaidAt: iso(row.deposit2PaidAt ?? row.deposit2_paid_at),
    deposit2Note: strOrNull(row.deposit2Note ?? row.deposit2_note),
    // Pelunasan
    settlementAmountIdr: numOrNull(row.settlementAmountIdr ?? row.settlement_amount_idr),
    settlementStatus: strOrNull(row.settlementStatus ?? row.settlement_status) ?? 'unpaid',
    settlementProofUrl: strOrNull(row.settlementProofUrl ?? row.settlement_proof_url),
    settlementPaidAt: iso(row.settlementPaidAt ?? row.settlement_paid_at),
    settlementNote: strOrNull(row.settlementNote ?? row.settlement_note),
    history: Array.isArray(row.history) ? row.history : [],
    createdAt: iso(row.createdAt ?? row.created_at),
  };
}

/**
 * Normalisasi satu ruangan (area) reservasi untuk respons admin. Menerima
 * bentuk json_agg (`areaId…`) maupun snake_case dari `listReservationRooms`.
 */
function shapeAdminRoom(row: Record<string, unknown>) {
  const numOrNull = (value: unknown) => (value == null ? null : num(value));
  return {
    areaId: str(row.areaId ?? row.area_id),
    name: str(row.name),
    areaType: strOrNull(row.areaType ?? row.area_type),
    pricePerHourIdr: numOrNull(row.pricePerHourIdr ?? row.price_per_hour_idr),
    imageUrl: strOrNull(row.imageUrl ?? row.image_url),
  };
}

/** Bentuk satu baris riwayat status reservasi. */
function shapeReservationHistory(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    fromStatus: strOrNull(row.fromStatus ?? row.from_status),
    toStatus: str(row.toStatus ?? row.to_status),
    note: strOrNull(row.note),
    actorName: strOrNull(row.actorName ?? row.actor_name),
    createdAt: iso(row.createdAt ?? row.created_at),
  };
}

/** Bentuk satu baris order menu reservasi (makanan/minuman) untuk admin. */
function shapeAdminMenuItem(row: Record<string, unknown>) {
  const numOrNull = (value: unknown) => (value == null ? null : num(value));
  return {
    id: str(row.id),
    productId: strOrNull(row.productId ?? row.product_id),
    variantId: strOrNull(row.variantId ?? row.variant_id),
    productName: str(row.productName ?? row.product_name),
    variantName: strOrNull(row.variantName ?? row.variant_name),
    quantity: num(row.quantity),
    unitPriceIdr: numOrNull(row.unitPriceIdr ?? row.unit_price_idr),
    modifiersTotalIdr: numOrNull(row.modifiersTotalIdr ?? row.modifiers_total_idr),
    lineTotalIdr: numOrNull(row.lineTotalIdr ?? row.line_total_idr),
    note: strOrNull(row.note),
  };
}

// --------------------------------------------------------------------------
// Admin: Booking Event
// --------------------------------------------------------------------------

export async function listAdminEventBookings(
  filters: eventRepo.ListAdminEventBookingFilters,
  pagination: { page: number; limit: number; offset: number },
) {
  const rows = await eventRepo.listAdminEventBookings(filters, pagination);
  const total = await eventRepo.countAdminEventBookings(filters);
  return { items: rows.map(shapeAdminEventBooking), meta: buildPaginationMeta({ ...pagination, total }) };
}

export async function getAdminEventBooking(bookingId: string) {
  const booking = await eventRepo.findBookingById(bookingId);
  if (!booking) throw notFound('Booking Event', bookingId);

  const [catering, addons] = await Promise.all([
    eventRepo.listBookingCatering(bookingId),
    eventRepo.listBookingAddons(bookingId),
  ]);

  return shapeAdminEventBooking({ ...booking, catering, addons });
}

export async function updateAdminEventBookingStatus(
  bookingId: string,
  status: string,
  note: string | null,
  quoteIdr: number | null,
  depositPercent: number | null,
  actorUserId: string,
  audit: AuditContext = {},
) {
  return withTransaction(async (tx) => {
    const updated = await eventRepo.updateEventBookingStatus(
      bookingId,
      status,
      note,
      quoteIdr,
      depositPercent,
      tx,
    );
    if (!updated) throw notFound('Booking Event', bookingId);

    const [catering, addons] = await Promise.all([
      eventRepo.listBookingCatering(bookingId, tx),
      eventRepo.listBookingAddons(bookingId, tx),
    ]);

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'admin.event_booking.status.update',
        entityType: 'event_booking',
        entityId: bookingId,
        oldData: { status: updated.status },
        newData: { status, note, quoteIdr, depositPercent },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return shapeAdminEventBooking({ ...updated, catering, addons });
  });
}

/**
 * Tambah booking event atas nama pelanggan. Memakai alur createBooking agar
 * validasi paket/katering/bentrok jadwal tetap sama; status awal boleh ditimpa
 * staf setelah booking dibuat.
 */
export async function createAdminEventBooking(
  input: CreateAdminEventBookingInput,
  actorUserId: string,
  audit: AuditContext = {},
) {
  const user = await authRepo.findUserById(input.userId);
  if (!user) throw notFound('Pengguna', input.userId);

  const created = await eventService.createBooking(input.userId, {
    branchId: input.branchId,
    eventPackageId: input.eventPackageId ?? null,
    eventType: input.eventType,
    eventName: input.eventName ?? null,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    guestCount: input.guestCount,
    customRequests: input.customRequests ?? null,
    catering: input.catering,
    addons: input.addons,
    depositPercent: input.depositPercent,
    autoCreateDeposit: false,
  });

  const bookingId = created.booking.id;

  await adminRepo.insertAuditLog({
    actorUserId,
    action: 'admin.event_booking.create',
    entityType: 'event_booking',
    entityId: bookingId,
    oldData: null,
    newData: {
      bookingNumber: created.booking.bookingNumber,
      status: created.booking.status,
      userId: input.userId,
    },
    requestId: audit.requestId ?? null,
    ipAddress: audit.ipAddress ?? null,
  });

  if (input.status && input.status !== created.booking.status) {
    await updateAdminEventBookingStatus(bookingId, input.status, null, null, null, actorUserId, audit);
  }

  return getAdminEventBooking(bookingId);
}

export async function deleteAdminEventBooking(
  bookingId: string,
  actorUserId: string,
  audit: AuditContext = {},
) {
  return withTransaction(async (tx) => {
    const existing = await eventRepo.findBookingById(bookingId, tx);
    if (!existing) throw notFound('Booking Event', bookingId);

    // Menghapus booking sekaligus riwayat pembayarannya (payment_transactions).
    await eventRepo.deleteEventBooking(bookingId, tx);

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'admin.event_booking.delete',
        entityType: 'event_booking',
        entityId: bookingId,
        oldData: {
          bookingNumber: str(existing.booking_number),
          status: str(existing.status),
          subtotalIdr: num(existing.subtotal_idr),
        },
        newData: null,
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return { id: bookingId, deleted: true };
  });
}

function shapeAdminEventBooking(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    bookingNumber: str(row.bookingNumber ?? row.booking_number),
    branchId: str(row.branchId ?? row.branch_id),
    branchName: strOrNull(row.branchName ?? row.branch_name),
    eventType: str(row.eventType ?? row.event_type),
    eventName: strOrNull(row.eventName ?? row.event_name),
    startsAt: iso(row.startsAt ?? row.starts_at),
    endsAt: iso(row.endsAt ?? row.ends_at),
    guestCount: num(row.guestCount ?? row.guest_count),
    eventPackageName: strOrNull(row.eventPackageNameSnapshot ?? row.event_package_name_snapshot),
    eventPackagePriceIdr: roundIdr(num(row.eventPackagePriceSnapshotIdr ?? row.event_package_price_snapshot_idr)),
    subtotalIdr: roundIdr(num(row.subtotalIdr ?? row.subtotal_idr)),
    depositIdr: roundIdr(num(row.depositIdr ?? row.deposit_idr)),
    paidIdr: roundIdr(num(row.paidIdr ?? row.paid_idr)),
    status: str(row.status),
    userName: strOrNull(row.userName ?? row.user_name),
    userEmail: strOrNull(row.userEmail ?? row.user_email),
    userPhone: strOrNull(row.userPhone ?? row.user_phone),
    customRequests: strOrNull(row.customRequests ?? row.custom_requests),
    catering: row.catering ?? [],
    addons: row.addons ?? [],
    createdAt: iso(row.createdAt ?? row.created_at),
  };
}

// --------------------------------------------------------------------------
// Admin: Chat / Support
// --------------------------------------------------------------------------

export async function listAdminChatConversations(
  filters: chatRepo.ListAdminConversationFilters,
  pagination: { page: number; limit: number; offset: number },
) {
  const rows = await chatRepo.listAdminConversations(filters, pagination);
  const total = await chatRepo.countAdminConversations(filters);
  return { items: rows.map(shapeAdminConversation), meta: buildPaginationMeta({ ...pagination, total }) };
}

function shapeAdminConversation(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    userId: str(row.userId ?? row.user_id),
    userName: str(row.userName ?? row.user_name),
    userEmail: strOrNull(row.userEmail ?? row.user_email),
    userPhone: strOrNull(row.userPhone ?? row.user_phone),
    assignedStaffId: strOrNull(row.assignedStaffId ?? row.assigned_staff_id),
    assignedStaffName: strOrNull(row.staffName ?? row.staff_name),
    topic: str(row.topic),
    category: str(row.category ?? 'general'),
    status: str(row.status),
    lastMessagePreview: strOrNull(row.lastMessage ?? row.last_message),
    lastMessageAt: iso(row.lastMessageAt ?? row.last_message_at),
    messageCount: num(row.messageCount ?? row.message_count),
    unreadCount: num(row.unreadCount ?? row.unread_count),
    createdAt: iso(row.createdAt ?? row.created_at),
  };
}

// --------------------------------------------------------------------------
// Admin: Moment Moderation
// --------------------------------------------------------------------------

export async function listAdminMoments(
  filters: momentRepo.ListAdminMomentFilters,
  pagination: { page: number; limit: number; offset: number },
) {
  const rows = await momentRepo.listAdminMoments(filters, pagination);
  const total = await momentRepo.countAdminMoments(filters);
  return { items: rows.map(shapeAdminMoment), meta: buildPaginationMeta({ ...pagination, total }) };
}

export async function moderateMoment(
  momentId: string,
  moderationStatus: string,
  note: string | null,
  actorUserId: string,
  audit: AuditContext = {},
) {
  return withTransaction(async (tx) => {
    const existing = await momentRepo.findMomentById(momentId, tx);
    if (!existing) throw notFound('Moment', momentId);

    const updated = await momentRepo.moderateMoment(momentId, moderationStatus, tx);
    if (!updated) throw notFound('Moment', momentId);

    if (note) {
      await tx.query(
        `UPDATE semoet_moments SET caption = COALESCE(caption, '') || '\n[Moderator ' + now() + '] ' || $2 WHERE id = $1`,
        [momentId, note],
      );
    }

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'admin.moment.moderate',
        entityType: 'moment',
        entityId: momentId,
        oldData: { moderationStatus: existing.moderation_status },
        newData: { moderationStatus, note },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return shapeAdminMoment(updated);
  });
}

/** Hapus moment (moderator) — berbeda dari hapus milik pemilik, ini bisa
 *  menghapus moment siapa pun; baris media ikut terhapus lewat cascade FK. */
export async function deleteAdminMoment(
  momentId: string,
  actorUserId: string,
  audit: AuditContext = {},
) {
  return withTransaction(async (tx) => {
    const existing = await momentRepo.findMomentById(momentId, tx);
    if (!existing) throw notFound('Moment', momentId);

    const removed = await momentRepo.deleteMoment(momentId, null, tx);
    if (!removed) throw notFound('Moment', momentId);

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'admin.moment.delete',
        entityType: 'moment',
        entityId: momentId,
        oldData: { moderationStatus: str(existing.moderation_status) },
        newData: null,
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return { id: momentId, deleted: true };
  });
}

function shapeAdminMoment(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    userId: strOrNull(row.userId ?? row.user_id),
    authorName: str(row.authorName ?? row.author_name),
    authorEmail: strOrNull(row.authorEmail ?? row.author_email),
    title: strOrNull(row.title),
    caption: strOrNull(row.caption),
    eventType: strOrNull(row.eventType ?? row.event_type),
    moderationStatus: str(row.moderationStatus ?? row.moderation_status),
    media: row.media ?? [],
    createdAt: iso(row.createdAt ?? row.created_at),
  };
}