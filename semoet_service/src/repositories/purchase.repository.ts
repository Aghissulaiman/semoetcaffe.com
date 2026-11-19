import { db, many, one, scalar, type Exec } from './base.js';
import { paginationSql, type Paging } from '../utils/pagination.js';

// --------------------------------------------------------------------------
// Supplier
// --------------------------------------------------------------------------
export async function listSuppliers(
  filters: { q?: string; isActive?: boolean },
  pagination: Paging,
  executor: Exec = db,
) {
  return many(
    executor,
    `SELECT s.id, s.code, s.name, s.contact_name, s.phone, s.email, s.address, s.notes,
            s.is_active, s.created_at, s.updated_at,
            (SELECT COUNT(*)::int FROM purchase_orders po WHERE po.supplier_id = s.id) AS purchase_order_count
       FROM suppliers s
      WHERE ($1::text IS NULL OR s.name ILIKE '%' || $1 || '%' OR s.code ILIKE '%' || $1 || '%')
        AND ($2::boolean IS NULL OR s.is_active = $2)
      ORDER BY s.name ASC
      ${paginationSql(pagination)}`,
    [filters.q ?? null, filters.isActive ?? null],
  );
}

export async function countSuppliers(
  filters: { q?: string; isActive?: boolean },
  executor: Exec = db,
) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int
       FROM suppliers s
      WHERE ($1::text IS NULL OR s.name ILIKE '%' || $1 || '%' OR s.code ILIKE '%' || $1 || '%')
        AND ($2::boolean IS NULL OR s.is_active = $2)`,
    [filters.q ?? null, filters.isActive ?? null],
  );
  return Number(value ?? 0);
}

export async function findSupplierById(supplierId: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT s.id, s.code, s.name, s.contact_name, s.phone, s.email, s.address, s.notes,
            s.is_active, s.created_at, s.updated_at,
            (SELECT COUNT(*)::int FROM purchase_orders po WHERE po.supplier_id = s.id) AS purchase_order_count
       FROM suppliers s
      WHERE s.id = $1`,
    [supplierId],
  );
}

export async function findSupplierByCode(code: string, executor: Exec = db) {
  return one(executor, `SELECT id, code, name FROM suppliers WHERE code = $1`, [code]);
}

export async function nextSupplierCode(executor: Exec = db) {
  return scalar<string>(
    executor,
    `SELECT 'SUP-' || lpad(nextval('supplier_code_seq')::text, 4, '0')`,
  );
}

export async function insertSupplier(
  input: {
    code: string;
    name: string;
    contactName?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    notes?: string | null;
    isActive: boolean;
  },
  executor: Exec,
) {
  return one(
    executor,
    `INSERT INTO suppliers (code, name, contact_name, phone, email, address, notes, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id, code, name, contact_name, phone, email, address, notes, is_active, created_at, updated_at`,
    [
      input.code,
      input.name,
      input.contactName ?? null,
      input.phone ?? null,
      input.email ?? null,
      input.address ?? null,
      input.notes ?? null,
      input.isActive,
    ],
  );
}

export async function updateSupplier(
  supplierId: string,
  data: Record<string, unknown>,
  executor: Exec,
) {
  const columns = Object.keys(data);
  if (columns.length === 0) return null;
  const assignments = columns.map((column, index) => `${column} = $${index + 2}`).join(', ');
  return one(
    executor,
    `UPDATE suppliers SET ${assignments}, updated_at = now()
      WHERE id = $1
      RETURNING id, code, name, contact_name, phone, email, address, notes, is_active, created_at, updated_at`,
    [supplierId, ...Object.values(data)],
  );
}

export async function deleteSupplier(supplierId: string, executor: Exec) {
  return one(
    executor,
    `DELETE FROM suppliers WHERE id = $1
     RETURNING id, code, name, contact_name, phone, email, address, notes, is_active`,
    [supplierId],
  );
}

