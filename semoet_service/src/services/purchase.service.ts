import { withTransaction, type TransactionClient } from '../config/database.js';
import { conflict, notFound, unprocessable } from '../errors/AppError.js';
import * as adminRepo from '../repositories/admin.repository.js';
import * as branchRepo from '../repositories/branch.repository.js';
import * as inventoryRepo from '../repositories/inventory.repository.js';
import * as purchaseRepo from '../repositories/purchase.repository.js';
import { buildPaginationMeta, parsePagination, MAX_LIMIT } from '../utils/pagination.js';
import { bool, iso, num, str, strOrNull } from '../utils/serialize.js';
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

export interface Paginated<T> {
  items: T[];
  meta: ReturnType<typeof buildPaginationMeta>;
}

export interface PurchaseAuditContext {
  requestId?: string | null;
  ipAddress?: string | null;
}

const MAX_PURCHASE_ITEMS = 100;
const QUANTITY_EPSILON = 0.0005;

// --------------------------------------------------------------------------
// Helper shaping
// --------------------------------------------------------------------------
function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function shapeSupplier(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    code: str(row.code),
    name: str(row.name),
    contactName: strOrNull(row.contactName),
    phone: strOrNull(row.phone),
    email: strOrNull(row.email),
    address: strOrNull(row.address),
    notes: strOrNull(row.notes),
    isActive: bool(row.isActive, true),
    purchaseOrderCount: num(row.purchaseOrderCount),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function shapePurchaseOrder(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    number: str(row.number),
    supplierId: str(row.supplierId),
    supplierCode: strOrNull(row.supplierCode),
    supplierName: strOrNull(row.supplierName),
    branchId: strOrNull(row.branchId),
    branchName: strOrNull(row.branchName),
    status: str(row.status),
    paymentStatus: str(row.paymentStatus),
    orderDate: iso(row.orderDate),
    expectedDate: iso(row.expectedDate),
    dueDate: iso(row.dueDate),
    subtotalIdr: num(row.subtotalIdr),
    discountIdr: num(row.discountIdr),
    taxIdr: num(row.taxIdr),
    totalIdr: num(row.totalIdr),
    paidAmountIdr: num(row.paidAmountIdr),
    outstandingIdr: num(row.outstandingIdr),
    notes: strOrNull(row.notes),
    cancelReason: strOrNull(row.cancelReason),
    confirmedAt: iso(row.confirmedAt),
    receivedAt: iso(row.receivedAt),
    createdById: strOrNull(row.createdBy),
    createdByName: strOrNull(row.createdByName),
    itemCount: num(row.itemCount),
    totalQuantity: num(row.totalQuantity),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function shapePurchaseOrderItem(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    purchaseOrderId: str(row.purchaseOrderId),
    ingredientId: str(row.ingredientId),
    ingredientSku: strOrNull(row.ingredientSku),
    ingredientName: strOrNull(row.ingredientName),
    baseUnit: strOrNull(row.baseUnit),
    quantity: num(row.quantity),
    quantityReceived: num(row.quantityReceived),
    remainingQuantity: num(row.remainingQuantity),
    unitPriceIdr: num(row.unitPriceIdr),
    lineTotalIdr: num(row.lineTotalIdr),
    notes: strOrNull(row.notes),
    sortOrder: num(row.sortOrder),
    createdAt: iso(row.createdAt),
  };
}

function shapeGoodsReceipt(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    number: str(row.number),
    purchaseOrderId: str(row.purchaseOrderId),
    purchaseOrderNumber: strOrNull(row.purchaseOrderNumber),
    supplierId: strOrNull(row.supplierId),
    supplierCode: strOrNull(row.supplierCode),
    supplierName: strOrNull(row.supplierName),
    stockLocationId: str(row.stockLocationId),
    stockLocationName: strOrNull(row.stockLocationName),
    status: str(row.status),
    receivedDate: iso(row.receivedDate),
    notes: strOrNull(row.notes),
    postedAt: iso(row.postedAt),
    postedById: strOrNull(row.postedBy),
    postedByName: strOrNull(row.postedByName),
    createdById: strOrNull(row.createdBy),
    createdByName: strOrNull(row.createdByName),
    itemCount: num(row.itemCount),
    totalQuantity: num(row.totalQuantity),
    totalValueIdr: num(row.totalValueIdr),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function shapeGoodsReceiptItem(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    goodsReceiptId: str(row.goodsReceiptId),
    purchaseOrderItemId: str(row.purchaseOrderItemId),
    ingredientId: str(row.ingredientId),
    ingredientSku: strOrNull(row.ingredientSku),
    ingredientName: strOrNull(row.ingredientName),
    baseUnit: strOrNull(row.baseUnit),
    quantity: num(row.quantity),
    orderedQuantity: num(row.orderedQuantity),
    unitPriceIdr: num(row.unitPriceIdr),
    createdAt: iso(row.createdAt),
  };
}

function shapeSupplierPayment(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    purchaseOrderId: str(row.purchaseOrderId),
    amountIdr: num(row.amountIdr),
    paidAt: iso(row.paidAt),
    method: str(row.method),
    reference: strOrNull(row.reference),
    proofUrl: strOrNull(row.proofUrl),
    notes: strOrNull(row.notes),
    createdById: strOrNull(row.createdBy),
    createdByName: strOrNull(row.createdByName),
    createdAt: iso(row.createdAt),
  };
}

