import { Router } from 'express';
import * as adminController from '../controllers/admin.controller.js';
import { ACTIONS, RESOURCES } from '../config/constants.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { authenticate } from '../middlewares/authenticate.js';
import { idempotency } from '../middlewares/idempotency.js';
import { readLimiter, writeLimiter } from '../middlewares/rateLimit.js';
import { requireAdmin, requirePermission, requireStaff } from '../middlewares/rbac.js';
import { validate } from '../middlewares/validate.js';
import { uuidParamSchema } from '../validators/common.validator.js';
import {
  assignRoleSchema,
  auditLogQuerySchema,
  categoryIdParamSchema,
  createCategorySchema,
  createProductSchema,
  createRoleSchema,
  createUserSchema,
  listAdminOrderQuerySchema,
  listAdminUserQuerySchema,
  listDeletedProductQuerySchema,
  listPermissionQuerySchema,
  listRoleQuerySchema,
  productIdParamSchema,
  productVariantInputSchema,
  productVariantParamSchema,
  recordManualPaymentSchema,
  reportProductQuerySchema,
  reportSalesQuerySchema,
  salesDashboardQuerySchema,
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
  userIdParamSchema,
  createAreaSchema,
  updateAreaSchema,
  areaIdParamSchema,
  createTableSchema,
  updateTableSchema,
  tableIdParamSchema,
  listAdminReservationQuerySchema,
  updateDepositSettingsSchema,
  updateReservationStatusSchema,
  createAdminReservationSchema,
  createReservationDepositChargeSchema,
  reservationIdParamSchema,
  listAdminEventBookingQuerySchema,
  updateEventBookingStatusSchema,
  createAdminEventBookingSchema,
  eventBookingIdParamSchema,
  listAdminChatConversationQuerySchema,
  conversationIdParamSchema,
  listAdminMomentQuerySchema,
  moderateMomentSchema,
  momentIdParamSchema,
} from '../validators/admin.validator.js';
import {
  createEventAgendaSchema,
  eventAgendaIdParamSchema,
  listEventAgendaQuerySchema,
  updateEventAgendaSchema,
} from '../validators/event.validator.js';
import {
  createExpenseSchema,
  expenseIdParamSchema,
  listExpenseQuerySchema,
  updateExpenseSchema,
} from '../validators/expense.validator.js';
import {
  adminPromoIdParamSchema,
  createAdminPromoSchema,
  listAdminPromoQuerySchema,
  updateAdminPromoSchema,
} from '../validators/promo.validator.js';
import { listAdminProductQuerySchema } from '../validators/catalog.validator.js';
import {
  orderIdParamSchema,
  updateOrderStatusSchema,
} from '../validators/order.validator.js';
import {
  createPreparationStationSchema,
  updatePreparationStationSchema,
  preparationStationIdParamSchema,
} from '../validators/preparationStation.validator.js';

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

// GET /admin/reports/daily - deret harian (kotor, diskon, bersih, modal, laba, qty)
adminRouter.get(
  '/admin/reports/daily',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.ORDER, ACTIONS.READ),
  readLimiter,
  validate({ query: reportSalesQuerySchema }),
  asyncHandler(adminController.reportDaily),
);

// GET /admin/reports/breakdown - sebaran metode pesanan/pembayaran, jam, hari, status
adminRouter.get(
  '/admin/reports/breakdown',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.ORDER, ACTIONS.READ),
  readLimiter,
  validate({ query: reportSalesQuerySchema }),
  asyncHandler(adminController.reportBreakdown),
);

// GET /admin/reports/categories - rekap penjualan per kategori produk
adminRouter.get(
  '/admin/reports/categories',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.ORDER, ACTIONS.READ),
  readLimiter,
  validate({ query: reportSalesQuerySchema }),
  asyncHandler(adminController.reportCategories),
);

// --------------------------------------------------------------------------
// Admin/kasir: antrean pesanan & pembayaran manual
// --------------------------------------------------------------------------

// GET /admin/orders - antrean pesanan semua pelanggan (branch-scoped)
adminRouter.get(
  '/admin/orders',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.ORDER, ACTIONS.READ),
  readLimiter,
  validate({ query: listAdminOrderQuerySchema }),
  asyncHandler(adminController.listOrders),
);

