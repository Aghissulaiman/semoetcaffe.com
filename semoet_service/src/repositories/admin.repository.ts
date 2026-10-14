import { db, many, one, scalar, type Exec } from './base.js';
import { paginationSql, type Paging } from '../utils/pagination.js';
import { ACTIONS, RESOURCES } from '../config/constants.js';

// --------------------------------------------------------------------------
// Dashboard - memakai view daily_order_sales (tanpa duplicate totals)
// --------------------------------------------------------------------------
export async function dailySales(
  filters: { branchId?: string; from?: string; to?: string },
  pagination: Paging,
  executor: Exec = db,
) {
  return many(
    executor,
    `SELECT d.business_date,
            COALESCE(SUM(d.order_count), 0)::int AS order_count,
            COALESCE(SUM(d.paid_sales_idr), 0)::bigint AS paid_sales_idr
       FROM daily_order_sales d
      WHERE ($1::uuid IS NULL OR d.branch_id = $1)
        AND ($2::date IS NULL OR d.business_date >= $2::date)
        AND ($3::date IS NULL OR d.business_date <= $3::date)
      GROUP BY d.business_date
      ORDER BY d.business_date DESC
      ${paginationSql(pagination)}`,
    [filters.branchId ?? null, filters.from ?? null, filters.to ?? null],
  );
}

