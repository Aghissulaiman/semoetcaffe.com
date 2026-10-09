import { db, many, one, scalar, type Exec } from './base.js';
import { paginationSql, type Paging } from '../utils/pagination.js';

const ORDER_COLUMNS = `
  o.id, o.order_number, o.user_id, o.branch_id, o.fulfillment_type, o.order_status,
  o.payment_status, o.currency, o.subtotal_idr, o.discount_idr, o.tax_idr,
  o.delivery_fee_idr, o.service_fee_idr, o.total_idr,
  o.promo_id, o.voucher_id, o.customer_notes, o.internal_notes,
  o.table_id, o.pickup_at, o.address_id,
  o.delivery_recipient_name, o.delivery_recipient_phone, o.delivery_address_snapshot,
  o.placed_at, o.accepted_at, o.completed_at, o.cancelled_at,
  o.created_at, o.updated_at
`;

export interface InsertOrderInput {
  orderNumber: string;
  userId: string;
  branchId: string;
  fulfillmentType: string;
  subtotalIdr: number;
  discountIdr: number;
  taxIdr: number;
  deliveryFeeIdr: number;
  serviceFeeIdr: number;
  totalIdr: number;
  promoId?: string | null;
  voucherId?: string | null;
  customerNotes?: string | null;
  tableId?: string | null;
  pickupAt?: Date | null;
  addressId?: string | null;
  deliveryRecipientName?: string | null;
  deliveryRecipientPhone?: string | null;
  deliveryAddressSnapshot?: Record<string, unknown> | null;
}

export async function insertOrder(input: InsertOrderInput, executor: Exec) {
  return one<{ id: string; orderNumber: string }>(
    executor,
    `INSERT INTO orders (
        order_number, user_id, branch_id, fulfillment_type, order_status, payment_status,
        subtotal_idr, discount_idr, tax_idr, delivery_fee_idr, service_fee_idr, total_idr,
        promo_id, voucher_id, customer_notes, table_id, pickup_at, address_id,
        delivery_recipient_name, delivery_recipient_phone, delivery_address_snapshot
     ) VALUES ($1,$2,$3,$4,'placed','unpaid',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     RETURNING id, order_number, created_at`,
    [
      input.orderNumber,
      input.userId,
      input.branchId,
      input.fulfillmentType,
      input.subtotalIdr,
      input.discountIdr,
      input.taxIdr,
      input.deliveryFeeIdr,
      input.serviceFeeIdr,
      input.totalIdr,
      input.promoId ?? null,
      input.voucherId ?? null,
      input.customerNotes ?? null,
      input.tableId ?? null,
      input.pickupAt ?? null,
      input.addressId ?? null,
      input.deliveryRecipientName ?? null,
      input.deliveryRecipientPhone ?? null,
      input.deliveryAddressSnapshot ? JSON.stringify(input.deliveryAddressSnapshot) : null,
    ],
  );
}

/** Idempotency: order_number unik, retry dengan kunci sama akan ketemu order lama. */
export async function findOrderByNumber(orderNumber: string, executor: Exec = db) {
  return one<{ id: string; userId: string; orderStatus: string }>(
    executor,
    `SELECT id, user_id, order_status, total_idr FROM orders WHERE order_number = $1`,
    [orderNumber],
  );
}

export async function orderNumberExists(orderNumber: string, executor: Exec = db): Promise<boolean> {
  const value = await scalar<boolean>(
    executor,
    `SELECT EXISTS (SELECT 1 FROM orders WHERE order_number = $1)`,
    [orderNumber],
  );
  return Boolean(value);
}

export async function findOrderById(orderId: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT ${ORDER_COLUMNS}, b.name AS branch_name, b.code AS branch_code
       FROM orders o
       JOIN branches b ON b.id = o.branch_id
      WHERE o.id = $1`,
    [orderId],
  );
}

/** Ownership diperiksa dalam query agar tidak ada risiko IDOR. */
export async function findOrderForUser(orderId: string, userId: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT ${ORDER_COLUMNS}, b.name AS branch_name, b.code AS branch_code
       FROM orders o
       JOIN branches b ON b.id = o.branch_id
      WHERE o.id = $1 AND o.user_id = $2`,
    [orderId, userId],
  );
}

