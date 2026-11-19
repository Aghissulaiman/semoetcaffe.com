import { Router } from 'express';
import * as purchaseController from '../controllers/purchase.controller.js';
import { ACTIONS, RESOURCES } from '../config/constants.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { authenticate } from '../middlewares/authenticate.js';
import { readLimiter, writeLimiter } from '../middlewares/rateLimit.js';
import { requirePermission, requireStaff } from '../middlewares/rbac.js';
import { validate } from '../middlewares/validate.js';
import { uuidParamSchema } from '../validators/common.validator.js';
import {
  cancelPurchaseOrderSchema,
  createGoodsReceiptSchema,
  createPurchaseOrderSchema,
  createSupplierPaymentSchema,
  createSupplierSchema,
  listGoodsReceiptQuerySchema,
  listPayableQuerySchema,
  listPurchaseOrderQuerySchema,
  listSupplierQuerySchema,
  updatePurchaseOrderSchema,
  updateSupplierSchema,
} from '../validators/purchase.validator.js';

export const purchaseRouter = Router();

const permission = (action: string) => requirePermission(RESOURCES.PURCHASE, action);

// --------------------------------------------------------------------------
// Master supplier
// --------------------------------------------------------------------------
purchaseRouter.get(
  '/admin/suppliers',
  authenticate,
  requireStaff,
  permission(ACTIONS.READ),
  readLimiter,
  validate({ query: listSupplierQuerySchema }),
  asyncHandler(purchaseController.listSuppliers),
);

purchaseRouter.get(
  '/admin/suppliers/:id',
  authenticate,
  requireStaff,
  permission(ACTIONS.READ),
  readLimiter,
  validate({ params: uuidParamSchema }),
  asyncHandler(purchaseController.supplierDetail),
);

purchaseRouter.post(
  '/admin/suppliers',
  authenticate,
  requireStaff,
  permission(ACTIONS.CREATE),
  writeLimiter,
  validate({ body: createSupplierSchema }),
  asyncHandler(purchaseController.createSupplier),
);

purchaseRouter.patch(
  '/admin/suppliers/:id',
  authenticate,
  requireStaff,
  permission(ACTIONS.UPDATE),
  writeLimiter,
  validate({ params: uuidParamSchema, body: updateSupplierSchema }),
  asyncHandler(purchaseController.updateSupplier),
);

purchaseRouter.delete(
  '/admin/suppliers/:id',
  authenticate,
  requireStaff,
  permission(ACTIONS.DELETE),
  writeLimiter,
  validate({ params: uuidParamSchema }),
  asyncHandler(purchaseController.deleteSupplier),
);

// --------------------------------------------------------------------------
// Purchase order
// --------------------------------------------------------------------------
purchaseRouter.get(
  '/admin/purchase-orders',
  authenticate,
  requireStaff,
  permission(ACTIONS.READ),
  readLimiter,
  validate({ query: listPurchaseOrderQuerySchema }),
  asyncHandler(purchaseController.listPurchaseOrders),
);

purchaseRouter.get(
  '/admin/purchase-orders/:id',
  authenticate,
  requireStaff,
  permission(ACTIONS.READ),
  readLimiter,
  validate({ params: uuidParamSchema }),
  asyncHandler(purchaseController.purchaseOrderDetail),
);

purchaseRouter.post(
  '/admin/purchase-orders',
  authenticate,
  requireStaff,
  permission(ACTIONS.CREATE),
  writeLimiter,
  validate({ body: createPurchaseOrderSchema }),
  asyncHandler(purchaseController.createPurchaseOrder),
);

purchaseRouter.patch(
  '/admin/purchase-orders/:id',
  authenticate,
  requireStaff,
  permission(ACTIONS.UPDATE),
  writeLimiter,
  validate({ params: uuidParamSchema, body: updatePurchaseOrderSchema }),
  asyncHandler(purchaseController.updatePurchaseOrder),
);

purchaseRouter.post(
  '/admin/purchase-orders/:id/confirm',
  authenticate,
  requireStaff,
  permission(ACTIONS.UPDATE),
  writeLimiter,
  validate({ params: uuidParamSchema }),
  asyncHandler(purchaseController.confirmPurchaseOrder),
);

purchaseRouter.post(
  '/admin/purchase-orders/:id/cancel',
  authenticate,
  requireStaff,
  permission(ACTIONS.UPDATE),
  writeLimiter,
  validate({ params: uuidParamSchema, body: cancelPurchaseOrderSchema }),
  asyncHandler(purchaseController.cancelPurchaseOrder),
);

purchaseRouter.delete(
  '/admin/purchase-orders/:id',
  authenticate,
  requireStaff,
  permission(ACTIONS.DELETE),
  writeLimiter,
  validate({ params: uuidParamSchema }),
  asyncHandler(purchaseController.deletePurchaseOrder),
);

// --------------------------------------------------------------------------
// Penerimaan barang (stok masuk)
// --------------------------------------------------------------------------
purchaseRouter.post(
  '/admin/purchase-orders/:id/receipts',
  authenticate,
  requireStaff,
  permission(ACTIONS.CREATE),
  writeLimiter,
  validate({ params: uuidParamSchema, body: createGoodsReceiptSchema }),
  asyncHandler(purchaseController.receivePurchaseOrder),
);

purchaseRouter.get(
  '/admin/goods-receipts',
  authenticate,
  requireStaff,
  permission(ACTIONS.READ),
  readLimiter,
  validate({ query: listGoodsReceiptQuerySchema }),
  asyncHandler(purchaseController.listGoodsReceipts),
);

purchaseRouter.get(
  '/admin/goods-receipts/:id',
  authenticate,
  requireStaff,
  permission(ACTIONS.READ),
  readLimiter,
  validate({ params: uuidParamSchema }),
  asyncHandler(purchaseController.goodsReceiptDetail),
);

purchaseRouter.post(
  '/admin/goods-receipts/:id/post',
  authenticate,
  requireStaff,
  permission(ACTIONS.UPDATE),
  writeLimiter,
  validate({ params: uuidParamSchema }),
  asyncHandler(purchaseController.postGoodsReceipt),
);

// --------------------------------------------------------------------------
// Hutang supplier / pembayaran
// --------------------------------------------------------------------------
purchaseRouter.get(
  '/admin/payables',
  authenticate,
  requireStaff,
  permission(ACTIONS.READ),
  readLimiter,
  validate({ query: listPayableQuerySchema }),
  asyncHandler(purchaseController.listPayables),
);

purchaseRouter.post(
  '/admin/purchase-orders/:id/payments',
  authenticate,
  requireStaff,
  permission(ACTIONS.CREATE),
  writeLimiter,
  validate({ params: uuidParamSchema, body: createSupplierPaymentSchema }),
  asyncHandler(purchaseController.addSupplierPayment),
);