export async function countDailySales(filters: { branchId?: string; from?: string; to?: string }, executor: Exec = db) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(DISTINCT d.business_date)::int
       FROM daily_order_sales d
      WHERE ($1::uuid IS NULL OR d.branch_id = $1)
        AND ($2::date IS NULL OR d.business_date >= $2::date)
        AND ($3::date IS NULL OR d.business_date <= $3::date)`,
    [filters.branchId ?? null, filters.from ?? null, filters.to ?? null],
  );
  return Number(value ?? 0);
}

export async function salesSummary(filters: { branchId?: string; from?: string; to?: string }, executor: Exec = db) {
  return one<{
    totalOrders: number;
    totalPaidSalesIdr: number;
    avgOrderValueIdr: number;
    activeDays: number;
  }>(
    executor,
    `SELECT
        COALESCE(SUM(d.order_count), 0)::int AS total_orders,
        COALESCE(SUM(d.paid_sales_idr), 0)::bigint AS total_paid_sales_idr,
        CASE WHEN COALESCE(SUM(d.order_count), 0) = 0 THEN 0
             ELSE (COALESCE(SUM(d.paid_sales_idr), 0) / SUM(d.order_count))::bigint END AS avg_order_value_idr,
        COUNT(DISTINCT d.business_date)::int AS active_days
       FROM daily_order_sales d
      WHERE ($1::uuid IS NULL OR d.branch_id = $1)
        AND ($2::date IS NULL OR d.business_date >= $2::date)
        AND ($3::date IS NULL OR d.business_date <= $3::date)`,
    [filters.branchId ?? null, filters.from ?? null, filters.to ?? null],
  );
}

/** Order per status untuk doughnut chart dashboard. */
export async function ordersByStatus(filters: { branchId?: string; from?: string; to?: string }, executor: Exec = db) {
  return many<{ orderStatus: string; total: number }>(
    executor,
    `SELECT o.order_status, COUNT(*)::int AS total
       FROM orders o
      WHERE ($1::uuid IS NULL OR o.branch_id = $1)
        AND ($2::timestamptz IS NULL OR o.placed_at >= $2::timestamptz)
        AND ($3::timestamptz IS NULL OR o.placed_at <= $3::timestamptz)
      GROUP BY o.order_status
      ORDER BY total DESC`,
    [filters.branchId ?? null, filters.from ?? null, filters.to ?? null],
  );
}

/** Produk terlaris dari order_items (snapshot nama dipakai, bukan join products). */
export async function topProducts(
  filters: { branchId?: string; from?: string; to?: string; limit: number },
  executor: Exec = db,
) {
  return many(
    executor,
    `SELECT oi.product_id, oi.product_name_snapshot AS name,
            SUM(oi.quantity)::int AS total_quantity,
            SUM(oi.line_total_idr)::bigint AS total_revenue_idr
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
      WHERE o.order_status NOT IN ('cancelled','rejected')
        AND o.payment_status = 'paid'
        AND ($1::uuid IS NULL OR o.branch_id = $1)
        AND ($2::timestamptz IS NULL OR o.placed_at >= $2::timestamptz)
        AND ($3::timestamptz IS NULL OR o.placed_at <= $3::timestamptz)
      GROUP BY oi.product_id, oi.product_name_snapshot
      ORDER BY total_revenue_idr DESC
      LIMIT $4`,
    [filters.branchId ?? null, filters.from ?? null, filters.to ?? null, filters.limit],
  );
}

// --------------------------------------------------------------------------
// Laporan penjualan (akumulasi + rekap per produk)
// --------------------------------------------------------------------------
export interface ReportSalesFilters {
  branchId?: string;
  from?: string;
  to?: string;
}

export interface ReportProductFilters extends ReportSalesFilters {
  q?: string;
  sort: string;
}

/** Akumulasi nilai order (kotor, diskon, pajak, biaya, total) untuk order lunas. */
export async function reportSalesSummary(filters: ReportSalesFilters, executor: Exec = db) {
  return one<{
    grossSalesIdr: number;
    discountIdr: number;
    taxIdr: number;
    serviceFeeIdr: number;
    deliveryFeeIdr: number;
    totalBilledIdr: number;
    orderCount: number;
  }>(
    executor,
    `SELECT
        COALESCE(SUM(o.subtotal_idr), 0)::bigint AS gross_sales_idr,
        COALESCE(SUM(o.discount_idr), 0)::bigint AS discount_idr,
        COALESCE(SUM(o.tax_idr), 0)::bigint AS tax_idr,
        COALESCE(SUM(o.service_fee_idr), 0)::bigint AS service_fee_idr,
        COALESCE(SUM(o.delivery_fee_idr), 0)::bigint AS delivery_fee_idr,
        COALESCE(SUM(o.total_idr), 0)::bigint AS total_billed_idr,
        COUNT(*)::int AS order_count
       FROM orders o
      WHERE o.payment_status = 'paid'
        AND o.order_status NOT IN ('cancelled','rejected')
        AND ($1::uuid IS NULL OR o.branch_id = $1)
        AND ($2::date IS NULL OR (o.placed_at AT TIME ZONE 'Asia/Jakarta')::date >= $2::date)
        AND ($3::date IS NULL OR (o.placed_at AT TIME ZONE 'Asia/Jakarta')::date <= $3::date)`,
    [filters.branchId ?? null, filters.from ?? null, filters.to ?? null],
  );
}

/** Akumulasi item terjual + modal (HPP) dari resep harga varian. */
export async function reportItemSummary(filters: ReportSalesFilters, executor: Exec = db) {
  return one<{
    itemsSold: number;
    itemRevenueIdr: number;
    cogsIdr: number;
    productCount: number;
  }>(
    executor,
    `SELECT
        COALESCE(SUM(oi.quantity), 0)::int AS items_sold,
        COALESCE(SUM(oi.line_total_idr), 0)::bigint AS item_revenue_idr,
        COALESCE(SUM(oi.quantity * COALESCE(pv.cost_idr, 0)), 0)::bigint AS cogs_idr,
        COUNT(DISTINCT oi.product_id)::int AS product_count
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       LEFT JOIN product_variants pv ON pv.id = oi.variant_id
      WHERE o.payment_status = 'paid'
        AND o.order_status NOT IN ('cancelled','rejected')
        AND oi.item_status <> 'cancelled'
        AND ($1::uuid IS NULL OR o.branch_id = $1)
        AND ($2::date IS NULL OR (o.placed_at AT TIME ZONE 'Asia/Jakarta')::date >= $2::date)
        AND ($3::date IS NULL OR (o.placed_at AT TIME ZONE 'Asia/Jakarta')::date <= $3::date)`,
    [filters.branchId ?? null, filters.from ?? null, filters.to ?? null],
  );
}

const REPORT_PRODUCT_SORTS: Record<string, string> = {
  revenue_desc: 'revenue_idr DESC, product_name ASC',
  profit_desc: 'profit_idr DESC, product_name ASC',
  qty_desc: 'quantity DESC, product_name ASC',
  name_asc: 'product_name ASC',
};

/** Rekap penjualan per produk (mendukung pencarian nama produk). */
export async function reportProducts(
  filters: ReportProductFilters,
  pagination: Paging,
  executor: Exec = db,
) {
  const orderBy = REPORT_PRODUCT_SORTS[filters.sort] ?? REPORT_PRODUCT_SORTS.revenue_desc;
  return many(
    executor,
    `SELECT oi.product_id,
            oi.product_name_snapshot AS product_name,
            SUM(oi.quantity)::int AS quantity,
            SUM(oi.line_total_idr)::bigint AS revenue_idr,
            SUM(oi.quantity * COALESCE(pv.cost_idr, 0))::bigint AS cogs_idr,
            (SUM(oi.line_total_idr) - SUM(oi.quantity * COALESCE(pv.cost_idr, 0)))::bigint AS profit_idr,
            COUNT(DISTINCT oi.order_id)::int AS order_count
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       LEFT JOIN product_variants pv ON pv.id = oi.variant_id
      WHERE o.payment_status = 'paid'
        AND o.order_status NOT IN ('cancelled','rejected')
        AND oi.item_status <> 'cancelled'
        AND ($1::uuid IS NULL OR o.branch_id = $1)
        AND ($2::date IS NULL OR (o.placed_at AT TIME ZONE 'Asia/Jakarta')::date >= $2::date)
        AND ($3::date IS NULL OR (o.placed_at AT TIME ZONE 'Asia/Jakarta')::date <= $3::date)
        AND ($4::text IS NULL OR oi.product_name_snapshot ILIKE '%' || $4 || '%')
      GROUP BY oi.product_id, oi.product_name_snapshot
      ORDER BY ${orderBy}
      ${paginationSql(pagination)}`,
    [
      filters.branchId ?? null,
      filters.from ?? null,
      filters.to ?? null,
      filters.q ?? null,
    ],
  );
}

export async function countReportProducts(filters: ReportProductFilters, executor: Exec = db) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int FROM (
        SELECT oi.product_id, oi.product_name_snapshot
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
         WHERE o.payment_status = 'paid'
           AND o.order_status NOT IN ('cancelled','rejected')
           AND oi.item_status <> 'cancelled'
           AND ($1::uuid IS NULL OR o.branch_id = $1)
           AND ($2::date IS NULL OR (o.placed_at AT TIME ZONE 'Asia/Jakarta')::date >= $2::date)
           AND ($3::date IS NULL OR (o.placed_at AT TIME ZONE 'Asia/Jakarta')::date <= $3::date)
           AND ($4::text IS NULL OR oi.product_name_snapshot ILIKE '%' || $4 || '%')
         GROUP BY oi.product_id, oi.product_name_snapshot
     ) t`,
    [
      filters.branchId ?? null,
      filters.from ?? null,
      filters.to ?? null,
      filters.q ?? null,
    ],
  );
  return Number(value ?? 0);
}