// PATCH /admin/orders/:id/status - ubah status pesanan dari kasir
adminRouter.patch(
  '/admin/orders/:id/status',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.ORDER, ACTIONS.UPDATE),
  writeLimiter,
  validate({ params: orderIdParamSchema, body: updateOrderStatusSchema }),
  asyncHandler(adminController.updateOrderStatus),
);

// POST /admin/orders/:id/payments - catat pembayaran tunai/QRIS/kartu dari kasir
adminRouter.post(
  '/admin/orders/:id/payments',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.PAYMENT, ACTIONS.CREATE),
  writeLimiter,
  idempotency(),
  validate({ params: orderIdParamSchema, body: recordManualPaymentSchema }),
  asyncHandler(adminController.recordOrderPayment),
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

// GET /admin/audit-logs/filters - opsi filter aktivitas (aktor/aksi/entitas)
adminRouter.get(
  '/admin/audit-logs/filters',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.AUDIT, ACTIONS.READ),
  readLimiter,
  asyncHandler(adminController.auditLogFilters),
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

// --------------------------------------------------------------------------
// CRUD anggota (user)
// --------------------------------------------------------------------------
// POST /admin/users - tambah anggota baru (email/telepon + password + role)
adminRouter.post(
  '/admin/users',
  authenticate,
  requireStaff,
  requireAdmin,
  requirePermission(RESOURCES.USER, ACTIONS.CREATE),
  writeLimiter,
  validate({ body: createUserSchema }),
  asyncHandler(adminController.createUser),
);

// PATCH /admin/users/:id - ubah profil anggota (nama, email, telepon)
adminRouter.patch(
  '/admin/users/:id',
  authenticate,
  requireStaff,
  requireAdmin,
  requirePermission(RESOURCES.USER, ACTIONS.UPDATE),
  writeLimiter,
  validate({ params: userIdParamSchema, body: updateUserSchema }),
  asyncHandler(adminController.updateUser),
);

// --------------------------------------------------------------------------
// CRUD role (peran)
// --------------------------------------------------------------------------
// GET /admin/roles/:id - detail role + daftar izin (untuk form edit)
adminRouter.get(
  '/admin/roles/:id',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.USER, ACTIONS.READ),
  readLimiter,
  validate({ params: uuidParamSchema }),
  asyncHandler(adminController.getRole),
);

// DELETE /admin/roles/:id - hapus role non-sistem yang belum dipakai anggota
adminRouter.delete(
  '/admin/roles/:id',
  authenticate,
  requireStaff,
  requireAdmin,
  requirePermission(RESOURCES.USER, ACTIONS.DELETE),
  writeLimiter,
  validate({ params: uuidParamSchema }),
  asyncHandler(adminController.deleteRole),
);

// --------------------------------------------------------------------------
// CRUD produk & varian
// --------------------------------------------------------------------------
// POST /admin/uploads/images - unggah gambar produk ke object storage (Supabase)
adminRouter.post(
  '/admin/uploads/images',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.MENU, ACTIONS.CREATE),
  writeLimiter,
  validate({ body: uploadImageSchema }),
  asyncHandler(adminController.uploadImage),
);

// POST /admin/categories - tambah kategori menu
adminRouter.post(
  '/admin/categories',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.MENU, ACTIONS.CREATE),
  writeLimiter,
  validate({ body: createCategorySchema }),
  asyncHandler(adminController.createCategory),
);

// PATCH /admin/categories/:id - ubah kategori menu
adminRouter.patch(
  '/admin/categories/:id',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.MENU, ACTIONS.UPDATE),
  writeLimiter,
  validate({ params: categoryIdParamSchema, body: updateCategorySchema }),
  asyncHandler(adminController.updateCategory),
);

// DELETE /admin/categories/:id - hapus kategori yang belum dipakai
adminRouter.delete(
  '/admin/categories/:id',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.MENU, ACTIONS.DELETE),
  writeLimiter,
  validate({ params: categoryIdParamSchema }),
  asyncHandler(adminController.deleteCategory),
);

// GET /admin/preparation-stations
adminRouter.get(
  '/admin/preparation-stations',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.MENU, ACTIONS.READ),
  readLimiter,
  asyncHandler(adminController.listPreparationStations),
);

