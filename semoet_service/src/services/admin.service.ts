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
import { roundIdr } from '../utils/money.js';
import {
  buildPaginationMeta,
  parsePagination,
  MAX_LIMIT,
  type Pagination,
} from '../utils/pagination.js';
import { bool, iso, num, str, strOrNull } from '../utils/serialize.js';
import {
  listPermissionQuerySchema,
  listRoleQuerySchema,
  reportProductQuerySchema,
  reportSalesQuerySchema,
  salesSummaryQuerySchema,
  topProductQuerySchema,
  updateRoleSchema,
  updateUserStatusSchema,
  updateVariantCostsSchema,
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