// --------------------------------------------------------------------------
// Laporan lanjutan: deret harian, sebaran, dan rekap per kategori
// --------------------------------------------------------------------------
/** Deret harian: kotor, diskon, bersih, item terjual, modal (HPP), laba. */
export async function reportDailyFinancials(filters: ReportSalesFilters, executor: Exec = db) {
  return many(
    executor,
    `WITH paid_orders AS (
        SELECT o.id,
               (o.placed_at AT TIME ZONE 'Asia/Jakarta')::date AS business_date,
               o.subtotal_idr,
               o.discount_idr
          FROM orders o
         WHERE o.payment_status = 'paid'
           AND o.order_status NOT IN ('cancelled','rejected')
           AND ($1::uuid IS NULL OR o.branch_id = $1)
           AND ($2::date IS NULL OR (o.placed_at AT TIME ZONE 'Asia/Jakarta')::date >= $2::date)
           AND ($3::date IS NULL OR (o.placed_at AT TIME ZONE 'Asia/Jakarta')::date <= $3::date)
     ),
     order_fin AS (
        SELECT business_date,
               COUNT(*)::int AS order_count,
               COALESCE(SUM(subtotal_idr), 0)::bigint AS gross_idr,
               COALESCE(SUM(discount_idr), 0)::bigint AS discount_idr
          FROM paid_orders
         GROUP BY business_date
     ),
     item_fin AS (
        SELECT (o.placed_at AT TIME ZONE 'Asia/Jakarta')::date AS business_date,
               COALESCE(SUM(oi.quantity), 0)::int AS items_sold,
               COALESCE(SUM(oi.quantity * COALESCE(pv.cost_idr, 0)), 0)::bigint AS cogs_idr
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
          LEFT JOIN product_variants pv ON pv.id = oi.variant_id
         WHERE o.payment_status = 'paid'
           AND o.order_status NOT IN ('cancelled','rejected')
           AND oi.item_status <> 'cancelled'
           AND ($1::uuid IS NULL OR o.branch_id = $1)
           AND ($2::date IS NULL OR (o.placed_at AT TIME ZONE 'Asia/Jakarta')::date >= $2::date)
           AND ($3::date IS NULL OR (o.placed_at AT TIME ZONE 'Asia/Jakarta')::date <= $3::date)
         GROUP BY business_date
     )
     SELECT f.business_date,
            f.order_count,
            f.gross_idr,
            f.discount_idr,
            (f.gross_idr - f.discount_idr)::bigint AS net_idr,
            COALESCE(i.items_sold, 0)::int AS items_sold,
            COALESCE(i.cogs_idr, 0)::bigint AS cogs_idr,
            (f.gross_idr - f.discount_idr - COALESCE(i.cogs_idr, 0))::bigint AS profit_idr
       FROM order_fin f
       LEFT JOIN item_fin i ON i.business_date = f.business_date
      ORDER BY f.business_date`,
    [filters.branchId ?? null, filters.from ?? null, filters.to ?? null],
  );
}