export async function countPurchaseOrdersBySupplier(supplierId: string, executor: Exec = db) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int FROM purchase_orders WHERE supplier_id = $1`,
    [supplierId],
  );
  return Number(value ?? 0);
}

// --------------------------------------------------------------------------
// Purchase order
// --------------------------------------------------------------------------
/** Nomor dokumen: prefix + YYMMDD + urutan 6 digit (mis. PO261031000043). */
export async function nextDocumentNumber(
  sequence: 'purchase_order_number_seq' | 'goods_receipt_number_seq',
  prefix: 'PO' | 'GR',
  executor: Exec = db,
) {
  return scalar<string>(
    executor,
    `SELECT $1 || to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYMMDD') ||
            lpad(nextval($2::regclass)::text, 6, '0')`,
    [prefix, sequence],
  );
}

const PURCHASE_ORDER_SELECT = `
  SELECT po.id, po.number, po.supplier_id,
         s.code AS supplier_code, s.name AS supplier_name,
         po.branch_id, b.name AS branch_name,
         po.status, po.payment_status, po.order_date, po.expected_date, po.due_date,
         po.subtotal_idr, po.discount_idr, po.tax_idr, po.total_idr, po.paid_amount_idr,
         GREATEST(po.total_idr - po.paid_amount_idr, 0) AS outstanding_idr,
         po.notes, po.cancel_reason, po.confirmed_at, po.received_at,
         po.created_by, u.display_name AS created_by_name,
         po.created_at, po.updated_at,
         COALESCE(items.item_count, 0) AS item_count,
         COALESCE(items.total_quantity, 0) AS total_quantity
    FROM purchase_orders po
    JOIN suppliers s ON s.id = po.supplier_id
    LEFT JOIN branches b ON b.id = po.branch_id
    LEFT JOIN users u ON u.id = po.created_by
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS item_count, COALESCE(SUM(poi.quantity), 0) AS total_quantity
        FROM purchase_order_items poi
       WHERE poi.purchase_order_id = po.id
    ) items ON true
`;

export async function listPurchaseOrders(
  filters: {
    q?: string;
    status?: string;
    paymentStatus?: string;
    supplierId?: string;
    branchId?: string;
    from?: string;
    to?: string;
  },
  pagination: Paging,
  executor: Exec = db,
) {
  return many(
    executor,
    `${PURCHASE_ORDER_SELECT}
      WHERE ($1::text IS NULL OR po.number ILIKE '%' || $1 || '%'
             OR s.name ILIKE '%' || $1 || '%' OR s.code ILIKE '%' || $1 || '%')
        AND ($2::text IS NULL OR po.status = $2)
        AND ($3::text IS NULL OR po.payment_status = $3)
        AND ($4::uuid IS NULL OR po.supplier_id = $4)
        AND ($5::uuid IS NULL OR po.branch_id = $5)
        AND ($6::date IS NULL OR po.order_date >= $6::date)
        AND ($7::date IS NULL OR po.order_date <= $7::date)
      ORDER BY po.order_date DESC, po.created_at DESC
      ${paginationSql(pagination)}`,
    [
      filters.q ?? null,
      filters.status ?? null,
      filters.paymentStatus ?? null,
      filters.supplierId ?? null,
      filters.branchId ?? null,
      filters.from ?? null,
      filters.to ?? null,
    ],
  );
}

export async function countPurchaseOrders(
  filters: {
    q?: string;
    status?: string;
    paymentStatus?: string;
    supplierId?: string;
    branchId?: string;
    from?: string;
    to?: string;
  },
  executor: Exec = db,
) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int
       FROM purchase_orders po
       JOIN suppliers s ON s.id = po.supplier_id
      WHERE ($1::text IS NULL OR po.number ILIKE '%' || $1 || '%'
             OR s.name ILIKE '%' || $1 || '%' OR s.code ILIKE '%' || $1 || '%')
        AND ($2::text IS NULL OR po.status = $2)
        AND ($3::text IS NULL OR po.payment_status = $3)
        AND ($4::uuid IS NULL OR po.supplier_id = $4)
        AND ($5::uuid IS NULL OR po.branch_id = $5)
        AND ($6::date IS NULL OR po.order_date >= $6::date)
        AND ($7::date IS NULL OR po.order_date <= $7::date)`,
    [
      filters.q ?? null,
      filters.status ?? null,
      filters.paymentStatus ?? null,
      filters.supplierId ?? null,
      filters.branchId ?? null,
      filters.from ?? null,
      filters.to ?? null,
    ],
  );
  return Number(value ?? 0);
}