function paginationMeta(total: number, paging: { page: number; limit: number; offset: number }) {
  return buildPaginationMeta({
    page: paging.page,
    limit: paging.limit,
    offset: paging.offset,
    total,
  });
}

// --------------------------------------------------------------------------
// Supplier
// --------------------------------------------------------------------------
export async function listSuppliers(query: ListSupplierQuery): Promise<Paginated<unknown>> {
  const paging = parsePagination(query);
  const filters = { q: query.q, isActive: query.isActive };
  const rows = await purchaseRepo.listSuppliers(filters, paging);
  const total = await purchaseRepo.countSuppliers(filters);
  return {
    items: rows.map((row) => shapeSupplier(row as Record<string, unknown>)),
    meta: paginationMeta(total, paging),
  };
}

export async function supplierDetail(supplierId: string) {
  const supplier = await purchaseRepo.findSupplierById(supplierId);
  if (!supplier) throw notFound('Supplier', supplierId);
  return shapeSupplier(supplier as Record<string, unknown>);
}

export async function createSupplier(
  actorUserId: string,
  input: CreateSupplierInput,
  audit: PurchaseAuditContext = {},
) {
  const name = normalizeText(input.name);
  const requestedCode = input.code?.trim().toUpperCase();

  return withTransaction(async (tx) => {
    const code = requestedCode || (await purchaseRepo.nextSupplierCode(tx));
    if (!code) throw unprocessable('Kode supplier gagal dibuat, coba lagi');

    const duplicate = await purchaseRepo.findSupplierByCode(code, tx);
    if (duplicate) throw conflict(`Kode supplier '${code}' sudah dipakai`);

    const row = await purchaseRepo.insertSupplier(
      {
        code,
        name,
        contactName: input.contactName ? normalizeText(input.contactName) : null,
        phone: input.phone ? normalizeText(input.phone) : null,
        email: input.email ? normalizeText(input.email).toLowerCase() : null,
        address: input.address ? normalizeText(input.address) : null,
        notes: input.notes ? normalizeText(input.notes) : null,
        isActive: bool(input.isActive, true),
      },
      tx,
    );
    if (!row) throw unprocessable('Supplier gagal disimpan, coba lagi');

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'purchase.supplier.create',
        entityType: 'supplier',
        entityId: str(row.id),
        newData: { code, name },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return shapeSupplier(row as Record<string, unknown>);
  });
}

export async function updateSupplier(
  supplierId: string,
  actorUserId: string,
  input: UpdateSupplierInput,
  audit: PurchaseAuditContext = {},
) {
  return withTransaction(async (tx) => {
    const current = await purchaseRepo.findSupplierById(supplierId, tx);
    if (!current) throw notFound('Supplier', supplierId);

    const data: Record<string, unknown> = {};
    if (input.code !== undefined) {
      const code = input.code.trim().toUpperCase();
      const duplicate = await purchaseRepo.findSupplierByCode(code, tx);
      if (duplicate && str(duplicate.id) !== supplierId) {
        throw conflict(`Kode supplier '${code}' sudah dipakai`);
      }
      data.code = code;
    }
    if (input.name !== undefined) data.name = normalizeText(input.name);
    if (input.contactName !== undefined) {
      data.contact_name = input.contactName ? normalizeText(input.contactName) : null;
    }
    if (input.phone !== undefined) data.phone = input.phone ? normalizeText(input.phone) : null;
    if (input.email !== undefined) {
      data.email = input.email ? normalizeText(input.email).toLowerCase() : null;
    }
    if (input.address !== undefined) {
      data.address = input.address ? normalizeText(input.address) : null;
    }
    if (input.notes !== undefined) data.notes = input.notes ? normalizeText(input.notes) : null;
    if (input.isActive !== undefined) data.is_active = input.isActive;

    const updated = await purchaseRepo.updateSupplier(supplierId, data, tx);
    if (!updated) throw notFound('Supplier', supplierId);

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'purchase.supplier.update',
        entityType: 'supplier',
        entityId: supplierId,
        oldData: shapeSupplier(current as Record<string, unknown>),
        newData: shapeSupplier(updated as Record<string, unknown>),
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return shapeSupplier(updated as Record<string, unknown>);
  });
}