/** Sebaran omzet berdasarkan metode pemenuhan (dine_in/pickup/delivery). */
export async function reportFulfillmentBreakdown(filters: ReportSalesFilters, executor: Exec = db) {
  return many(
    executor,
    `SELECT o.fulfillment_type AS key,
            COUNT(*)::int AS order_count,
            COALESCE(SUM(o.total_idr), 0)::bigint AS revenue_idr
       FROM orders o
      WHERE o.payment_status = 'paid'
        AND o.order_status NOT IN ('cancelled','rejected')
        AND ($1::uuid IS NULL OR o.branch_id = $1)
        AND ($2::date IS NULL OR (o.placed_at AT TIME ZONE 'Asia/Jakarta')::date >= $2::date)
        AND ($3::date IS NULL OR (o.placed_at AT TIME ZONE 'Asia/Jakarta')::date <= $3::date)
      GROUP BY o.fulfillment_type
      ORDER BY revenue_idr DESC`,
    [filters.branchId ?? null, filters.from ?? null, filters.to ?? null],
  );
}

/** Sebaran omzet berdasarkan metode pembayaran (metode sukses terakhir per order). */
export async function reportPaymentBreakdown(filters: ReportSalesFilters, executor: Exec = db) {
  return many(
    executor,
    `WITH paid AS (
        SELECT o.id,
               o.total_idr,
               (SELECT pt.payment_method
                  FROM payment_transactions pt
                 WHERE pt.order_id = o.id
                   AND pt.status = 'succeeded'
                   AND pt.transaction_type = 'charge'
                   AND pt.payment_purpose = 'order'
                 ORDER BY pt.paid_at DESC NULLS LAST, pt.created_at DESC
                 LIMIT 1) AS method
          FROM orders o
         WHERE o.payment_status = 'paid'
           AND o.order_status NOT IN ('cancelled','rejected')
           AND ($1::uuid IS NULL OR o.branch_id = $1)
           AND ($2::date IS NULL OR (o.placed_at AT TIME ZONE 'Asia/Jakarta')::date >= $2::date)
           AND ($3::date IS NULL OR (o.placed_at AT TIME ZONE 'Asia/Jakarta')::date <= $3::date)
     )
     SELECT COALESCE(method, 'lainnya') AS key,
            COUNT(*)::int AS order_count,
            COALESCE(SUM(total_idr), 0)::bigint AS revenue_idr
       FROM paid
      GROUP BY 1
      ORDER BY revenue_idr DESC`,
    [filters.branchId ?? null, filters.from ?? null, filters.to ?? null],
  );
}