export async function findPurchaseOrderById(purchaseOrderId: string, executor: Exec = db) {
  return one(
    executor,
    `${PURCHASE_ORDER_SELECT} WHERE po.id = $1`,
    [purchaseOrderId],
  );
}

export async function lockPurchaseOrder(purchaseOrderId: string, executor: Exec) {
  return one(
    executor,
    `SELECT id, number, supplier_id, branch_id, status, payment_status,
            order_date, expected_date, due_date, subtotal_idr, discount_idr, tax_idr,
            total_idr, paid_amount_idr, notes, cancel_reason, confirmed_at,
            received_at, created_at, updated_at
       FROM purchase_orders
      WHERE id = $1
      FOR UPDATE`,
    [purchaseOrderId],
  );
}

export async function listPurchaseOrderItems(purchaseOrderId: string, executor: Exec = db) {
  return many(
    executor,
    `SELECT poi.id, poi.purchase_order_id, poi.ingredient_id,
            i.sku AS ingredient_sku, i.name AS ingredient_name, i.base_unit,
            poi.quantity, poi.quantity_received,
            (poi.quantity - poi.quantity_received) AS remaining_quantity,
            poi.unit_price_idr, poi.line_total_idr, poi.notes, poi.sort_order,
            poi.created_at
       FROM purchase_order_items poi
       JOIN ingredients i ON i.id = poi.ingredient_id
      WHERE poi.purchase_order_id = $1
      ORDER BY poi.sort_order ASC, poi.created_at ASC`,
    [purchaseOrderId],
  );
}

export async function insertPurchaseOrder(
  input: {
    number: string;
    supplierId: string;
    branchId?: string | null;
    status: string;
    orderDate?: string | null;
    expectedDate?: string | null;
    dueDate?: string | null;
    subtotalIdr: number;
    discountIdr: number;
    taxIdr: number;
    totalIdr: number;
    notes?: string | null;
    createdBy: string;
    confirmedAt?: string | null;
  },
  executor: Exec,
) {
  return one(
    executor,
    `INSERT INTO purchase_orders (
        number, supplier_id, branch_id, status, order_date, expected_date, due_date,
        subtotal_idr, discount_idr, tax_idr, total_idr, notes, created_by, confirmed_at
     ) VALUES ($1,$2,$3,$4,COALESCE($5::date, CURRENT_DATE),$6::date,$7::date,$8,$9,$10,$11,$12,$13,$14)
     RETURNING id, number, supplier_id, branch_id, status, payment_status, order_date,
               expected_date, due_date, subtotal_idr, discount_idr, tax_idr, total_idr, paid_amount_idr,
               notes, confirmed_at, created_at, updated_at`,
    [
      input.number,
      input.supplierId,
      input.branchId ?? null,
      input.status,
      input.orderDate ?? null,
      input.expectedDate ?? null,
      input.dueDate ?? null,
      input.subtotalIdr,
      input.discountIdr,
      input.taxIdr,
      input.totalIdr,
      input.notes ?? null,
      input.createdBy,
      input.confirmedAt ?? null,
    ],
  );
}

export async function insertPurchaseOrderItem(
  input: {
    purchaseOrderId: string;
    ingredientId: string;
    quantity: number;
    unitPriceIdr: number;
    lineTotalIdr: number;
    notes?: string | null;
    sortOrder: number;
  },
  executor: Exec,
) {
  return one(
    executor,
    `INSERT INTO purchase_order_items (
        purchase_order_id, ingredient_id, quantity, unit_price_idr, line_total_idr, notes, sort_order
     ) VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, purchase_order_id, ingredient_id, quantity, quantity_received,
               unit_price_idr, line_total_idr, notes, sort_order, created_at`,
    [
      input.purchaseOrderId,
      input.ingredientId,
      input.quantity,
      input.unitPriceIdr,
      input.lineTotalIdr,
      input.notes ?? null,
      input.sortOrder,
    ],
  );
}