export async function deleteSupplier(
  supplierId: string,
  actorUserId: string,
  audit: PurchaseAuditContext = {},
) {
  return withTransaction(async (tx) => {
    const current = await purchaseRepo.findSupplierById(supplierId, tx);
    if (!current) throw notFound('Supplier', supplierId);

    const orderCount = await purchaseRepo.countPurchaseOrdersBySupplier(supplierId, tx);
    if (orderCount > 0) {
      throw conflict(
        `Supplier '${str(current.name)}' masih dipakai ${orderCount} purchase order. Nonaktifkan saja bila tidak dipakai.`,
      );
    }

    const deleted = await purchaseRepo.deleteSupplier(supplierId, tx);
    if (!deleted) throw notFound('Supplier', supplierId);

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'purchase.supplier.delete',
        entityType: 'supplier',
        entityId: supplierId,
        oldData: shapeSupplier(current as Record<string, unknown>),
        newData: { deleted: true },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return { id: supplierId, deleted: true };
  });
}

// --------------------------------------------------------------------------
// Purchase orders
// --------------------------------------------------------------------------
export async function listPurchaseOrders(
  query: ListPurchaseOrderQuery,
): Promise<Paginated<unknown>> {
  const paging = parsePagination(query);
  const filters = {
    q: query.q,
    status: query.status,
    paymentStatus: query.paymentStatus,
    supplierId: query.supplierId,
    branchId: query.branchId,
    from: query.from,
    to: query.to,
  };
  const rows = await purchaseRepo.listPurchaseOrders(filters, paging);
  const total = await purchaseRepo.countPurchaseOrders(filters);
  return {
    items: rows.map((row) => shapePurchaseOrder(row as Record<string, unknown>)),
    meta: paginationMeta(total, paging),
  };
}

export async function purchaseOrderDetail(purchaseOrderId: string) {
  const order = await purchaseRepo.findPurchaseOrderById(purchaseOrderId);
  if (!order) throw notFound('Purchase order', purchaseOrderId);

  const [items, receipts, payments] = await Promise.all([
    purchaseRepo.listPurchaseOrderItems(purchaseOrderId),
    purchaseRepo.listGoodsReceipts(
      { purchaseOrderId },
      { limit: MAX_LIMIT, offset: 0 },
    ),
    purchaseRepo.listSupplierPayments(purchaseOrderId),
  ]);

  return {
    order: shapePurchaseOrder(order as Record<string, unknown>),
    items: items.map((row) => shapePurchaseOrderItem(row as Record<string, unknown>)),
    receipts: receipts.map((row) => shapeGoodsReceipt(row as Record<string, unknown>)),
    payments: payments.map((row) => shapeSupplierPayment(row as Record<string, unknown>)),
  };
}

interface ResolvedItem {
  ingredientId: string;
  quantity: number;
  unitPriceIdr: number;
  lineTotalIdr: number;
  notes: string | null;
  sortOrder: number;
}

async function resolvePurchaseItems(
  items: CreatePurchaseOrderInput['items'],
  tx: TransactionClient,
): Promise<{ items: ResolvedItem[]; subtotalIdr: number }> {
  if (items.length > MAX_PURCHASE_ITEMS) {
    throw unprocessable(`Purchase order maksimal berisi ${MAX_PURCHASE_ITEMS} bahan`);
  }

  const seen = new Set<string>();
  const resolved: ResolvedItem[] = [];
  let subtotalIdr = 0;

  for (const [index, item] of items.entries()) {
    const ingredientId = item.ingredientId;
    if (seen.has(ingredientId)) {
      throw unprocessable('Purchase order tidak boleh memuat bahan yang sama lebih dari sekali');
    }
    seen.add(ingredientId);

    const ingredient = await inventoryRepo.findIngredientById(ingredientId, tx);
    if (!ingredient) throw notFound('Bahan baku', ingredientId);

    const quantity = Math.round(Number(item.quantity) * 1000) / 1000;
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw unprocessable(`Kuantitas bahan '${str(ingredient.name)}' harus lebih dari 0`);
    }

    const unitPriceIdr = Math.max(0, Math.round(Number(item.unitPriceIdr)));
    const lineTotalIdr = Math.round(quantity * unitPriceIdr);
    subtotalIdr += lineTotalIdr;

    resolved.push({
      ingredientId,
      quantity,
      unitPriceIdr,
      lineTotalIdr,
      notes: item.notes ? normalizeText(item.notes) : null,
      sortOrder: index,
    });
  }

  return { items: resolved, subtotalIdr };
}

function computeTotal(subtotalIdr: number, discountIdr: number, taxIdr: number): number {
  const total = subtotalIdr - discountIdr + taxIdr;
  if (total < 0) {
    throw unprocessable('Total purchase order tidak boleh negatif. Periksa diskon.');
  }
  return total;
}