/** Sebaran omzet per jam (0-23, zona Asia/Jakarta). */
export async function reportHourlyBreakdown(filters: ReportSalesFilters, executor: Exec = db) {
  return many(
    executor,
    `SELECT EXTRACT(HOUR FROM (o.placed_at AT TIME ZONE 'Asia/Jakarta'))::int AS key,
            COUNT(*)::int AS order_count,
            COALESCE(SUM(o.total_idr), 0)::bigint AS revenue_idr
       FROM orders o
      WHERE o.payment_status = 'paid'
        AND o.order_status NOT IN ('cancelled','rejected')
        AND ($1::uuid IS NULL OR o.branch_id = $1)
        AND ($2::date IS NULL OR (o.placed_at AT TIME ZONE 'Asia/Jakarta')::date >= $2::date)
        AND ($3::date IS NULL OR (o.placed_at AT TIME ZONE 'Asia/Jakarta')::date <= $3::date)
      GROUP BY 1
      ORDER BY 1`,
    [filters.branchId ?? null, filters.from ?? null, filters.to ?? null],
  );
}

/** Sebaran omzet per hari dalam seminggu (0=Minggu .. 6=Sabtu). */
export async function reportWeekdayBreakdown(filters: ReportSalesFilters, executor: Exec = db) {
  return many(
    executor,
    `SELECT EXTRACT(DOW FROM (o.placed_at AT TIME ZONE 'Asia/Jakarta'))::int AS key,
            COUNT(*)::int AS order_count,
            COALESCE(SUM(o.total_idr), 0)::bigint AS revenue_idr
       FROM orders o
      WHERE o.payment_status = 'paid'
        AND o.order_status NOT IN ('cancelled','rejected')
        AND ($1::uuid IS NULL OR o.branch_id = $1)
        AND ($2::date IS NULL OR (o.placed_at AT TIME ZONE 'Asia/Jakarta')::date >= $2::date)
        AND ($3::date IS NULL OR (o.placed_at AT TIME ZONE 'Asia/Jakarta')::date <= $3::date)
      GROUP BY 1
      ORDER BY 1`,
    [filters.branchId ?? null, filters.from ?? null, filters.to ?? null],
  );
}

/** Sebaran jumlah pesanan per status (semua pesanan, bukan hanya lunas). */
export async function reportStatusBreakdown(filters: ReportSalesFilters, executor: Exec = db) {
  return many(
    executor,
    `SELECT o.order_status AS key,
            COUNT(*)::int AS order_count
       FROM orders o
      WHERE ($1::uuid IS NULL OR o.branch_id = $1)
        AND ($2::date IS NULL OR (o.placed_at AT TIME ZONE 'Asia/Jakarta')::date >= $2::date)
        AND ($3::date IS NULL OR (o.placed_at AT TIME ZONE 'Asia/Jakarta')::date <= $3::date)
      GROUP BY 1
      ORDER BY order_count DESC`,
    [filters.branchId ?? null, filters.from ?? null, filters.to ?? null],
  );
}

/** Rekap penjualan per kategori produk beserta modal & laba. */
export async function reportCategoryBreakdown(filters: ReportSalesFilters, executor: Exec = db) {
  return many(
    executor,
    `SELECT COALESCE(pc.id::text, '') AS category_id,
            COALESCE(pc.name, 'Tanpa Kategori') AS category_name,
            COALESCE(SUM(oi.quantity), 0)::int AS quantity,
            COUNT(DISTINCT oi.order_id)::int AS order_count,
            COALESCE(SUM(oi.line_total_idr), 0)::bigint AS revenue_idr,
            COALESCE(SUM(oi.quantity * COALESCE(pv.cost_idr, 0)), 0)::bigint AS cogs_idr
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       LEFT JOIN products p ON p.id = oi.product_id
       LEFT JOIN product_categories pc ON pc.id = p.category_id
       LEFT JOIN product_variants pv ON pv.id = oi.variant_id
      WHERE o.payment_status = 'paid'
        AND o.order_status NOT IN ('cancelled','rejected')
        AND oi.item_status <> 'cancelled'
        AND ($1::uuid IS NULL OR o.branch_id = $1)
        AND ($2::date IS NULL OR (o.placed_at AT TIME ZONE 'Asia/Jakarta')::date >= $2::date)
        AND ($3::date IS NULL OR (o.placed_at AT TIME ZONE 'Asia/Jakarta')::date <= $3::date)
      GROUP BY pc.id, pc.name
      ORDER BY revenue_idr DESC`,
    [filters.branchId ?? null, filters.from ?? null, filters.to ?? null],
  );
}