export async function lockOrderForUser(orderId: string, userId: string, executor: Exec) {
  return one(
    executor,
    `SELECT ${ORDER_COLUMNS} FROM orders o WHERE o.id = $1 AND o.user_id = $2 FOR UPDATE`,
    [orderId, userId],
  );
}

export async function lockOrderById(orderId: string, executor: Exec) {
  return one(executor, `SELECT ${ORDER_COLUMNS} FROM orders o WHERE o.id = $1 FOR UPDATE`, [orderId]);
}

export interface ListOrderFilters {
  orderStatus?: string;
  paymentStatus?: string;
  branchId?: string;
  from?: string;
  to?: string;
  sort: string;
}

export async function listOrdersForUser(
  userId: string,
  filters: ListOrderFilters,
  pagination: Paging,
  executor: Exec = db,
) {
  return many(
    executor,
    `SELECT ${ORDER_COLUMNS},
            b.name AS branch_name, b.code AS branch_code,
            (SELECT COUNT(*)::int FROM order_items oi WHERE oi.order_id = o.id) AS item_count,
            (SELECT pi.public_url FROM order_items oi
               LEFT JOIN product_images pi ON pi.product_id = oi.product_id AND pi.is_primary
              WHERE oi.order_id = o.id ORDER BY oi.created_at ASC LIMIT 1) AS thumbnail_url,
            d.delivery_status
       FROM orders o
       JOIN branches b ON b.id = o.branch_id
       LEFT JOIN order_deliveries d ON d.order_id = o.id
      WHERE o.user_id = $1
        AND ($2::text IS NULL OR o.order_status = $2)
        AND ($3::text IS NULL OR o.payment_status = $3)
        AND ($4::uuid IS NULL OR o.branch_id = $4)
        AND ($5::timestamptz IS NULL OR o.placed_at >= $5::timestamptz)
        AND ($6::timestamptz IS NULL OR o.placed_at <= $6::timestamptz)
      ORDER BY
        ${filters.sort === 'oldest' ? 'o.placed_at ASC' : filters.sort === 'total_desc' ? 'o.total_idr DESC' : 'o.placed_at DESC'}
      ${paginationSql(pagination)}`,
    [userId, filters.orderStatus ?? null, filters.paymentStatus ?? null, filters.branchId ?? null, filters.from ?? null, filters.to ?? null],
  );
}

export async function countOrdersForUser(userId: string, filters: ListOrderFilters, executor: Exec = db) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int
       FROM orders o
      WHERE o.user_id = $1
        AND ($2::text IS NULL OR o.order_status = $2)
        AND ($3::text IS NULL OR o.payment_status = $3)
        AND ($4::uuid IS NULL OR o.branch_id = $4)
        AND ($5::timestamptz IS NULL OR o.placed_at >= $5::timestamptz)
        AND ($6::timestamptz IS NULL OR o.placed_at <= $6::timestamptz)`,
    [userId, filters.orderStatus ?? null, filters.paymentStatus ?? null, filters.branchId ?? null, filters.from ?? null, filters.to ?? null],
  );
  return Number(value ?? 0);
}

/** List order untuk staff/admin (branch-scoped). */
export async function listOrdersForBranch(
  filters: ListOrderFilters & { userId?: string },
  pagination: Paging,
  executor: Exec = db,
) {
  return many(
    executor,
    `SELECT ${ORDER_COLUMNS},
            b.name AS branch_name, u.display_name AS user_name, u.phone_e164 AS user_phone
       FROM orders o
       JOIN branches b ON b.id = o.branch_id
       JOIN users u ON u.id = o.user_id
      WHERE ($1::text IS NULL OR o.order_status = $1)
        AND ($2::text IS NULL OR o.payment_status = $2)
        AND ($3::uuid IS NULL OR o.branch_id = $3)
        AND ($4::uuid IS NULL OR o.user_id = $4)
      ORDER BY o.placed_at DESC
      ${paginationSql(pagination)}`,
    [filters.orderStatus ?? null, filters.paymentStatus ?? null, filters.branchId ?? null, filters.userId ?? null],
  );
}

export async function countOrdersForBranch(
  filters: ListOrderFilters & { userId?: string },
  executor: Exec = db,
) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int
       FROM orders o
      WHERE ($1::text IS NULL OR o.order_status = $1)
        AND ($2::text IS NULL OR o.payment_status = $2)
        AND ($3::uuid IS NULL OR o.branch_id = $3)
        AND ($4::uuid IS NULL OR o.user_id = $4)`,
    [filters.orderStatus ?? null, filters.paymentStatus ?? null, filters.branchId ?? null, filters.userId ?? null],
  );
  return Number(value ?? 0);
}