export async function createPurchaseOrder(
  actorUserId: string,
  input: CreatePurchaseOrderInput,
  audit: PurchaseAuditContext = {},
) {
  return withTransaction(async (tx) => {
    const supplier = await purchaseRepo.findSupplierById(input.supplierId, tx);
    if (!supplier) throw notFound('Supplier', input.supplierId);
    if (!bool(supplier.isActive, true)) {
      throw unprocessable(`Supplier '${str(supplier.name)}' sedang nonaktif`);
    }

    if (input.branchId) {
      const branchExists = await branchRepo.branchExists(input.branchId, tx);
      if (!branchExists) throw notFound('Cabang', input.branchId);
    }

    const { items, subtotalIdr } = await resolvePurchaseItems(input.items, tx);
    const discountIdr = Math.max(0, Math.round(Number(input.discountIdr)));
    const taxIdr = Math.max(0, Math.round(Number(input.taxIdr)));
    const totalIdr = computeTotal(subtotalIdr, discountIdr, taxIdr);
    const status = input.status;

    const number = await purchaseRepo.nextDocumentNumber('purchase_order_number_seq', 'PO', tx);
    if (!number) throw unprocessable('Nomor purchase order gagal dibuat, coba lagi');

    const order = await purchaseRepo.insertPurchaseOrder(
      {
        number,
        supplierId: input.supplierId,
        branchId: input.branchId ?? null,
        status,
        orderDate: input.orderDate ?? null,
        expectedDate: input.expectedDate ?? null,
        dueDate: input.dueDate ?? null,
        subtotalIdr,
        discountIdr,
        taxIdr,
        totalIdr,
        notes: input.notes ? normalizeText(input.notes) : null,
        createdBy: actorUserId,
        confirmedAt: status === 'ordered' ? new Date().toISOString() : null,
      },
      tx,
    );
    if (!order) throw unprocessable('Purchase order gagal disimpan, coba lagi');

    for (const item of items) {
      await purchaseRepo.insertPurchaseOrderItem(
        {
          purchaseOrderId: str(order.id),
          ingredientId: item.ingredientId,
          quantity: item.quantity,
          unitPriceIdr: item.unitPriceIdr,
          lineTotalIdr: item.lineTotalIdr,
          notes: item.notes,
          sortOrder: item.sortOrder,
        },
        tx,
      );
    }

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'purchase.order.create',
        entityType: 'purchase_order',
        entityId: str(order.id),
        newData: { number, supplierId: input.supplierId, status, totalIdr, itemCount: items.length },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return purchaseOrderDetailInTx(str(order.id), tx);
  });
}

/** Versi detail yang bisa dipakai di dalam transaksi (setelah insert/update). */
async function purchaseOrderDetailInTx(purchaseOrderId: string, tx: TransactionClient) {
  const order = await purchaseRepo.findPurchaseOrderById(purchaseOrderId, tx);
  if (!order) throw notFound('Purchase order', purchaseOrderId);
  const items = await purchaseRepo.listPurchaseOrderItems(purchaseOrderId, tx);
  return {
    order: shapePurchaseOrder(order as Record<string, unknown>),
    items: items.map((row) => shapePurchaseOrderItem(row as Record<string, unknown>)),
  };
}

export async function updatePurchaseOrder(
  purchaseOrderId: string,
  actorUserId: string,
  input: UpdatePurchaseOrderInput,
  audit: PurchaseAuditContext = {},
) {
  return withTransaction(async (tx) => {
    const current = await purchaseRepo.lockPurchaseOrder(purchaseOrderId, tx);
    if (!current) throw notFound('Purchase order', purchaseOrderId);
    if (str(current.status) !== 'draft') {
      throw conflict('Purchase order yang sudah diterbitkan tidak bisa diubah. Batalkan lalu buat PO baru.');
    }

    if (input.supplierId !== undefined) {
      const supplier = await purchaseRepo.findSupplierById(input.supplierId, tx);
      if (!supplier) throw notFound('Supplier', input.supplierId);
      if (!bool(supplier.isActive, true)) {
        throw unprocessable(`Supplier '${str(supplier.name)}' sedang nonaktif`);
      }
    }
    if (input.branchId) {
      const branchExists = await branchRepo.branchExists(input.branchId, tx);
      if (!branchExists) throw notFound('Cabang', input.branchId);
    }

    const data: Record<string, unknown> = {};
    if (input.supplierId !== undefined) data.supplier_id = input.supplierId;
    if (input.branchId !== undefined) data.branch_id = input.branchId;
    if (input.orderDate !== undefined) data.order_date = input.orderDate;
    if (input.expectedDate !== undefined) data.expected_date = input.expectedDate;
    if (input.dueDate !== undefined) data.due_date = input.dueDate;
    if (input.notes !== undefined) {
      data.notes = input.notes ? normalizeText(input.notes) : null;
    }
    if (input.status !== undefined) {
      data.status = input.status;
      if (input.status === 'ordered') data.confirmed_at = new Date().toISOString();
    }

    let subtotalIdr = num(current.subtotalIdr);
    if (input.items) {
      const resolved = await resolvePurchaseItems(input.items, tx);
      subtotalIdr = resolved.subtotalIdr;
      await purchaseRepo.deletePurchaseOrderItems(purchaseOrderId, tx);
      for (const item of resolved.items) {
        await purchaseRepo.insertPurchaseOrderItem(
          {
            purchaseOrderId,
            ingredientId: item.ingredientId,
            quantity: item.quantity,
            unitPriceIdr: item.unitPriceIdr,
            lineTotalIdr: item.lineTotalIdr,
            notes: item.notes,
            sortOrder: item.sortOrder,
          },
          tx,
        );
      }
    }

    const discountIdr =
      input.discountIdr !== undefined ? Math.max(0, Math.round(input.discountIdr)) : num(current.discountIdr);
    const taxIdr =
      input.taxIdr !== undefined ? Math.max(0, Math.round(input.taxIdr)) : num(current.taxIdr);
    data.subtotal_idr = subtotalIdr;
    data.discount_idr = discountIdr;
    data.tax_idr = taxIdr;
    data.total_idr = computeTotal(subtotalIdr, discountIdr, taxIdr);

    const updated = await purchaseRepo.updatePurchaseOrder(purchaseOrderId, data, tx);
    if (!updated) throw notFound('Purchase order', purchaseOrderId);

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'purchase.order.update',
        entityType: 'purchase_order',
        entityId: purchaseOrderId,
        oldData: { status: str(current.status), totalIdr: num(current.totalIdr) },
        newData: { status: str(updated.status), totalIdr: num(updated.totalIdr) },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return purchaseOrderDetailInTx(purchaseOrderId, tx);
  });
}