/** Ringkasan operasional untuk kartu dashboard. */
export async function operationalSnapshot(executor: Exec = db) {
  return one<{
    activeOrders: number;
    pendingOrders: number;
    todayOrders: number;
    todayRevenueIdr: number;
    activeReservations: number;
    pendingEventBookings: number;
    newUsersToday: number;
  }>(
    executor,
    `SELECT
      (SELECT COUNT(*)::int FROM orders
        WHERE order_status IN ('placed','accepted','preparing','ready')) AS active_orders,
      (SELECT COUNT(*)::int FROM orders WHERE order_status = 'placed') AS pending_orders,
      (SELECT COUNT(*)::int FROM orders
        WHERE (placed_at AT TIME ZONE 'Asia/Jakarta')::date = (now() AT TIME ZONE 'Asia/Jakarta')::date) AS today_orders,
      (SELECT COALESCE(SUM(total_idr), 0)::bigint FROM orders
        WHERE payment_status = 'paid'
          AND (placed_at AT TIME ZONE 'Asia/Jakarta')::date = (now() AT TIME ZONE 'Asia/Jakarta')::date) AS today_revenue_idr,
      (SELECT COUNT(*)::int FROM reservations
        WHERE status IN ('requested','confirmed','seated')
          AND reserved_for >= now()) AS active_reservations,
      (SELECT COUNT(*)::int FROM event_bookings WHERE status IN ('requested','quoted','awaiting_deposit')) AS pending_event_bookings,
      (SELECT COUNT(*)::int FROM users
        WHERE (created_at AT TIME ZONE 'Asia/Jakarta')::date = (now() AT TIME ZONE 'Asia/Jakarta')::date
          AND deleted_at IS NULL) AS new_users_today`,
  );
}

// --------------------------------------------------------------------------
// Audit logs
// --------------------------------------------------------------------------
export async function listAuditLogs(
  filters: {
    actorUserId?: string;
    action?: string;
    entityType?: string;
    entityId?: string;
    requestId?: string;
    from?: string;
    to?: string;
  },
  pagination: Paging,
  executor: Exec = db,
) {
  return many(
    executor,
    `SELECT al.id, al.actor_user_id, al.action, al.entity_type, al.entity_id,
              al.old_data, al.new_data, al.request_id, al.ip_address, al.created_at,
              u.display_name AS actor_name
         FROM audit_logs al
         LEFT JOIN users u ON u.id = al.actor_user_id
        WHERE ($1::uuid IS NULL OR al.actor_user_id = $1)
          AND ($2::text IS NULL OR al.action = $2)
          AND ($3::text IS NULL OR al.entity_type = $3)
          AND ($4::uuid IS NULL OR al.entity_id = $4)
          AND ($5::text IS NULL OR al.request_id = $5)
          AND ($6::timestamptz IS NULL OR al.created_at >= $6::timestamptz)
          AND ($7::timestamptz IS NULL OR al.created_at <= $7::timestamptz)
        ORDER BY al.created_at DESC, al.id DESC
        ${paginationSql(pagination)}`,
    [
      filters.actorUserId ?? null,
      filters.action ?? null,
      filters.entityType ?? null,
      filters.entityId ?? null,
      filters.requestId ?? null,
      filters.from ?? null,
      filters.to ?? null,
    ],
  );
}

export async function countAuditLogs(
  filters: {
    actorUserId?: string;
    action?: string;
    entityType?: string;
    entityId?: string;
    requestId?: string;
    from?: string;
    to?: string;
  },
  executor: Exec = db,
) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int
       FROM audit_logs al
      WHERE ($1::uuid IS NULL OR al.actor_user_id = $1)
        AND ($2::text IS NULL OR al.action = $2)
        AND ($3::text IS NULL OR al.entity_type = $3)
        AND ($4::uuid IS NULL OR al.entity_id = $4)
        AND ($5::text IS NULL OR al.request_id = $5)
        AND ($6::timestamptz IS NULL OR al.created_at >= $6::timestamptz)
        AND ($7::timestamptz IS NULL OR al.created_at <= $7::timestamptz)`,
    [
      filters.actorUserId ?? null,
      filters.action ?? null,
      filters.entityType ?? null,
      filters.entityId ?? null,
      filters.requestId ?? null,
      filters.from ?? null,
      filters.to ?? null,
    ],
  );
  return Number(value ?? 0);
}

export async function insertAuditLog(
  entry: {
    actorUserId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    oldData?: unknown;
    newData?: unknown;
    requestId?: string | null;
    ipAddress?: string | null;
  },
  executor: Exec = db,
) {
  await executor.query(
    `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, old_data, new_data, request_id, ip_address)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      entry.actorUserId ?? null,
      entry.action,
      entry.entityType,
      entry.entityId ?? null,
      entry.oldData ? JSON.stringify(entry.oldData) : null,
      entry.newData ? JSON.stringify(entry.newData) : null,
      entry.requestId ?? null,
      entry.ipAddress ?? null,
    ],
  );
}