export async function updatePurchaseOrder(
  purchaseOrderId: string,
  data: Record<string, unknown>,
  executor: Exec,
) {
  const columns = Object.keys(data);
  if (columns.length === 0) return null;
  const assignments = columns.map((column, index) => `${column} = $${index + 2}`).join(', ');
  return one(
    executor,
    `UPDATE purchase_orders SET ${assignments}, updated_at = now()
      WHERE id = $1
      RETURNING id, number, supplier_id, branch_id, status, payment_status, order_date,
                expected_date, due_date, subtotal_idr, discount_idr, tax_idr, total_idr, paid_amount_idr,
                notes, cancel_reason, confirmed_at, received_at, created_at, updated_at`,
    [purchaseOrderId, ...Object.values(data)],
  );
}

export async function deletePurchaseOrderItems(purchaseOrderId: string, executor: Exec) {
  await executor.query(`DELETE FROM purchase_order_items WHERE purchase_order_id = $1`, [
    purchaseOrderId,
  ]);
}

export async function deletePurchaseOrder(purchaseOrderId: string, executor: Exec) {
  return one(
    executor,
    `DELETE FROM purchase_orders WHERE id = $1 RETURNING id, number`,
    [purchaseOrderId],
  );
}

export async function lockPurchaseOrderItem(
  itemId: string,
  purchaseOrderId: string,
  executor: Exec,
) {
  return one(
    executor,
    `SELECT id, purchase_order_id, ingredient_id, quantity, quantity_received,
            unit_price_idr, line_total_idr
       FROM purchase_order_items
      WHERE id = $1 AND purchase_order_id = $2
      FOR UPDATE`,
    [itemId, purchaseOrderId],
  );
}

export async function addReceivedQuantity(
  itemId: string,
  quantity: number,
  executor: Exec,
) {
  return one(
    executor,
    `UPDATE purchase_order_items
        SET quantity_received = quantity_received + $2
      WHERE id = $1
      RETURNING id, quantity, quantity_received`,
    [itemId, quantity],
  );
}

export async function purchaseOrderReceiveSummary(purchaseOrderId: string, executor: Exec = db) {
  return one<{
    totalLines: number;
    receivedLines: number;
    totalOrdered: number;
    totalReceived: number;
  }>(
    executor,
    `SELECT COUNT(*)::int AS total_lines,
            COUNT(*) FILTER (WHERE quantity_received >= quantity)::int AS received_lines,
            COALESCE(SUM(quantity), 0) AS total_ordered,
            COALESCE(SUM(quantity_received), 0) AS total_received
       FROM purchase_order_items
      WHERE purchase_order_id = $1`,
    [purchaseOrderId],
  );
}

// --------------------------------------------------------------------------
// Goods receipts (dokumen stok masuk)
// --------------------------------------------------------------------------
const GOODS_RECEIPT_SELECT = `
  SELECT gr.id, gr.number, gr.purchase_order_id, po.number AS purchase_order_number,
         po.supplier_id, s.code AS supplier_code, s.name AS supplier_name,
         gr.stock_location_id, sl.name AS stock_location_name,
         gr.status, gr.received_date, gr.notes, gr.posted_at, gr.posted_by,
         pu.display_name AS posted_by_name, gr.created_by, u.display_name AS created_by_name,
         gr.created_at, gr.updated_at,
         COALESCE(items.item_count, 0) AS item_count,
         COALESCE(items.total_quantity, 0) AS total_quantity,
         COALESCE(items.total_value_idr, 0) AS total_value_idr
    FROM goods_receipts gr
    JOIN purchase_orders po ON po.id = gr.purchase_order_id
    JOIN suppliers s ON s.id = po.supplier_id
    JOIN stock_locations sl ON sl.id = gr.stock_location_id
    LEFT JOIN users pu ON pu.id = gr.posted_by
    LEFT JOIN users u ON u.id = gr.created_by
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS item_count,
             COALESCE(SUM(gri.quantity), 0) AS total_quantity,
             COALESCE(SUM(gri.quantity * gri.unit_price_idr), 0)::bigint AS total_value_idr
        FROM goods_receipt_items gri
       WHERE gri.goods_receipt_id = gr.id
    ) items ON true
`;