export async function confirmPurchaseOrder(
  purchaseOrderId: string,
  actorUserId: string,
  audit: PurchaseAuditContext = {},
) {
  return withTransaction(async (tx) => {
    const current = await purchaseRepo.lockPurchaseOrder(purchaseOrderId, tx);
    if (!current) throw notFound('Purchase order', purchaseOrderId);
    if (str(current.status) !== 'draft') {
      throw conflict('Hanya purchase order berstatus draft yang bisa diterbitkan');
    }

    const updated = await purchaseRepo.updatePurchaseOrder(
      purchaseOrderId,
      { status: 'ordered', confirmed_at: new Date().toISOString() },
      tx,
    );
    if (!updated) throw notFound('Purchase order', purchaseOrderId);

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'purchase.order.confirm',
        entityType: 'purchase_order',
        entityId: purchaseOrderId,
        oldData: { status: 'draft' },
        newData: { status: 'ordered' },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return purchaseOrderDetailInTx(purchaseOrderId, tx);
  });
}

export async function cancelPurchaseOrder(
  purchaseOrderId: string,
  actorUserId: string,
  input: CancelPurchaseOrderInput,
  audit: PurchaseAuditContext = {},
) {
  return withTransaction(async (tx) => {
    const current = await purchaseRepo.lockPurchaseOrder(purchaseOrderId, tx);
    if (!current) throw notFound('Purchase order', purchaseOrderId);
    if (str(current.status) === 'cancelled') {
      throw conflict('Purchase order sudah dibatalkan');
    }
    if (str(current.status) === 'received') {
      throw conflict('Purchase order yang sudah diterima seluruhnya tidak bisa dibatalkan');
    }

    const postedReceipts = await purchaseRepo.countGoodsReceipts(
      { purchaseOrderId, status: 'posted' },
      tx,
    );
    if (postedReceipts > 0) {
      throw conflict('Sudah ada penerimaan yang diposting. Batalkan lewat penyesuaian stok bila perlu.');
    }

    const updated = await purchaseRepo.updatePurchaseOrder(
      purchaseOrderId,
      { status: 'cancelled', cancel_reason: input.reason ? normalizeText(input.reason) : null },
      tx,
    );
    if (!updated) throw notFound('Purchase order', purchaseOrderId);

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'purchase.order.cancel',
        entityType: 'purchase_order',
        entityId: purchaseOrderId,
        oldData: { status: str(current.status) },
        newData: { status: 'cancelled', reason: input.reason ?? null },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return purchaseOrderDetailInTx(purchaseOrderId, tx);
  });
}

export async function deletePurchaseOrder(
  purchaseOrderId: string,
  actorUserId: string,
  audit: PurchaseAuditContext = {},
) {
  return withTransaction(async (tx) => {
    const current = await purchaseRepo.lockPurchaseOrder(purchaseOrderId, tx);
    if (!current) throw notFound('Purchase order', purchaseOrderId);
    if (str(current.status) !== 'draft') {
      throw conflict('Hanya purchase order berstatus draft yang bisa dihapus');
    }

    const receiptCount = await purchaseRepo.countGoodsReceipts({ purchaseOrderId }, tx);
    if (receiptCount > 0) {
      throw conflict('Purchase order sudah punya dokumen penerimaan');
    }

    await purchaseRepo.deletePurchaseOrder(purchaseOrderId, tx);

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'purchase.order.delete',
        entityType: 'purchase_order',
        entityId: purchaseOrderId,
        oldData: { number: str(current.number), status: str(current.status) },
        newData: { deleted: true },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return { id: purchaseOrderId, deleted: true };
  });
}