// --------------------------------------------------------------------------
// Roles & permissions
// --------------------------------------------------------------------------
export async function listRoles(pagination: Paging, code?: string, executor: Exec = db) {
  return many(
    executor,
    `SELECT r.id, r.code, r.name, r.description, r.created_at,
            (SELECT COUNT(*)::int FROM role_permissions rp WHERE rp.role_id = r.id) AS permission_count,
            (SELECT COUNT(*)::int FROM user_roles ur WHERE ur.role_id = r.id) AS user_count
       FROM roles r
      WHERE ($1::text IS NULL OR r.code = $1)
      ORDER BY r.code
      ${paginationSql(pagination)}`,
    [code ?? null],
  );
}

export async function countRoles(code?: string, executor: Exec = db) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int FROM roles WHERE ($1::text IS NULL OR code = $1)`,
    [code ?? null],
  );
  return Number(value ?? 0);
}

export async function findRoleById(roleId: string, executor: Exec = db) {
  return one(executor, `SELECT id, code, name, description, created_at FROM roles WHERE id = $1`, [roleId]);
}

export async function findRoleByCode(code: string, executor: Exec = db) {
  return one(executor, `SELECT id, code, name, description, created_at FROM roles WHERE code = $1`, [code]);
}

export async function insertRole(
  input: { code: string; name: string; description?: string | null },
  executor: Exec = db,
) {
  return one(
    executor,
    `INSERT INTO roles (code, name, description) VALUES ($1,$2,$3) RETURNING id, code, name, description, created_at`,
    [input.code, input.name, input.description ?? null],
  );
}

export async function updateRole(
  roleId: string,
  data: Record<string, unknown>,
  executor: Exec = db,
) {
  const columns = Object.keys(data);
  if (columns.length === 0) return null;
  const assignments = columns.map((column, index) => `${column} = $${index + 2}`).join(', ');
  return one(
    executor,
    `UPDATE roles SET ${assignments} WHERE id = $1 RETURNING id, code, name, description`,
    [roleId, ...Object.values(data)],
  );
}

export async function listPermissions(filters: { resource?: string; action?: string }, executor: Exec = db) {
  return many(
    executor,
    `SELECT p.id, p.resource, p.action,
            (SELECT COUNT(*)::int FROM role_permissions rp WHERE rp.permission_id = p.id) AS role_count
       FROM permissions p
      WHERE ($1::text IS NULL OR p.resource = $1)
        AND ($2::text IS NULL OR p.action = $2)
      ORDER BY p.resource, p.action`,
    [filters.resource ?? null, filters.action ?? null],
  );
}

export async function upsertPermission(
  resource: string,
  action: string,
  executor: Exec = db,
) {
  return one<{ id: string }>(
    executor,
    `INSERT INTO permissions (resource, action) VALUES ($1,$2)
     ON CONFLICT (resource, action) DO UPDATE SET action = EXCLUDED.action
     RETURNING id`,
    [resource, action],
  );
}

export async function listRolePermissions(roleId: string, executor: Exec = db) {
  return many(
    executor,
    `SELECT p.resource, p.action
       FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
      WHERE rp.role_id = $1
      ORDER BY p.resource, p.action`,
    [roleId],
  );
}

/** Ganti seluruh permission sebuah role (idempotent, aman dalam transaksi). */
export async function replaceRolePermissions(roleId: string, permissionIds: string[], executor: Exec) {
  await executor.query(`DELETE FROM role_permissions WHERE role_id = $1`, [roleId]);
  if (permissionIds.length === 0) return;
  await executor.query(
    `INSERT INTO role_permissions (role_id, permission_id)
     SELECT $1, unnest($2::uuid[])
     ON CONFLICT DO NOTHING`,
    [roleId, permissionIds],
  );
}

export async function assignUserRoles(
  userId: string,
  roleIds: string[],
  assignedBy: string,
  replace: boolean,
  executor: Exec,
) {
  if (replace) {
    await executor.query(`DELETE FROM user_roles WHERE user_id = $1`, [userId]);
  }
  await executor.query(
    `INSERT INTO user_roles (user_id, role_id, assigned_by)
     SELECT $1, unnest($2::uuid[]), $3
     ON CONFLICT DO NOTHING`,
    [userId, roleIds, assignedBy],
  );
}

export async function removeUserRole(userId: string, roleId: string, executor: Exec = db) {
  const row = await one<{ roleId: string }>(
    executor,
    `DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2 RETURNING role_id`,
    [userId, roleId],
  );
  return Boolean(row);
}

export async function findUserById(userId: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT id, email, phone_e164, display_name, status, deleted_at, created_at FROM users WHERE id = $1`,
    [userId],
  );
}