export async function updateOrderStatus(
  orderId: string,
  data: { orderStatus?: string; paymentStatus?: string; acceptedAt?: boolean; completedAt?: boolean; cancelledAt?: boolean; internalNotes?: string | null },
  executor: Exec,
) {
  const assignments: string[] = [];
  const values: unknown[] = [orderId];

  if (data.orderStatus) {
    values.push(data.orderStatus);
    assignments.push(`order_status = $${values.length}`);
  }
  if (data.paymentStatus) {
    values.push(data.paymentStatus);
    assignments.push(`payment_status = $${values.length}`);
  }
  if (data.acceptedAt) assignments.push('accepted_at = COALESCE(accepted_at, now())');
  if (data.completedAt) assignments.push('completed_at = COALESCE(completed_at, now())');
  if (data.cancelledAt) assignments.push('cancelled_at = COALESCE(cancelled_at, now())');
  if (data.internalNotes !== undefined) {
    values.push(data.internalNotes);
    assignments.push(`internal_notes = $${values.length}`);
  }

  if (assignments.length === 0) return;

  await executor.query(
    `UPDATE orders SET ${assignments.join(', ')}, updated_at = now() WHERE id = $1`,
    values,
  );
}

// --------------------------------------------------------------------------
// Order items (order_items + order_item_modifiers)
// --------------------------------------------------------------------------
export interface InsertOrderItemInput {
  orderId: string;
  productId: string | null;
  variantId: string | null;
  productNameSnapshot: string;
  variantNameSnapshot: string;
  skuSnapshot: string | null;
  quantity: number;
  unitPriceIdr: number;
  modifiersTotalIdr: number;
  lineTotalIdr: number;
  specialInstructions?: string | null;
}

export async function insertOrderItem(input: InsertOrderItemInput, executor: Exec) {
  return one<{ id: string }>(
    executor,
    `INSERT INTO order_items (
        order_id, product_id, variant_id, product_name_snapshot, variant_name_snapshot,
        sku_snapshot, quantity, unit_price_idr, modifiers_total_idr, line_total_idr,
        item_status, special_instructions
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',$11)
     RETURNING id`,
    [
      input.orderId,
      input.productId,
      input.variantId,
      input.productNameSnapshot,
      input.variantNameSnapshot,
      input.skuSnapshot,
      input.quantity,
      input.unitPriceIdr,
      input.modifiersTotalIdr,
      input.lineTotalIdr,
      input.specialInstructions ?? null,
    ],
  );
}

export async function insertOrderItemModifier(
  input: {
    orderItemId: string;
    groupName: string;
    optionName: string;
    unitPriceDeltaIdr: number;
    quantity: number;
    optionId: string | null;
  },
  executor: Exec,
) {
  await executor.query(
    `INSERT INTO order_item_modifiers (
        order_item_id, modifier_group_name_snapshot, modifier_option_name_snapshot,
        unit_price_delta_idr, quantity, option_id
     ) VALUES ($1,$2,$3,$4,$5,$6)`,
    [input.orderItemId, input.groupName, input.optionName, input.unitPriceDeltaIdr, input.quantity, input.optionId],
  );
}