// --------------------------------------------------------------------------
// Goods receipts
// --------------------------------------------------------------------------
export async function listGoodsReceipts(
  query: ListGoodsReceiptQuery,
): Promise<Paginated<unknown>> {
  const paging = parsePagination(query);
  const filters = {
    q: query.q,
    purchaseOrderId: query.purchaseOrderId,
    supplierId: query.supplierId,
    stockLocationId: query.stockLocationId,
    status: query.status,
    from: query.from,
    to: query.to,
  };
  const rows = await purchaseRepo.listGoodsReceipts(filters, paging);
  const total = await purchaseRepo.countGoodsReceipts(filters);
  return {
    items: rows.map((row) => shapeGoodsReceipt(row as Record<string, unknown>)),
    meta: paginationMeta(total, paging),
  };
}

export async function goodsReceiptDetail(goodsReceiptId: string) {
  const receipt = await purchaseRepo.findGoodsReceiptById(goodsReceiptId);
  if (!receipt) throw notFound('Penerimaan barang', goodsReceiptId);
  const items = await purchaseRepo.listGoodsReceiptItems(goodsReceiptId);
  return {
    receipt: shapeGoodsReceipt(receipt as Record<string, unknown>),
    items: items.map((row) => shapeGoodsReceiptItem(row as Record<string, unknown>)),
  };
}

interface ReceiptLine {
  purchaseOrderItemId: string;
  ingredientId: string;
  quantity: number;
  unitPriceIdr: number;
}

function assertReceiptLines(
  lines: ReceiptLine[],
  orderItems: Record<string, unknown>[],
): void {
  const seen = new Set<string>();
  const byId = new Map(orderItems.map((item) => [str(item.id), item]));

  for (const line of lines) {
    if (seen.has(line.purchaseOrderItemId)) {
      throw unprocessable('Satu bahan tidak boleh muncul dua kali dalam penerimaan');
    }
    seen.add(line.purchaseOrderItemId);

    const item = byId.get(line.purchaseOrderItemId);
    if (!item) {
      throw unprocessable('Bahan penerimaan tidak termasuk dalam purchase order ini');
    }

    const remaining = num(item.quantity) - num(item.quantityReceived);
    if (line.quantity - remaining > QUANTITY_EPSILON) {
      throw unprocessable(
        `Kuantitas ${str(item.ingredientName)} melebihi sisa pesanan (sisa ${remaining} ${str(item.baseUnit)})`,
      );
    }
  }
}

/**
 * Terapkan penerimaan ke stok & status PO. Wajib dipanggil di dalam transaksi
 * yang sudah mengunci baris purchase order.
 */
async function applyReceiptToStock(
  tx: TransactionClient,
  params: {
    receiptId: string;
    receiptNumber: string;
    purchaseOrder: Record<string, unknown>;
    stockLocationId: string;
    receivedDate: string | null;
    actorUserId: string;
    lines: ReceiptLine[];
  },
) {
  const { receiptId, receiptNumber, purchaseOrder, stockLocationId, receivedDate, actorUserId, lines } =
    params;
  const purchaseOrderId = str(purchaseOrder.id);
  const purchaseOrderNumber = str(purchaseOrder.number);

  for (const line of lines) {
    await tx.advisoryLock(`inventory:movement:${line.ingredientId}`);
    const ingredient = await inventoryRepo.lockIngredient(line.ingredientId, tx);
    if (!ingredient) throw notFound('Bahan baku', line.ingredientId);

    await purchaseRepo.addReceivedQuantity(line.purchaseOrderItemId, line.quantity, tx);

    await inventoryRepo.insertMovement(
      {
        stockLocationId,
        ingredientId: line.ingredientId,
        quantityDelta: line.quantity,
        movementType: 'purchase',
        referenceType: 'goods_receipt',
        referenceId: receiptId,
        notes: `Penerimaan ${receiptNumber} · PO ${purchaseOrderNumber}`,
        movementDate: receivedDate,
        createdBy: actorUserId,
      },
      tx,
    );

    if (line.unitPriceIdr > 0) {
      await purchaseRepo.updateIngredientLastPrice(line.ingredientId, line.unitPriceIdr, tx);
    }
  }

  const summary = await purchaseRepo.purchaseOrderReceiveSummary(purchaseOrderId, tx);
  const totalLines = num(summary?.totalLines);
  const receivedLines = num(summary?.receivedLines);
  const allReceived = totalLines > 0 && receivedLines >= totalLines;

  await purchaseRepo.updatePurchaseOrder(
    purchaseOrderId,
    {
      status: allReceived ? 'received' : 'partial',
      received_at: allReceived ? new Date().toISOString() : null,
    },
    tx,
  );
}