export async function listGoodsReceipts(
  filters: {
    q?: string;
    purchaseOrderId?: string;
    supplierId?: string;
    stockLocationId?: string;
    status?: string;
    from?: string;
    to?: string;
  },
  pagination: Paging,
  executor: Exec = db,
) {
  return many(
    executor,
    `${GOODS_RECEIPT_SELECT}
      WHERE ($1::text IS NULL OR gr.number ILIKE '%' || $1 || '%'
             OR po.number ILIKE '%' || $1 || '%'
             OR s.name ILIKE '%' || $1 || '%')
        AND ($2::uuid IS NULL OR gr.purchase_order_id = $2)
        AND ($3::uuid IS NULL OR po.supplier_id = $3)
        AND ($4::uuid IS NULL OR gr.stock_location_id = $4)
        AND ($5::text IS NULL OR gr.status = $5)
        AND ($6::date IS NULL OR gr.received_date >= $6::date)
        AND ($7::date IS NULL OR gr.received_date <= $7::date)
      ORDER BY gr.received_date DESC, gr.created_at DESC
      ${paginationSql(pagination)}`,
    [
      filters.q ?? null,
      filters.purchaseOrderId ?? null,
      filters.supplierId ?? null,
      filters.stockLocationId ?? null,
      filters.status ?? null,
      filters.from ?? null,
      filters.to ?? null,
    ],
  );
}