export interface ListAdminUserFilters {
  status?: string;
  roleCode?: string;
  q?: string;
}

export async function listUsers(filters: ListAdminUserFilters, pagination: Paging, executor: Exec = db) {
  return many(
    executor,
    `SELECT u.id, u.email, u.phone_e164, u.display_name, u.status,
              u.email_verified_at, u.phone_verified_at, u.last_login_at, u.created_at,
              COALESCE(roles.role_codes, ARRAY[]::text[]) AS role_codes,
              (SELECT COUNT(*)::int FROM orders o WHERE o.user_id = u.id) AS order_count,
              (SELECT COALESCE(SUM(o.total_idr), 0)::bigint FROM orders o
                WHERE o.user_id = u.id AND o.payment_status = 'paid') AS lifetime_value_idr
         FROM users u
         LEFT JOIN LATERAL (
           SELECT array_agg(r.code ORDER BY r.code) AS role_codes
             FROM user_roles ur
             JOIN roles r ON r.id = ur.role_id
            WHERE ur.user_id = u.id
         ) roles ON true
        WHERE ($1::text IS NULL OR u.status = $1)
          AND ($2::text IS NULL OR EXISTS (
                SELECT 1 FROM user_roles ur2 JOIN roles r2 ON r2.id = ur2.role_id
                 WHERE ur2.user_id = u.id AND r2.code = $2))
          AND ($3::text IS NULL OR u.display_name ILIKE '%' || $3 || '%'
                                 OR u.email ILIKE '%' || $3 || '%'
                                 OR u.phone_e164 ILIKE '%' || $3 || '%')
          AND u.deleted_at IS NULL
        ORDER BY u.created_at DESC
        ${paginationSql(pagination)}`,
    [filters.status ?? null, filters.roleCode ?? null, filters.q ?? null],
  );
}

export async function countUsers(filters: ListAdminUserFilters, executor: Exec = db) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int
       FROM users u
      WHERE ($1::text IS NULL OR u.status = $1)
        AND ($2::text IS NULL OR EXISTS (
              SELECT 1 FROM user_roles ur2 JOIN roles r2 ON r2.id = ur2.role_id
               WHERE ur2.user_id = u.id AND r2.code = $2))
        AND ($3::text IS NULL OR u.display_name ILIKE '%' || $3 || '%'
                               OR u.email ILIKE '%' || $3 || '%'
                               OR u.phone_e164 ILIKE '%' || $3 || '%')
        AND u.deleted_at IS NULL`,
    [filters.status ?? null, filters.roleCode ?? null, filters.q ?? null],
  );
  return Number(value ?? 0);
}

export async function updateUserStatus(
  userId: string,
  status: string,
  executor: Exec = db,
) {
  const deletedAt = status === 'deleted' ? new Date() : null;
  return one(
    executor,
    `UPDATE users
        SET status = $2,
            deleted_at = CASE WHEN $2 = 'deleted' THEN now() ELSE NULL END,
            updated_at = now()
      WHERE id = $1
      RETURNING id, status, deleted_at`,
    [userId, status, deletedAt],
  );
}

/** Semua kombinasi resource: action untuk seeding permission. */
export const FULL_PERMISSION_MATRIX = Object.values(RESOURCES).flatMap((resource) =>
  Object.values(ACTIONS).map((action) => `${resource}:${action}`),
);