export async function receivePurchaseOrder(
  purchaseOrderId: string,
  actorUserId: string,
  input: CreateGoodsReceiptInput,
  audit: PurchaseAuditContext = {},
) {
  return withTransaction(async (tx) => {
    const order = await purchaseRepo.lockPurchaseOrder(purchaseOrderId, tx);
    if (!order) throw notFound('Purchase order', purchaseOrderId);
    if (!['ordered', 'partial'].includes(str(order.status))) {
      throw conflict('Penerimaan hanya bisa dibuat untuk PO berstatus diterbitkan/sebagian');
    }

    const location = await inventoryRepo.findStockLocation(input.stockLocationId, tx);
    if (!location) throw notFound('Lokasi stok', input.stockLocationId);

    const orderItems = await purchaseRepo.listPurchaseOrderItems(purchaseOrderId, tx);
    const byId = new Map(orderItems.map((item) => [str(item.id), item as Record<string, unknown>]));

    const lines: ReceiptLine[] = input.items.map((item) => {
      const orderItem = byId.get(item.purchaseOrderItemId);
      if (!orderItem) {
        throw unprocessable('Bahan penerimaan tidak termasuk dalam purchase order ini');
      }
      return {
        purchaseOrderItemId: item.purchaseOrderItemId,
        ingredientId: str(orderItem.ingredientId),
        quantity: Math.round(Number(item.quantity) * 1000) / 1000,
        unitPriceIdr: num(orderItem.unitPriceIdr),
      };
    });
    assertReceiptLines(lines, orderItems);

    const number = await purchaseRepo.nextDocumentNumber('goods_receipt_number_seq', 'GR', tx);
    if (!number) throw unprocessable('Nomor penerimaan gagal dibuat, coba lagi');

    const postToStock = bool(input.postToStock, true);
    const receivedDate = input.receivedDate ?? null;

    const receipt = await purchaseRepo.insertGoodsReceipt(
      {
        number,
        purchaseOrderId,
        stockLocationId: input.stockLocationId,
        status: postToStock ? 'posted' : 'draft',
        receivedDate,
        notes: input.notes ? normalizeText(input.notes) : null,
        createdBy: actorUserId,
        postedAt: postToStock ? new Date().toISOString() : null,
        postedBy: postToStock ? actorUserId : null,
      },
      tx,
    );
    if (!receipt) throw unprocessable('Penerimaan gagal disimpan, coba lagi');

    for (const line of lines) {
      await purchaseRepo.insertGoodsReceiptItem(
        {
          goodsReceiptId: str(receipt.id),
          purchaseOrderItemId: line.purchaseOrderItemId,
          ingredientId: line.ingredientId,
          quantity: line.quantity,
          unitPriceIdr: line.unitPriceIdr,
        },
        tx,
      );
    }

    if (postToStock) {
      await applyReceiptToStock(tx, {
        receiptId: str(receipt.id),
        receiptNumber: number,
        purchaseOrder: order as Record<string, unknown>,
        stockLocationId: input.stockLocationId,
        receivedDate,
        actorUserId,
        lines,
      });
    }

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'purchase.receipt.create',
        entityType: 'goods_receipt',
        entityId: str(receipt.id),
        newData: {
          number,
          purchaseOrderNumber: str(order.number),
          postToStock,
          itemCount: lines.length,
        },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return goodsReceiptDetailInTx(str(receipt.id), tx);
  });
}

async function goodsReceiptDetailInTx(goodsReceiptId: string, tx: TransactionClient) {
  const receipt = await purchaseRepo.findGoodsReceiptById(goodsReceiptId, tx);
  if (!receipt) throw notFound('Penerimaan barang', goodsReceiptId);
  const items = await purchaseRepo.listGoodsReceiptItems(goodsReceiptId, tx);
  return {
    receipt: shapeGoodsReceipt(receipt as Record<string, unknown>),
    items: items.map((row) => shapeGoodsReceiptItem(row as Record<string, unknown>)),
  };
}

export async function postGoodsReceipt(
  goodsReceiptId: string,
  actorUserId: string,
  audit: PurchaseAuditContext = {},
) {
  return withTransaction(async (tx) => {
    const receipt = await purchaseRepo.lockGoodsReceipt(goodsReceiptId, tx);
    if (!receipt) throw notFound('Penerimaan barang', goodsReceiptId);
    if (str(receipt.status) !== 'draft') {
      throw conflict('Hanya penerimaan berstatus draft yang bisa diposting');
    }

    const order = await purchaseRepo.lockPurchaseOrder(str(receipt.purchaseOrderId), tx);
    if (!order) throw notFound('Purchase order', str(receipt.purchaseOrderId));
    if (str(order.status) === 'cancelled') {
      throw conflict('Purchase order sudah dibatalkan');
    }

    const receiptItems = await purchaseRepo.listGoodsReceiptItems(goodsReceiptId, tx);
    const orderItems = await purchaseRepo.listPurchaseOrderItems(str(receipt.purchaseOrderId), tx);
    const lines: ReceiptLine[] = receiptItems.map((item) => {
      const row = item as Record<string, unknown>;
      return {
        purchaseOrderItemId: str(row.purchaseOrderItemId),
        ingredientId: str(row.ingredientId),
        quantity: num(row.quantity),
        unitPriceIdr: num(row.unitPriceIdr),
      };
    });
    assertReceiptLines(lines, orderItems);

    await applyReceiptToStock(tx, {
      receiptId: goodsReceiptId,
      receiptNumber: str(receipt.number),
      purchaseOrder: order as Record<string, unknown>,
      stockLocationId: str(receipt.stockLocationId),
      receivedDate: iso(receipt.receivedDate),
      actorUserId,
      lines,
    });

    await purchaseRepo.markGoodsReceiptPosted(goodsReceiptId, actorUserId, tx);

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'purchase.receipt.post',
        entityType: 'goods_receipt',
        entityId: goodsReceiptId,
        oldData: { status: 'draft' },
        newData: { status: 'posted', itemCount: lines.length },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return goodsReceiptDetailInTx(goodsReceiptId, tx);
  });
}

