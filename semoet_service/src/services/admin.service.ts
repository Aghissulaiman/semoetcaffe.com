import type { z } from 'zod';
import { withTransaction, type TransactionClient } from '../config/database.js';
import { ROLE_CODE, USER_STATUS, type UserStatus } from '../config/constants.js';
import { badRequest, conflict, notFound, unprocessable } from '../errors/AppError.js';
import * as adminRepo from '../repositories/admin.repository.js';
import * as authRepo from '../repositories/auth.repository.js';
import * as branchRepo from '../repositories/branch.repository.js';
import * as catalogRepo from '../repositories/catalog.repository.js';
import * as chatRepo from '../repositories/chat.repository.js';
import * as inventoryRepo from '../repositories/inventory.repository.js';
import * as momentRepo from '../repositories/moment.repository.js';
import * as storageService from './storage.service.js';
import { generateUniqueSlug } from '../utils/codeGenerator.js';
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
  createProductSchema,
  createUserSchema,
  listPermissionQuerySchema,
  listRoleQuerySchema,
  productVariantInputSchema,
  reportProductQuerySchema,
  reportSalesQuerySchema,
  salesSummaryQuerySchema,
  topProductQuerySchema,
  updateProductSchema,
  updateRoleSchema,
  updateUserSchema,
  updateUserStatusSchema,
  updateVariantCostsSchema,
  updateVariantSchema,
  uploadImageSchema,
  type AssignRoleInput,
  type AuditLogQuery,
  type CreateRoleInput,
  type ListAdminUserQuery,
  type SalesDashboardQuery,
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
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type UpdateVariantInput = z.infer<typeof updateVariantSchema>;
export type ProductVariantInput = z.infer<typeof productVariantInputSchema>;
export type UploadImageInput = z.infer<typeof uploadImageSchema>;

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
    from: query.from,
    to: query.to,
  };

  const rows = await adminRepo.listAuditLogs(filters, paging);
  const total = await adminRepo.countAuditLogs(filters);

  const pagination: Pagination = { page: paging.page, limit: paging.limit, offset: paging.offset, total };
  return { items: rows.map(shapeAuditLog), meta: buildPaginationMeta(pagination) };
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

    const deleted = await adminRepo.softDeleteProduct(productId, tx);
    if (!deleted) throw notFound('Produk', productId);

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'admin.product.delete',
        entityType: 'product',
        entityId: productId,
        oldData: { name: str(current.name), isActive: bool(current.isActive) },
        newData: { deleted: true, soft: true },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return { id: productId, deleted: true, soft: true };
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