// POST /admin/preparation-stations
adminRouter.post(
  '/admin/preparation-stations',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.MENU, ACTIONS.CREATE),
  writeLimiter,
  validate({ body: createPreparationStationSchema }),
  asyncHandler(adminController.createPreparationStation),
);

// PATCH /admin/preparation-stations/:id
adminRouter.patch(
  '/admin/preparation-stations/:id',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.MENU, ACTIONS.UPDATE),
  writeLimiter,
  validate({ params: preparationStationIdParamSchema, body: updatePreparationStationSchema }),
  asyncHandler(adminController.updatePreparationStation),
);

// DELETE /admin/preparation-stations/:id
adminRouter.delete(
  '/admin/preparation-stations/:id',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.MENU, ACTIONS.DELETE),
  writeLimiter,
  validate({ params: preparationStationIdParamSchema }),
  asyncHandler(adminController.deletePreparationStation),
);

// GET /admin/products - daftar produk termasuk yang nonaktif
adminRouter.get(
  '/admin/products',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.MENU, ACTIONS.READ),
  readLimiter,
  validate({ query: listAdminProductQuerySchema }),
  asyncHandler(adminController.listProducts),
);

// GET /admin/products/trash - riwayat produk terhapus yang masih bisa dipulihkan
adminRouter.get(
  '/admin/products/trash',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.MENU, ACTIONS.READ),
  readLimiter,
  validate({ query: listDeletedProductQuerySchema }),
  asyncHandler(adminController.listDeletedProducts),
);

// POST /admin/products - tambah produk beserta varian awalnya
adminRouter.post(
  '/admin/products',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.MENU, ACTIONS.CREATE),
  writeLimiter,
  validate({ body: createProductSchema }),
  asyncHandler(adminController.createProduct),
);

// PATCH /admin/products/:id - ubah data produk (nama, kategori, jenis, aktif, unggulan)
adminRouter.patch(
  '/admin/products/:id',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.MENU, ACTIONS.UPDATE),
  writeLimiter,
  validate({ params: productIdParamSchema, body: updateProductSchema }),
  asyncHandler(adminController.updateProduct),
);

// DELETE /admin/products/:id - hapus produk (soft delete, riwayat pesanan aman)
adminRouter.delete(
  '/admin/products/:id',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.MENU, ACTIONS.DELETE),
  writeLimiter,
  validate({ params: productIdParamSchema }),
  asyncHandler(adminController.deleteProduct),
);

// POST /admin/products/:id/restore - pulihkan produk dari tempat sampah
adminRouter.post(
  '/admin/products/:id/restore',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.MENU, ACTIONS.UPDATE),
  writeLimiter,
  validate({ params: productIdParamSchema }),
  asyncHandler(adminController.restoreProduct),
);

// DELETE /admin/products/:id/permanent - hapus permanen dari tempat sampah
adminRouter.delete(
  '/admin/products/:id/permanent',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.MENU, ACTIONS.DELETE),
  writeLimiter,
  validate({ params: productIdParamSchema }),
  asyncHandler(adminController.purgeProduct),
);

// POST /admin/products/:id/variants - tambah varian baru
adminRouter.post(
  '/admin/products/:id/variants',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.MENU, ACTIONS.UPDATE),
  writeLimiter,
  validate({ params: productIdParamSchema, body: productVariantInputSchema }),
  asyncHandler(adminController.createVariant),
);

// PATCH /admin/products/:id/variants/:variantId - ubah varian
adminRouter.patch(
  '/admin/products/:id/variants/:variantId',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.MENU, ACTIONS.UPDATE),
  writeLimiter,
  validate({ params: productVariantParamSchema, body: updateVariantSchema }),
  asyncHandler(adminController.updateProductVariant),
);

// DELETE /admin/products/:id/variants/:variantId - hapus varian (sisakan minimal satu)
adminRouter.delete(
  '/admin/products/:id/variants/:variantId',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.MENU, ACTIONS.UPDATE),
  writeLimiter,
  validate({ params: productVariantParamSchema }),
  asyncHandler(adminController.deleteVariant),
);

