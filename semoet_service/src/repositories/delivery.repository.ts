import { db, many, one, scalar, type Exec } from './base.js';
import { paginationSql, type Paging } from '../utils/pagination.js';

const DELIVERY_COLUMNS = `
  od.id, od.order_id, od.provider, od.tracking_code, od.driver_name, od.driver_phone,
  od.delivery_status, od.estimated_delivery_at, od.delivered_at, od.created_at, od.updated_at
`;

export async function findDeliveryByOrder(orderId: string, executor: Exec = db) {
  return one(executor, `SELECT ${DELIVERY_COLUMNS} FROM order_deliveries od WHERE od.order_id = $1`, [
    orderId,
  ]);
}

export async function lockDeliveryByOrder(orderId: string, executor: Exec) {
  return one(executor, `SELECT ${DELIVERY_COLUMNS} FROM order_deliveries od WHERE od.order_id = $1 FOR UPDATE`, [
    orderId,
  ]);
}

/** Upsert aman: order_deliveries punya UNIQUE (order_id). */
export async function upsertDelivery(
  input: {
    orderId: string;
    provider?: string | null;
    trackingCode?: string | null;
    driverName?: string | null;
    driverPhone?: string | null;
    deliveryStatus: string;
    estimatedDeliveryAt?: Date | null;
  },
  executor: Exec,
) {
  return one<{ id: string; deliveryStatus: string }>(
    executor,
    `INSERT INTO order_deliveries (order_id, provider, tracking_code, driver_name, driver_phone, delivery_status, estimated_delivery_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (order_id) DO UPDATE
       SET provider = EXCLUDED.provider,
           tracking_code = EXCLUDED.tracking_code,
           driver_name = EXCLUDED.driver_name,
           driver_phone = EXCLUDED.driver_phone,
           delivery_status = EXCLUDED.delivery_status,
           estimated_delivery_at = EXCLUDED.estimated_delivery_at,
           updated_at = now()
     RETURNING id, order_id, delivery_status, updated_at`,
    [
      input.orderId,
      input.provider ?? null,
      input.trackingCode ?? null,
      input.driverName ?? null,
      input.driverPhone ?? null,
      input.deliveryStatus,
      input.estimatedDeliveryAt ?? null,
    ],
  );
}

export async function updateDeliveryStatus(
  orderId: string,
  deliveryStatus: string,
  executor: Exec = db,
) {
  return one(
    executor,
    `UPDATE order_deliveries
        SET delivery_status = $2,
            delivered_at = CASE WHEN $2 = 'delivered' THEN COALESCE(delivered_at, now()) ELSE delivered_at END,
            updated_at = now()
      WHERE order_id = $1
      RETURNING id, delivery_status, delivered_at`,
    [orderId, deliveryStatus],
  );
}

export async function listActiveDeliveries(branchId?: string, executor: Exec = db) {
  return many(
    executor,
    `SELECT ${DELIVERY_COLUMNS}, o.order_number, o.branch_id, o.delivery_recipient_name,
            o.delivery_recipient_phone, o.delivery_address_snapshot,
            u.display_name AS customer_name
       FROM order_deliveries od
       JOIN orders o ON o.id = od.order_id
       JOIN users u ON u.id = o.user_id
      WHERE od.delivery_status NOT IN ('delivered','failed','cancelled')
        AND ($1::uuid IS NULL OR o.branch_id = $1)
      ORDER BY od.created_at ASC`,
    [branchId ?? null],
  );
}

export async function insertTrackingLog(
  input: { deliveryId: string; latitude: number; longitude: number; recordedAt?: Date },
  executor: Exec = db,
) {
  return one<{ id: number }>(
    executor,
    `INSERT INTO delivery_tracking_logs (delivery_id, latitude, longitude, recorded_at)
     VALUES ($1,$2,$3,COALESCE($4, now()))
     RETURNING id, recorded_at`,
    [input.deliveryId, input.latitude, input.longitude, input.recordedAt ?? null],
  );
}

export async function listTrackingLogs(deliveryId: string, limit = 100, executor: Exec = db) {
  return many(
    executor,
    `SELECT id, delivery_id, latitude, longitude, recorded_at
       FROM delivery_tracking_logs
      WHERE delivery_id = $1
      ORDER BY recorded_at DESC
      LIMIT $2`,
    [deliveryId, limit],
  );
}

export async function latestTracking(deliveryId: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT id, latitude, longitude, recorded_at
       FROM delivery_tracking_logs
      WHERE delivery_id = $1
      ORDER BY recorded_at DESC
      LIMIT 1`,
    [deliveryId],
  );
}

export interface DeliveryFilters {
  deliveryStatus?: string;
  branchId?: string;
}

export async function listDeliveries(filters: DeliveryFilters, pagination: Paging, executor: Exec = db) {
  return many(
    executor,
    `SELECT ${DELIVERY_COLUMNS}, o.order_number, o.branch_id
       FROM order_deliveries od
       JOIN orders o ON o.id = od.order_id
      WHERE ($1::text IS NULL OR od.delivery_status = $1)
        AND ($2::uuid IS NULL OR o.branch_id = $2)
      ORDER BY od.created_at DESC
      ${paginationSql(pagination)}`,
    [filters.deliveryStatus ?? null, filters.branchId ?? null],
  );
}

/** Total data untuk listDeliveries, filter harus identik dengan listDeliveries. */
export async function countDeliveries(filters: DeliveryFilters, executor: Exec = db) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int
       FROM order_deliveries od
       JOIN orders o ON o.id = od.order_id
      WHERE ($1::text IS NULL OR od.delivery_status = $1)
        AND ($2::uuid IS NULL OR o.branch_id = $2)`,
    [filters.deliveryStatus ?? null, filters.branchId ?? null],
  );
  return Number(value ?? 0);
}