// --------------------------------------------------------------------------
// Supplier payments / hutang
// --------------------------------------------------------------------------
export async function addSupplierPayment(
  purchaseOrderId: string,
  actorUserId: string,
  input: CreateSupplierPaymentInput,
  audit: PurchaseAuditContext = {},
) {
  return withTransaction(async (tx) => {
    const order = await purchaseRepo.lockPurchaseOrder(purchaseOrderId, tx);
    if (!order) throw notFound('Purchase order', purchaseOrderId);
    if (str(order.status) === 'cancelled') {
      throw conflict('Purchase order sudah dibatalkan');
    }
    if (str(order.status) === 'draft') {
      throw unprocessable('Terbitkan purchase order sebelum mencatat pembayaran');
    }

    const totalIdr = num(order.totalIdr);
    const paidAmountIdr = num(order.paidAmountIdr);
    const outstandingIdr = Math.max(totalIdr - paidAmountIdr, 0);
    const amountIdr = Math.round(Number(input.amountIdr));

    if (amountIdr <= 0) throw unprocessable('Nominal pembayaran harus lebih dari 0');
    if (amountIdr - outstandingIdr > 0) {
      throw unprocessable(
        `Nominal melebihi sisa hutang (sisa ${outstandingIdr} rupiah)`,
      );
    }

    const payment = await purchaseRepo.insertSupplierPayment(
      {
        purchaseOrderId,
        amountIdr,
        paidAt: input.paidAt ?? null,
        method: input.method,
        reference: input.reference ? normalizeText(input.reference) : null,
        proofUrl: input.proofUrl ?? null,
        notes: input.notes ? normalizeText(input.notes) : null,
        createdBy: actorUserId,
      },
      tx,
    );
    if (!payment) throw unprocessable('Pembayaran gagal disimpan, coba lagi');

    const nextPaid = paidAmountIdr + amountIdr;
    const paymentStatus = nextPaid >= totalIdr ? 'paid' : nextPaid > 0 ? 'partial' : 'unpaid';
    const updated = await purchaseRepo.updatePurchaseOrderPaidAmount(
      purchaseOrderId,
      nextPaid,
      paymentStatus,
      tx,
    );

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'purchase.payment.create',
        entityType: 'supplier_payment',
        entityId: str(payment.id),
        newData: {
          purchaseOrderNumber: str(order.number),
          amountIdr,
          paymentStatus,
          outstandingIdr: Math.max(totalIdr - nextPaid, 0),
        },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return {
      payment: shapeSupplierPayment(payment as Record<string, unknown>),
      order: updated
        ? {
            id: str(updated.id),
            number: str(updated.number),
            totalIdr: num(updated.totalIdr),
            paidAmountIdr: num(updated.paidAmountIdr),
            outstandingIdr: Math.max(num(updated.totalIdr) - num(updated.paidAmountIdr), 0),
            paymentStatus: str(updated.paymentStatus),
          }
        : null,
    };
  });
}

export async function listPayables(query: ListPayableQuery) {
  const paging = parsePagination(query);
  const filters = { q: query.q, supplierId: query.supplierId };
  const [rows, total, totalOutstandingIdr] = await Promise.all([
    purchaseRepo.listPayables(filters, paging),
    purchaseRepo.countPayables(filters),
    purchaseRepo.totalOutstandingPayable(),
  ]);

  return {
    items: rows.map((row) => {
      const record = row as Record<string, unknown>;
      return {
        id: str(record.id),
        number: str(record.number),
        status: str(record.status),
        paymentStatus: str(record.paymentStatus),
        orderDate: iso(record.orderDate),
        expectedDate: iso(record.expectedDate),
        dueDate: iso(record.dueDate),
        totalIdr: num(record.totalIdr),
        paidAmountIdr: num(record.paidAmountIdr),
        outstandingIdr: num(record.outstandingIdr),
        supplierId: str(record.supplierId),
        supplierCode: strOrNull(record.supplierCode),
        supplierName: strOrNull(record.supplierName),
        branchId: strOrNull(record.branchId),
        branchName: strOrNull(record.branchName),
        createdAt: iso(record.createdAt),
      };
    }),
    meta: paginationMeta(total, paging),
    summary: { totalOutstandingIdr },
  };
}