// --------------------------------------------------------------------------
// Admin: Area tempat duduk & meja
// --------------------------------------------------------------------------
// Semua memakai permission RESOURCE.BRANCH. Gambar area diunggah lewat
// POST /admin/uploads/images dengan folder "areas", lalu URL-nya disematkan.

// POST /admin/branches/:id/areas - tambah area
adminRouter.post(
  '/admin/branches/:id/areas',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.BRANCH, ACTIONS.CREATE),
  writeLimiter,
  validate({ params: uuidParamSchema, body: createAreaSchema }),
  asyncHandler(adminController.createArea),
);

// PATCH /admin/areas/:areaId - ubah area (nama, tipe, aktif, gambar)
adminRouter.patch(
  '/admin/areas/:areaId',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.BRANCH, ACTIONS.UPDATE),
  writeLimiter,
  validate({ params: areaIdParamSchema, body: updateAreaSchema }),
  asyncHandler(adminController.updateArea),
);

// DELETE /admin/areas/:areaId - hapus area (harus tanpa meja)
adminRouter.delete(
  '/admin/areas/:areaId',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.BRANCH, ACTIONS.DELETE),
  writeLimiter,
  validate({ params: areaIdParamSchema }),
  asyncHandler(adminController.deleteArea),
);

// POST /admin/tables - tambah meja
adminRouter.post(
  '/admin/tables',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.BRANCH, ACTIONS.CREATE),
  writeLimiter,
  validate({ body: createTableSchema }),
  asyncHandler(adminController.createTable),
);

// PATCH /admin/tables/:tableId - ubah meja
adminRouter.patch(
  '/admin/tables/:tableId',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.BRANCH, ACTIONS.UPDATE),
  writeLimiter,
  validate({ params: tableIdParamSchema, body: updateTableSchema }),
  asyncHandler(adminController.updateTable),
);

// DELETE /admin/tables/:tableId - hapus meja (harus tanpa reservasi aktif)
adminRouter.delete(
  '/admin/tables/:tableId',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.BRANCH, ACTIONS.DELETE),
  writeLimiter,
  validate({ params: tableIdParamSchema }),
  asyncHandler(adminController.deleteTable),
);

// --------------------------------------------------------------------------
// Admin: Reservasi
// --------------------------------------------------------------------------

// GET /admin/reservation-settings - baca ketentuan DP reservasi
adminRouter.get(
  '/admin/reservation-settings',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.RESERVATION, ACTIONS.READ),
  readLimiter,
  asyncHandler(adminController.getReservationSettings),
);

// PATCH /admin/reservation-settings - ubah persentase & batas DP
adminRouter.patch(
  '/admin/reservation-settings',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.RESERVATION, ACTIONS.UPDATE),
  writeLimiter,
  validate({ body: updateDepositSettingsSchema }),
  asyncHandler(adminController.updateReservationSettings),
);

// GET /admin/reservations - daftar semua reservasi
adminRouter.get(
  '/admin/reservations',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.RESERVATION, ACTIONS.READ),
  readLimiter,
  validate({ query: listAdminReservationQuerySchema }),
  asyncHandler(adminController.listReservations),
);

// GET /admin/reservations/:id - detail reservasi
adminRouter.get(
  '/admin/reservations/:id',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.RESERVATION, ACTIONS.READ),
  readLimiter,
  validate({ params: reservationIdParamSchema }),
  asyncHandler(adminController.getReservation),
);

// POST /admin/reservations - tambah reservasi atas nama pelanggan
adminRouter.post(
  '/admin/reservations',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.RESERVATION, ACTIONS.CREATE),
  writeLimiter,
  validate({ body: createAdminReservationSchema }),
  asyncHandler(adminController.createReservation),
);

// POST /admin/reservations/:id/deposit-charge - buat link pembayaran DP (Midtrans)
adminRouter.post(
  '/admin/reservations/:id/deposit-charge',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.RESERVATION, ACTIONS.UPDATE),
  writeLimiter,
  idempotency(),
  validate({ params: reservationIdParamSchema, body: createReservationDepositChargeSchema }),
  asyncHandler(adminController.createReservationDepositCharge),
);

// PATCH /admin/reservations/:id - update status reservasi
adminRouter.patch(
  '/admin/reservations/:id',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.RESERVATION, ACTIONS.UPDATE),
  writeLimiter,
  validate({ params: reservationIdParamSchema, body: updateReservationStatusSchema }),
  asyncHandler(adminController.updateReservation),
);