export async function countGoodsReceipts(
  filters: {
    q?: string;
    purchaseOrderId?: string;
    supplierId?: string;
    stockLocationId?: string;
    status?: string;
    from?: string;
    to?: string;
  },
  executor: Exec = db,
) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int
       FROM goods_receipts gr
       JOIN purchase_orders po ON po.id = gr.purchase_order_id
       JOIN suppliers s ON s.id = po.supplier_id
       JOIN stock_locations sl ON sl.id = gr.stock_location_id
      WHERE ($1::text IS NULL OR gr.number ILIKE '%' || $1 || '%'
             OR po.number ILIKE '%' || $1 || '%'
             OR s.name ILIKE '%' || $1 || '%')
        AND ($2::uuid IS NULL OR gr.purchase_order_id = $2)
        AND ($3::uuid IS NULL OR po.supplier_id = $3)
        AND ($4::uuid IS NULL OR gr.stock_location_id = $4)
        AND ($5::text IS NULL OR gr.status = $5)
        AND ($6::date IS NULL OR gr.received_date >= $6::date)
        AND ($7::date IS NULL OR gr.received_date <= $7::date)`,
    [
      filters.q ?? null,
      filters.purchaseOrderId ?? null,
      filters.supplierId ?? null,
      filters.stockLocationId ?? null,
      filters.status ?? null,
      filters.from ?? null,
      filters.to ?? null,
    ],
  );
  return Number(value ?? 0);
}

export async function findGoodsReceiptById(goodsReceiptId: string, executor: Exec = db) {
  return one(executor, `${GOODS_RECEIPT_SELECT} WHERE gr.id = $1`, [goodsReceiptId]);
}

export async function lockGoodsReceipt(goodsReceiptId: string, executor: Exec) {
  return one(
    executor,
    `SELECT id, number, purchase_order_id, stock_location_id, status,
            received_date, notes, posted_at, posted_by, created_by, created_at, updated_at
       FROM goods_receipts
      WHERE id = $1
      FOR UPDATE`,
    [goodsReceiptId],
  );
}

export async function listGoodsReceiptItems(goodsReceiptId: string, executor: Exec = db) {
  return many(
    executor,
    `SELECT gri.id, gri.goods_receipt_id, gri.purchase_order_item_id, gri.ingredient_id,
            i.sku AS ingredient_sku, i.name AS ingredient_name, i.base_unit,
            gri.quantity, gri.unit_price_idr, po_item.quantity AS ordered_quantity,
            gri.created_at
       FROM goods_receipt_items gri
       JOIN purchase_order_items po_item ON po_item.id = gri.purchase_order_item_id
       JOIN ingredients i ON i.id = gri.ingredient_id
      WHERE gri.goods_receipt_id = $1
      ORDER BY i.name ASC`,
    [goodsReceiptId],
  );
}

export async function insertGoodsReceipt(
  input: {
    number: string;
    purchaseOrderId: string;
    stockLocationId: string;
    status: string;
    receivedDate?: string | null;
    notes?: string | null;
    createdBy: string;
    postedAt?: string | null;
    postedBy?: string | null;
  },
  executor: Exec,
) {
  return one(
    executor,
    `INSERT INTO goods_receipts (
        number, purchase_order_id, stock_location_id, status, received_date,
        notes, posted_at, posted_by, created_by
     ) VALUES ($1,$2,$3,$4,COALESCE($5::date, CURRENT_DATE),$6,$7,$8,$9)
     RETURNING id, number, purchase_order_id, stock_location_id, status, received_date,
               notes, posted_at, posted_by, created_by, created_at, updated_at`,
    [
      input.number,
      input.purchaseOrderId,
      input.stockLocationId,
      input.status,
      input.receivedDate ?? null,
      input.notes ?? null,
      input.postedAt ?? null,
      input.postedBy ?? null,
      input.createdBy,
    ],
  );
}

export async function insertGoodsReceiptItem(
  input: {
    goodsReceiptId: string;
    purchaseOrderItemId: string;
    ingredientId: string;
    quantity: number;
    unitPriceIdr: number;
  },
  executor: Exec,
) {
  return one(
    executor,
    `INSERT INTO goods_receipt_items (
        goods_receipt_id, purchase_order_item_id, ingredient_id, quantity, unit_price_idr
     ) VALUES ($1,$2,$3,$4,$5)
     RETURNING id, goods_receipt_id, purchase_order_item_id, ingredient_id, quantity, unit_price_idr`,
    [
      input.goodsReceiptId,
      input.purchaseOrderItemId,
      input.ingredientId,
      input.quantity,
      input.unitPriceIdr,
    ],
  );
}

export async function markGoodsReceiptPosted(
  goodsReceiptId: string,
  postedBy: string,
  executor: Exec,
) {
  return one(
    executor,
    `UPDATE goods_receipts
        SET status = 'posted', posted_at = now(), posted_by = $2, updated_at = now()
      WHERE id = $1
      RETURNING id, number, status, posted_at, posted_by`,
    [goodsReceiptId, postedBy],
  );
}

// --------------------------------------------------------------------------
// Supplier payments (hutang usaha)
// --------------------------------------------------------------------------
export async function insertSupplierPayment(
  input: {
    purchaseOrderId: string;
    amountIdr: number;
    paidAt?: string | null;
    method: string;
    reference?: string | null;
    proofUrl?: string | null;
    notes?: string | null;
    createdBy: string;
  },
  executor: Exec,
) {
  return one(
    executor,
    `INSERT INTO supplier_payments (
        purchase_order_id, amount_idr, paid_at, method, reference, proof_url, notes, created_by
     ) VALUES ($1,$2,COALESCE($3::date, CURRENT_DATE),$4,$5,$6,$7,$8)
     RETURNING id, purchase_order_id, amount_idr, paid_at, method, reference, proof_url,
               notes, created_by, created_at`,
    [
      input.purchaseOrderId,
      input.amountIdr,
      input.paidAt ?? null,
      input.method,
      input.reference ?? null,
      input.proofUrl ?? null,
      input.notes ?? null,
      input.createdBy,
    ],
  );
}

export async function listSupplierPayments(purchaseOrderId: string, executor: Exec = db) {
  return many(
    executor,
    `SELECT sp.id, sp.purchase_order_id, sp.amount_idr, sp.paid_at, sp.method,
            sp.reference, sp.proof_url, sp.notes, sp.created_by,
            u.display_name AS created_by_name, sp.created_at
       FROM supplier_payments sp
       LEFT JOIN users u ON u.id = sp.created_by
      WHERE sp.purchase_order_id = $1
      ORDER BY sp.paid_at DESC, sp.created_at DESC`,
    [purchaseOrderId],
  );
}

export async function updatePurchaseOrderPaidAmount(
  purchaseOrderId: string,
  paidAmountIdr: number,
  paymentStatus: string,
  executor: Exec,
) {
  return one(
    executor,
    `UPDATE purchase_orders
        SET paid_amount_idr = $2, payment_status = $3, updated_at = now()
      WHERE id = $1
      RETURNING id, number, total_idr, paid_amount_idr, payment_status`,
    [purchaseOrderId, paidAmountIdr, paymentStatus],
  );
}

export async function listPayables(
  filters: { q?: string; supplierId?: string },
  pagination: Paging,
  executor: Exec = db,
) {
  return many(
    executor,
    `SELECT po.id, po.number, po.status, po.payment_status, po.order_date, po.expected_date, po.due_date,
            po.total_idr, po.paid_amount_idr,
            GREATEST(po.total_idr - po.paid_amount_idr, 0) AS outstanding_idr,
            po.supplier_id, s.code AS supplier_code, s.name AS supplier_name,
            po.branch_id, b.name AS branch_name, po.created_at
       FROM purchase_orders po
       JOIN suppliers s ON s.id = po.supplier_id
       LEFT JOIN branches b ON b.id = po.branch_id
      WHERE po.status <> 'cancelled'
        AND po.total_idr > po.paid_amount_idr
        AND ($1::text IS NULL OR po.number ILIKE '%' || $1 || '%'
             OR s.name ILIKE '%' || $1 || '%' OR s.code ILIKE '%' || $1 || '%')
        AND ($2::uuid IS NULL OR po.supplier_id = $2)
      ORDER BY COALESCE(po.due_date, po.expected_date, po.order_date) ASC, po.created_at ASC
      ${paginationSql(pagination)}`,
    [filters.q ?? null, filters.supplierId ?? null],
  );
}

export async function countPayables(
  filters: { q?: string; supplierId?: string },
  executor: Exec = db,
) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int
       FROM purchase_orders po
       JOIN suppliers s ON s.id = po.supplier_id
      WHERE po.status <> 'cancelled'
        AND po.total_idr > po.paid_amount_idr
        AND ($1::text IS NULL OR po.number ILIKE '%' || $1 || '%'
             OR s.name ILIKE '%' || $1 || '%' OR s.code ILIKE '%' || $1 || '%')
        AND ($2::uuid IS NULL OR po.supplier_id = $2)`,
    [filters.q ?? null, filters.supplierId ?? null],
  );
  return Number(value ?? 0);
}

/** Total hutang yang belum dibayar (untuk ringkasan). */
export async function totalOutstandingPayable(executor: Exec = db) {
  const value = await scalar<number>(
    executor,
    `SELECT COALESCE(SUM(total_idr - paid_amount_idr), 0)::bigint
       FROM purchase_orders
      WHERE status <> 'cancelled' AND total_idr > paid_amount_idr`,
  );
  return Number(value ?? 0);
}

/** Harga beli terakhir disimpan pada master bahan saat penerimaan diposting. */
export async function updateIngredientLastPrice(
  ingredientId: string,
  unitPriceIdr: number,
  executor: Exec,
) {
  await executor.query(
    `UPDATE ingredients
        SET last_purchase_price_idr = $2, updated_at = now()
      WHERE id = $1`,
    [ingredientId, unitPriceIdr],
  );
}