export async function listOrderItems(orderId: string, executor: Exec = db) {
  return many(
    executor,
    `SELECT oi.id, oi.order_id, oi.product_id, oi.variant_id,
            oi.product_name_snapshot, oi.variant_name_snapshot, oi.sku_snapshot,
            oi.quantity, oi.unit_price_idr, oi.modifiers_total_idr, oi.line_total_idr,
            oi.item_status, oi.special_instructions, oi.created_at,
            pi.public_url AS image_url,
            mods.list AS modifiers
       FROM order_items oi
       LEFT JOIN LATERAL (
         SELECT public_url FROM product_images
          WHERE product_id = oi.product_id
          ORDER BY is_primary DESC, sort_order ASC LIMIT 1
       ) pi ON true
       LEFT JOIN LATERAL (
         SELECT jsonb_agg(jsonb_build_object(
                  'id', oim.id, 'groupName', oim.modifier_group_name_snapshot,
                  'optionName', oim.modifier_option_name_snapshot,
                  'priceDeltaIdr', oim.unit_price_delta_idr, 'quantity', oim.quantity
                ) ORDER BY oim.id ASC) AS list
           FROM order_item_modifiers oim
          WHERE oim.order_item_id = oi.id
       ) mods ON true
      WHERE oi.order_id = $1
      ORDER BY oi.created_at ASC`,
    [orderId],
  );
}

export async function findOrderItemForUser(orderItemId: string, userId: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT oi.id, oi.order_id, oi.product_id, oi.item_status,
            o.order_number, o.user_id, o.branch_id, o.order_status, o.payment_status,
            o.placed_at, o.completed_at
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
      WHERE oi.id = $1 AND o.user_id = $2`,
    [orderItemId, userId],
  );
}

export async function updateOrderItemStatus(
  orderItemIds: string[],
  status: string,
  executor: Exec,
) {
  if (orderItemIds.length === 0) return;
  await executor.query(
    `UPDATE order_items SET item_status = $2 WHERE id = ANY($1::uuid[])`,
    [orderItemIds, status],
  );
}

export async function cancelOrderItems(orderId: string, executor: Exec) {
  await executor.query(`UPDATE order_items SET item_status = 'cancelled' WHERE order_id = $1 AND item_status <> 'ready'`, [
    orderId,
  ]);
}

// --------------------------------------------------------------------------
// Status history (order_status_history)
// --------------------------------------------------------------------------
export async function insertStatusHistory(
  input: { orderId: string; fromStatus?: string | null; toStatus: string; changedBy?: string | null; note?: string | null },
  executor: Exec,
) {
  await executor.query(
    `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, note)
     VALUES ($1,$2,$3,$4,$5)`,
    [input.orderId, input.fromStatus ?? null, input.toStatus, input.changedBy ?? null, input.note ?? null],
  );
}

export async function listStatusHistory(orderId: string, executor: Exec = db) {
  return many(
    executor,
    `SELECT osh.id, osh.from_status, osh.to_status, osh.note, osh.occurred_at,
            u.display_name AS changed_by_name
       FROM order_status_history osh
       LEFT JOIN users u ON u.id = osh.changed_by
      WHERE osh.order_id = $1
      ORDER BY osh.occurred_at ASC`,
    [orderId],
  );
}

export async function findLatestStatus(orderId: string, executor: Exec = db) {
  return one<{ fromStatus: string | null; toStatus: string }>(
    executor,
    `SELECT from_status, to_status FROM order_status_history
      WHERE order_id = $1
      ORDER BY occurred_at DESC LIMIT 1`,
    [orderId],
  );
}

// --------------------------------------------------------------------------
// Ringkasan untuk dashboard
// --------------------------------------------------------------------------
export async function getOrderFinancials(orderId: string, executor: Exec = db) {
  return one<{
    subtotalIdr: number;
    discountIdr: number;
    taxIdr: number;
    deliveryFeeIdr: number;
    serviceFeeIdr: number;
    totalIdr: number;
    paymentStatus: string;
  }>(
    executor,
    `SELECT subtotal_idr, discount_idr, tax_idr, delivery_fee_idr, service_fee_idr, total_idr, payment_status
       FROM orders WHERE id = $1`,
    [orderId],
  );
}

export async function deleteOrder(orderId: string, executor: Exec) {
  await executor.query(`DELETE FROM orders WHERE id = $1`, [orderId]);
}