// DELETE /admin/reservations/:id - hapus reservasi
adminRouter.delete(
  '/admin/reservations/:id',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.RESERVATION, ACTIONS.DELETE),
  writeLimiter,
  validate({ params: reservationIdParamSchema }),
  asyncHandler(adminController.deleteReservation),
);

// --------------------------------------------------------------------------
// Admin: Booking Event
// --------------------------------------------------------------------------

// GET /admin/event-bookings - daftar semua booking event
adminRouter.get(
  '/admin/event-bookings',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.EVENT, ACTIONS.READ),
  readLimiter,
  validate({ query: listAdminEventBookingQuerySchema }),
  asyncHandler(adminController.listEventBookings),
);

// GET /admin/event-bookings/:id - detail booking event
adminRouter.get(
  '/admin/event-bookings/:id',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.EVENT, ACTIONS.READ),
  readLimiter,
  validate({ params: eventBookingIdParamSchema }),
  asyncHandler(adminController.getEventBooking),
);

// PATCH /admin/event-bookings/:id - update status booking event
adminRouter.patch(
  '/admin/event-bookings/:id',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.EVENT, ACTIONS.UPDATE),
  writeLimiter,
  validate({ params: eventBookingIdParamSchema, body: updateEventBookingStatusSchema }),
  asyncHandler(adminController.updateEventBooking),
);

// POST /admin/event-bookings - tambah booking event atas nama pelanggan
adminRouter.post(
  '/admin/event-bookings',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.EVENT, ACTIONS.CREATE),
  writeLimiter,
  validate({ body: createAdminEventBookingSchema }),
  asyncHandler(adminController.createEventBooking),
);

// DELETE /admin/event-bookings/:id - hapus booking event
adminRouter.delete(
  '/admin/event-bookings/:id',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.EVENT, ACTIONS.DELETE),
  writeLimiter,
  validate({ params: eventBookingIdParamSchema }),
  asyncHandler(adminController.deleteEventBooking),
);

// --------------------------------------------------------------------------
// Admin: Agenda Event (Ramadan, Lebaran, promo musiman, dsb)
// --------------------------------------------------------------------------

// GET /admin/event-agenda - daftar agenda event
adminRouter.get(
  '/admin/event-agenda',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.EVENT, ACTIONS.READ),
  readLimiter,
  validate({ query: listEventAgendaQuerySchema }),
  asyncHandler(adminController.listEventAgenda),
);

// GET /admin/event-agenda/:id - detail agenda event
adminRouter.get(
  '/admin/event-agenda/:id',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.EVENT, ACTIONS.READ),
  readLimiter,
  validate({ params: eventAgendaIdParamSchema }),
  asyncHandler(adminController.getEventAgenda),
);

// POST /admin/event-agenda - tambah agenda event
adminRouter.post(
  '/admin/event-agenda',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.EVENT, ACTIONS.CREATE),
  writeLimiter,
  validate({ body: createEventAgendaSchema }),
  asyncHandler(adminController.createEventAgenda),
);

// PATCH /admin/event-agenda/:id - ubah agenda event
adminRouter.patch(
  '/admin/event-agenda/:id',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.EVENT, ACTIONS.UPDATE),
  writeLimiter,
  validate({ params: eventAgendaIdParamSchema, body: updateEventAgendaSchema }),
  asyncHandler(adminController.updateEventAgenda),
);

// DELETE /admin/event-agenda/:id - hapus agenda event
adminRouter.delete(
  '/admin/event-agenda/:id',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.EVENT, ACTIONS.DELETE),
  writeLimiter,
  validate({ params: eventAgendaIdParamSchema }),
  asyncHandler(adminController.deleteEventAgenda),
);

// --------------------------------------------------------------------------
// Admin: Promo (voucher code & diskon langsung menu)
// --------------------------------------------------------------------------

// GET /admin/promos - daftar seluruh promo (aktif maupun nonaktif)
adminRouter.get(
  '/admin/promos',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.PROMO, ACTIONS.READ),
  readLimiter,
  validate({ query: listAdminPromoQuerySchema }),
  asyncHandler(adminController.listPromos),
);

