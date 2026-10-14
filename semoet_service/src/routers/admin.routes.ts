import { Router } from 'express';
import * as adminController from '../controllers/admin.controller.js';
import { ACTIONS, RESOURCES } from '../config/constants.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { authenticate } from '../middlewares/authenticate.js';
import { readLimiter, writeLimiter } from '../middlewares/rateLimit.js';
import { requireAdmin, requirePermission, requireStaff } from '../middlewares/rbac.js';
import { validate } from '../middlewares/validate.js';
import { uuidParamSchema } from '../validators/common.validator.js';
import {
  assignRoleSchema,
  auditLogQuerySchema,
  createRoleSchema,
  listAdminUserQuerySchema,
  listPermissionQuerySchema,
  listRoleQuerySchema,
  reportProductQuerySchema,
  reportSalesQuerySchema,
  salesDashboardQuerySchema,
  salesSummaryQuerySchema,
  topProductQuerySchema,
  updateRoleSchema,
  updateUserStatusSchema,
  updateVariantCostsSchema,
  userIdParamSchema,
} from '../validators/admin.validator.js';

export const adminRouter = Router();

// GET /admin/dashboard/sales - penjualan harian dari view daily_order_sales
adminRouter.get(
  '/admin/dashboard/sales',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.ORDER, ACTIONS.READ),
  readLimiter,
  validate({ query: salesDashboardQuerySchema }),
  asyncHandler(adminController.salesDashboard),
);

// GET /admin/dashboard/sales-summary - total omzet, rata-rata pesanan, sebaran status
adminRouter.get(
  '/admin/dashboard/sales-summary',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.ORDER, ACTIONS.READ),
  readLimiter,
  validate({ query: salesSummaryQuerySchema }),
  asyncHandler(adminController.salesSummary),
);

// GET /admin/dashboard/top-products - produk terlaris pada rentang tertentu
adminRouter.get(
  '/admin/dashboard/top-products',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.ORDER, ACTIONS.READ),
  readLimiter,
  validate({ query: topProductQuerySchema }),
  asyncHandler(adminController.topProducts),
);

// GET /admin/dashboard/overview - ringkasan operasional untuk kartu dashboard
adminRouter.get(
  '/admin/dashboard/overview',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.ORDER, ACTIONS.READ),
  readLimiter,
  asyncHandler(adminController.overview),
);

// GET /admin/reports/sales - akumulasi diskon, penjualan kotor/bersih, modal, laba, qty
adminRouter.get(
  '/admin/reports/sales',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.ORDER, ACTIONS.READ),
  readLimiter,
  validate({ query: reportSalesQuerySchema }),
  asyncHandler(adminController.reportSales),
);

// GET /admin/reports/products - rekap penjualan per produk (bisa dicari)
adminRouter.get(
  '/admin/reports/products',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.ORDER, ACTIONS.READ),
  readLimiter,
  validate({ query: reportProductQuerySchema }),
  asyncHandler(adminController.reportProducts),
);

// GET /admin/products/:id/variants - daftar varian beserta HPP (khusus admin)
adminRouter.get(
  '/admin/products/:id/variants',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.MENU, ACTIONS.READ),
  readLimiter,
  validate({ params: uuidParamSchema }),
  asyncHandler(adminController.productVariantsWithCost),
);

// PATCH /admin/products/:id/variant-costs - perbarui HPP tiap varian produk
adminRouter.patch(
  '/admin/products/:id/variant-costs',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.MENU, ACTIONS.UPDATE),
  writeLimiter,
  validate({ params: uuidParamSchema, body: updateVariantCostsSchema }),
  asyncHandler(adminController.updateVariantCosts),
);

// GET /admin/audit-logs - jejak perubahan data sensitif (hanya baca)
adminRouter.get(
  '/admin/audit-logs',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.AUDIT, ACTIONS.READ),
  readLimiter,
  validate({ query: auditLogQuerySchema }),
  asyncHandler(adminController.listAuditLogs),
);

// GET /admin/roles - daftar role beserta jumlah permission dan penggunanya
adminRouter.get(
  '/admin/roles',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.USER, ACTIONS.READ),
  readLimiter,
  validate({ query: listRoleQuerySchema }),
  asyncHandler(adminController.listRoles),
);

// POST /admin/roles - buat role baru beserta seluruh permission-nya
adminRouter.post(
  '/admin/roles',
  authenticate,
  requireStaff,
  requireAdmin,
  requirePermission(RESOURCES.USER, ACTIONS.CREATE),
  writeLimiter,
  validate({ body: createRoleSchema }),
  asyncHandler(adminController.createRole),
);

// PATCH /admin/roles/:id - ubah nama, deskripsi, dan/atau permission role
adminRouter.patch(
  '/admin/roles/:id',
  authenticate,
  requireStaff,
  requireAdmin,
  requirePermission(RESOURCES.USER, ACTIONS.UPDATE),
  writeLimiter,
  validate({ params: uuidParamSchema, body: updateRoleSchema }),
  asyncHandler(adminController.updateRole),
);

// GET /admin/permissions - daftar permission dalam bentuk key resource:action
adminRouter.get(
  '/admin/permissions',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.USER, ACTIONS.READ),
  readLimiter,
  validate({ query: listPermissionQuerySchema }),
  asyncHandler(adminController.listPermissions),
);

// GET /admin/users - daftar user tanpa pernah mengirim hash/token
adminRouter.get(
  '/admin/users',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.USER, ACTIONS.READ),
  readLimiter,
  validate({ query: listAdminUserQuerySchema }),
  asyncHandler(adminController.listUsers),
);

// POST /admin/users/:id/roles - tetapkan role user (ganti atau tambahkan)
adminRouter.post(
  '/admin/users/:id/roles',
  authenticate,
  requireStaff,
  requireAdmin,
  requirePermission(RESOURCES.USER, ACTIONS.UPDATE),
  writeLimiter,
  validate({ params: userIdParamSchema, body: assignRoleSchema }),
  asyncHandler(adminController.assignUserRoles),
);

// PATCH /admin/users/:id/status - suspend, aktifkan, atau hapus akun user
adminRouter.patch(
  '/admin/users/:id/status',
  authenticate,
  requireStaff,
  requireAdmin,
  requirePermission(RESOURCES.USER, ACTIONS.UPDATE),
  writeLimiter,
  validate({ params: userIdParamSchema, body: updateUserStatusSchema }),
  asyncHandler(adminController.updateUserStatus),
);