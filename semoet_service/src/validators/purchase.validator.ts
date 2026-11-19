import { z } from 'zod';
import {
  GOODS_RECEIPT_STATUS,
  PURCHASE_ORDER_STATUS,
  PURCHASE_PAYMENT_STATUS,
  SUPPLIER_PAYMENT_METHOD,
} from '../config/constants.js';
import { booleanQuery, uuidSchema } from './common.validator.js';

/** Tanggal transaksi (YYYY-MM-DD). */
const dateOnlySchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD');

const optionalDateOnlySchema = dateOnlySchema.optional();

const idrSchema = z.coerce
  .number()
  .int('Nominal harus bilangan bulat')
  .min(0, 'Nominal tidak boleh negatif')
  .max(9_999_999_999_999, 'Nominal terlalu besar');

const quantitySchema = z.coerce
  .number()
  .positive('Kuantitas harus lebih dari 0')
  .max(9_999_999, 'Kuantitas terlalu besar');

// --------------------------------------------------------------------------
// Supplier
// --------------------------------------------------------------------------
export const listSupplierQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  q: z.string().trim().max(120).optional(),
  isActive: booleanQuery.optional(),
});

export const createSupplierSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[A-Za-z0-9._-]+$/, 'Kode hanya alphanumeric, titik, underscore, strip')
    .optional(),
  name: z.string().trim().min(2).max(150),
  contactName: z.string().trim().max(150).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().email('Format email tidak valid').max(255).optional(),
  address: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(1000).optional(),
  isActive: z.boolean().default(true),
});

export const updateSupplierSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2)
      .max(40)
      .regex(/^[A-Za-z0-9._-]+$/, 'Kode hanya alphanumeric, titik, underscore, strip')
      .optional(),
    name: z.string().trim().min(2).max(150).optional(),
    contactName: z.string().trim().max(150).nullable().optional(),
    phone: z.string().trim().max(30).nullable().optional(),
    email: z.string().trim().email('Format email tidak valid').max(255).nullable().optional(),
    address: z.string().trim().max(500).nullable().optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Minimal satu field harus dikirim',
  });

// --------------------------------------------------------------------------
// Purchase order
// --------------------------------------------------------------------------
const purchaseOrderItemSchema = z.object({
  ingredientId: uuidSchema,
  quantity: quantitySchema,
  unitPriceIdr: idrSchema.default(0),
  notes: z.string().trim().max(300).optional(),
});

export const listPurchaseOrderQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(120).optional(),
  status: z.enum(PURCHASE_ORDER_STATUS).optional(),
  paymentStatus: z.enum(PURCHASE_PAYMENT_STATUS).optional(),
  supplierId: uuidSchema.optional(),
  branchId: uuidSchema.optional(),
  from: optionalDateOnlySchema,
  to: optionalDateOnlySchema,
});

export const createPurchaseOrderSchema = z.object({
  supplierId: uuidSchema,
  branchId: uuidSchema.optional(),
  status: z.enum(['draft', 'ordered']).default('ordered'),
  orderDate: optionalDateOnlySchema,
  expectedDate: optionalDateOnlySchema,
  dueDate: optionalDateOnlySchema,
  discountIdr: idrSchema.default(0),
  taxIdr: idrSchema.default(0),
  notes: z.string().trim().max(1000).optional(),
  items: z.array(purchaseOrderItemSchema).min(1, 'PO minimal berisi satu bahan').max(100),
});

export const updatePurchaseOrderSchema = z
  .object({
    supplierId: uuidSchema.optional(),
    branchId: uuidSchema.nullable().optional(),
    status: z.enum(['draft', 'ordered']).optional(),
    orderDate: optionalDateOnlySchema,
    expectedDate: optionalDateOnlySchema.nullable(),
    dueDate: optionalDateOnlySchema.nullable(),
    discountIdr: idrSchema.optional(),
    taxIdr: idrSchema.optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
    items: z.array(purchaseOrderItemSchema).min(1).max(100).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Minimal satu field harus dikirim',
  });

export const cancelPurchaseOrderSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

// --------------------------------------------------------------------------
// Goods receipt (penerimaan barang)
// --------------------------------------------------------------------------
const goodsReceiptItemSchema = z.object({
  purchaseOrderItemId: uuidSchema,
  quantity: quantitySchema,
});

export const listGoodsReceiptQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(120).optional(),
  purchaseOrderId: uuidSchema.optional(),
  supplierId: uuidSchema.optional(),
  stockLocationId: uuidSchema.optional(),
  status: z.enum(GOODS_RECEIPT_STATUS).optional(),
  from: optionalDateOnlySchema,
  to: optionalDateOnlySchema,
});

export const createGoodsReceiptSchema = z.object({
  stockLocationId: uuidSchema,
  receivedDate: optionalDateOnlySchema,
  /** Jika true, stok langsung bertambah dan dokumen berstatus `posted`. */
  postToStock: z.boolean().default(true),
  notes: z.string().trim().max(1000).optional(),
  items: z.array(goodsReceiptItemSchema).min(1, 'Penerimaan minimal berisi satu bahan').max(100),
});

// --------------------------------------------------------------------------
// Supplier payment (hutang / account payable)
// --------------------------------------------------------------------------
export const listPayableQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(120).optional(),
  supplierId: uuidSchema.optional(),
});

export const createSupplierPaymentSchema = z.object({
  amountIdr: z.coerce.number().int('Nominal harus bilangan bulat').positive('Nominal harus lebih dari 0'),
  paidAt: optionalDateOnlySchema,
  method: z.enum(SUPPLIER_PAYMENT_METHOD).default('transfer'),
  reference: z.string().trim().max(150).optional(),
  proofUrl: z.string().trim().url('URL bukti pembayaran tidak valid').max(1000).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export type ListSupplierQuery = z.infer<typeof listSupplierQuerySchema>;
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
export type ListPurchaseOrderQuery = z.infer<typeof listPurchaseOrderQuerySchema>;
export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;
export type UpdatePurchaseOrderInput = z.infer<typeof updatePurchaseOrderSchema>;
export type CancelPurchaseOrderInput = z.infer<typeof cancelPurchaseOrderSchema>;
export type ListGoodsReceiptQuery = z.infer<typeof listGoodsReceiptQuerySchema>;
export type CreateGoodsReceiptInput = z.infer<typeof createGoodsReceiptSchema>;
export type ListPayableQuery = z.infer<typeof listPayableQuerySchema>;
export type CreateSupplierPaymentInput = z.infer<typeof createSupplierPaymentSchema>;