// GET /admin/promos/:id - detail promo + menu/kategori sasaran
adminRouter.get(
  '/admin/promos/:id',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.PROMO, ACTIONS.READ),
  readLimiter,
  validate({ params: adminPromoIdParamSchema }),
  asyncHandler(adminController.getPromo),
);

// POST /admin/promos - buat promo voucher / diskon menu
adminRouter.post(
  '/admin/promos',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.PROMO, ACTIONS.CREATE),
  writeLimiter,
  validate({ body: createAdminPromoSchema }),
  asyncHandler(adminController.createPromo),
);

// PATCH /admin/promos/:id - ubah promo
adminRouter.patch(
  '/admin/promos/:id',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.PROMO, ACTIONS.UPDATE),
  writeLimiter,
  validate({ params: adminPromoIdParamSchema, body: updateAdminPromoSchema }),
  asyncHandler(adminController.updatePromo),
);

// DELETE /admin/promos/:id - hapus promo yang belum pernah dipakai
adminRouter.delete(
  '/admin/promos/:id',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.PROMO, ACTIONS.DELETE),
  writeLimiter,
  validate({ params: adminPromoIdParamSchema }),
  asyncHandler(adminController.deletePromo),
);

// --------------------------------------------------------------------------
// Admin: Chat / Support
// --------------------------------------------------------------------------

// GET /admin/chat/conversations - daftar percakapan support
adminRouter.get(
  '/admin/chat/conversations',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.CHAT, ACTIONS.READ),
  readLimiter,
  validate({ query: listAdminChatConversationQuerySchema }),
  asyncHandler(adminController.listChatConversations),
);

// --------------------------------------------------------------------------
// Admin: Moment Moderation
// --------------------------------------------------------------------------

// GET /admin/moments - daftar moment untuk moderasi
adminRouter.get(
  '/admin/moments',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.MOMENT, ACTIONS.READ),
  readLimiter,
  validate({ query: listAdminMomentQuerySchema }),
  asyncHandler(adminController.listMoments),
);

// PATCH /admin/moments/moderate - moderasi moment
adminRouter.patch(
  '/admin/moments/moderate',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.MOMENT, ACTIONS.UPDATE),
  writeLimiter,
  validate({ body: moderateMomentSchema }),
  asyncHandler(adminController.moderateMoment),
);

// DELETE /admin/moments/:id - hapus moment (moderator)
adminRouter.delete(
  '/admin/moments/:id',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.MOMENT, ACTIONS.DELETE),
  writeLimiter,
  validate({ params: momentIdParamSchema }),
  asyncHandler(adminController.deleteMoment),
);

// --------------------------------------------------------------------------
// Admin: Pengeluaran operasional
// --------------------------------------------------------------------------

// GET /admin/expenses - daftar pengeluaran operasional
adminRouter.get(
  '/admin/expenses',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.EXPENSE, ACTIONS.READ),
  readLimiter,
  validate({ query: listExpenseQuerySchema }),
  asyncHandler(adminController.listExpenses),
);

// GET /admin/expenses/:id - detail pengeluaran
adminRouter.get(
  '/admin/expenses/:id',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.EXPENSE, ACTIONS.READ),
  readLimiter,
  validate({ params: expenseIdParamSchema }),
  asyncHandler(adminController.getExpense),
);

// POST /admin/expenses - tambah pengeluaran operasional
adminRouter.post(
  '/admin/expenses',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.EXPENSE, ACTIONS.CREATE),
  writeLimiter,
  validate({ body: createExpenseSchema }),
  asyncHandler(adminController.createExpense),
);

// PATCH /admin/expenses/:id - ubah pengeluaran operasional
adminRouter.patch(
  '/admin/expenses/:id',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.EXPENSE, ACTIONS.UPDATE),
  writeLimiter,
  validate({ params: expenseIdParamSchema, body: updateExpenseSchema }),
  asyncHandler(adminController.updateExpense),
);

// DELETE /admin/expenses/:id - hapus pengeluaran operasional
adminRouter.delete(
  '/admin/expenses/:id',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.EXPENSE, ACTIONS.DELETE),
  writeLimiter,
  validate({ params: expenseIdParamSchema }),
  asyncHandler(adminController.deleteExpense),
);