import { db, many, one, scalar, type Exec } from './base.js';
import { paginationSql, type Paging } from '../utils/pagination.js';

const PROMO_COLUMNS = `
  id, code, name, description, discount_type, discount_value,
  minimum_order_idr, maximum_discount_idr, starts_at, ends_at,
  global_quota, per_user_quota, rules, is_active, created_at
`;

export interface ListPromoFilters {
  isActive?: boolean;
  discountType?: string;
  currentlyValid: boolean;
  q?: string;
  /** true = hanya promo berkode voucher, false = hanya diskon menu otomatis. */
  hasCode?: boolean;
}

export async function listPromos(filters: ListPromoFilters, pagination: Paging, executor: Exec = db) {
  return many(
    executor,
    `SELECT ${PROMO_COLUMNS},
            used.total_redeemed
       FROM promo_campaigns pc
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS total_redeemed
           FROM orders_promo_redemptions opr
          WHERE opr.promo_id = pc.id
       ) used ON true
      WHERE ($1::boolean IS NULL OR pc.is_active = $1)
        AND ($2::text IS NULL OR pc.discount_type = $2)
        AND ($4::boolean = false OR (pc.starts_at <= now() AND pc.ends_at >= now()))
        AND ($3::text IS NULL OR pc.name ILIKE '%' || $3 || '%' OR pc.code ILIKE '%' || $3 || '%')
        AND ($5::boolean IS NULL OR (($5::boolean = true AND pc.code IS NOT NULL) OR ($5::boolean = false AND pc.code IS NULL)))
      ORDER BY pc.is_active DESC, pc.ends_at DESC
      ${paginationSql(pagination)}`,
    [
      filters.isActive ?? null,
      filters.discountType ?? null,
      filters.q ?? null,
      filters.currentlyValid,
      filters.hasCode ?? null,
    ],
  );
}

export async function countPromos(filters: ListPromoFilters, executor: Exec = db) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int
       FROM promo_campaigns pc
      WHERE ($1::boolean IS NULL OR pc.is_active = $1)
        AND ($2::text IS NULL OR pc.discount_type = $2)
        AND ($4::boolean = false OR (pc.starts_at <= now() AND pc.ends_at >= now()))
        AND ($3::text IS NULL OR pc.name ILIKE '%' || $3 || '%' OR pc.code ILIKE '%' || $3 || '%')
        AND ($5::boolean IS NULL OR (($5::boolean = true AND pc.code IS NOT NULL) OR ($5::boolean = false AND pc.code IS NULL)))`,
    [
      filters.isActive ?? null,
      filters.discountType ?? null,
      filters.q ?? null,
      filters.currentlyValid,
      filters.hasCode ?? null,
    ],
  );
  return Number(value ?? 0);
}

export async function findPromoById(promoId: string, executor: Exec = db) {
  return one(executor, `SELECT ${PROMO_COLUMNS} FROM promo_campaigns WHERE id = $1`, [promoId]);
}

export async function findPromoByCode(code: string, executor: Exec = db) {
  return one(executor, `SELECT ${PROMO_COLUMNS} FROM promo_campaigns WHERE code = $1`, [code]);
}

/** Lock baris promo supaya kuota tidak bentrok saat dipakai bersamaan. */
export async function lockPromoById(promoId: string, executor: Exec) {
  return one(
    executor,
    `SELECT ${PROMO_COLUMNS} FROM promo_campaigns WHERE id = $1 FOR UPDATE`,
    [promoId],
  );
}

export async function lockPromoByCode(code: string, executor: Exec) {
  return one(
    executor,
    `SELECT ${PROMO_COLUMNS} FROM promo_campaigns WHERE code = $1 FOR UPDATE`,
    [code],
  );
}

// --------------------------------------------------------------------------
// Admin CRUD (promo voucher & diskon menu otomatis)
// --------------------------------------------------------------------------
export interface PromoWriteInput {
  code: string | null;
  name: string;
  description: string | null;
  discountType: string;
  discountValue: number;
  minimumOrderIdr: number;
  maximumDiscountIdr: number | null;
  startsAt: Date;
  endsAt: Date;
  globalQuota: number | null;
  perUserQuota: number | null;
  rules: Record<string, unknown>;
  isActive: boolean;
}

export async function insertPromo(input: PromoWriteInput, executor: Exec) {
  return one(
    executor,
    `INSERT INTO promo_campaigns (
       code, name, description, discount_type, discount_value,
       minimum_order_idr, maximum_discount_idr, starts_at, ends_at,
       global_quota, per_user_quota, rules, is_active
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)
     RETURNING ${PROMO_COLUMNS}, 0::int AS total_redeemed`,
    [
      input.code,
      input.name,
      input.description,
      input.discountType,
      input.discountValue,
      input.minimumOrderIdr,
      input.maximumDiscountIdr,
      input.startsAt,
      input.endsAt,
      input.globalQuota,
      input.perUserQuota,
      JSON.stringify(input.rules),
      input.isActive,
    ],
  );
}

export async function updatePromo(promoId: string, input: PromoWriteInput, executor: Exec) {
  return one(
    executor,
    `UPDATE promo_campaigns
        SET code = $2, name = $3, description = $4, discount_type = $5,
            discount_value = $6, minimum_order_idr = $7, maximum_discount_idr = $8,
            starts_at = $9, ends_at = $10, global_quota = $11, per_user_quota = $12,
            rules = $13::jsonb, is_active = $14
      WHERE id = $1
      RETURNING ${PROMO_COLUMNS},
                (SELECT COUNT(*)::int FROM orders_promo_redemptions opr WHERE opr.promo_id = $1) AS total_redeemed`,
    [
      promoId,
      input.code,
      input.name,
      input.description,
      input.discountType,
      input.discountValue,
      input.minimumOrderIdr,
      input.maximumDiscountIdr,
      input.startsAt,
      input.endsAt,
      input.globalQuota,
      input.perUserQuota,
      JSON.stringify(input.rules),
      input.isActive,
    ],
  );
}

export async function deletePromo(promoId: string, executor: Exec) {
  return one(executor, `DELETE FROM promo_campaigns WHERE id = $1 RETURNING id`, [promoId]);
}

export async function countPromoVouchers(promoId: string, executor: Exec = db) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int FROM user_vouchers WHERE promo_id = $1`,
    [promoId],
  );
  return Number(value ?? 0);
}

export async function replaceEligibility(
  promoId: string,
  input: { productIds: string[]; categoryIds: string[] },
  executor: Exec,
) {
  await executor.query(`DELETE FROM promo_product_eligibility WHERE promo_id = $1`, [promoId]);

  if (input.productIds.length > 0) {
    await executor.query(
      `INSERT INTO promo_product_eligibility (promo_id, product_id)
       SELECT $1, unnest($2::uuid[])`,
      [promoId, input.productIds],
    );
  }
  if (input.categoryIds.length > 0) {
    await executor.query(
      `INSERT INTO promo_product_eligibility (promo_id, category_id)
       SELECT $1, unnest($2::uuid[])`,
      [promoId, input.categoryIds],
    );
  }
}

/** Promo diskon menu yang aktif dan sedang berjalan (tanpa kode voucher). */
export async function listActiveAutoPromos(executor: Exec = db) {
  return many(
    executor,
    `SELECT ${PROMO_COLUMNS},
            used.total_redeemed
       FROM promo_campaigns pc
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS total_redeemed
           FROM orders_promo_redemptions opr
          WHERE opr.promo_id = pc.id
       ) used ON true
      WHERE pc.code IS NULL
        AND pc.is_active = true
        AND pc.starts_at <= now()
        AND pc.ends_at >= now()
      ORDER BY pc.created_at DESC`,
  );
}

/** Cek promo diskon menu lain yang periodenya tumpang tindih. */
export async function findOverlappingAutoPromo(
  excludeId: string | null,
  startsAt: Date,
  endsAt: Date,
  executor: Exec = db,
) {
  return one(
    executor,
    `SELECT id, name FROM promo_campaigns
      WHERE code IS NULL
        AND is_active = true
        AND ($1::uuid IS NULL OR id <> $1)
        AND starts_at < $3
        AND ends_at > $2
      LIMIT 1`,
    [excludeId, startsAt, endsAt],
  );
}

/** Semua baris eligibility untuk beberapa promo sekaligus (hindari N+1). */
export async function listEligibilityForPromos(promoIds: string[], executor: Exec = db) {
  if (promoIds.length === 0) return [];
  return many(
    executor,
    `SELECT promo_id, product_id, category_id
       FROM promo_product_eligibility
      WHERE promo_id = ANY($1::uuid[])`,
    [promoIds],
  );
}

/**
 * Produk dari keranjang yang benar-benar tercakup eligibility promo.
 * Promo tanpa eligibility dianggap berlaku untuk semua produk.
 */
export async function eligibleProductIdsForPromo(
  promoId: string,
  productIds: string[],
  executor: Exec = db,
) {
  if (productIds.length === 0) return [] as string[];

  const rows = await many(
    executor,
    `SELECT DISTINCT p.id
       FROM products p
      WHERE p.id = ANY($2::uuid[])
        AND (
          NOT EXISTS (SELECT 1 FROM promo_product_eligibility ppe WHERE ppe.promo_id = $1)
          OR EXISTS (
            SELECT 1 FROM promo_product_eligibility ppe
             WHERE ppe.promo_id = $1
               AND (ppe.product_id = p.id OR ppe.category_id = p.category_id)
          )
        )`,
    [promoId, productIds],
  );

  return rows.map((row) => String(row.id));
}

// --------------------------------------------------------------------------
// Eligibility (promo_product_eligibility)
// --------------------------------------------------------------------------
export async function listEligibility(promoId: string, executor: Exec = db) {
  return many(
    executor,
    `SELECT ppe.id, ppe.product_id, ppe.category_id,
            p.name AS product_name, p.slug AS product_slug,
            c.name AS category_name, c.slug AS category_slug
       FROM promo_product_eligibility ppe
       LEFT JOIN products p ON p.id = ppe.product_id
       LEFT JOIN product_categories c ON c.id = ppe.category_id
      WHERE ppe.promo_id = $1`,
    [promoId],
  );
}

export async function isProductEligible(promoId: string, productIds: string[], executor: Exec = db) {
  if (productIds.length === 0) return true;
  const value = await scalar<boolean>(
    executor,
    `SELECT EXISTS (
       SELECT 1
         FROM promo_campaigns pc
        WHERE pc.id = $1
          AND (
            NOT EXISTS (SELECT 1 FROM promo_product_eligibility ppe WHERE ppe.promo_id = pc.id)
            OR EXISTS (
              SELECT 1 FROM promo_product_eligibility ppe
               WHERE ppe.promo_id = pc.id
                 AND (ppe.product_id = ANY($2::uuid[]) OR ppe.category_id IN (
                       SELECT category_id FROM products WHERE id = ANY($2::uuid[])
                     ))
            )
          )
     )`,
    [promoId, productIds],
  );
  return Boolean(value);
}

// --------------------------------------------------------------------------
// Vouchers (user_vouchers)
// --------------------------------------------------------------------------
export async function listUserVouchers(
  userId: string,
  pagination: Paging,
  status?: string,
  executor: Exec = db,
) {
  return many(
    executor,
    `SELECT uv.id, uv.promo_id, uv.code, uv.status, uv.issued_at, uv.expires_at, uv.used_at,
            pc.name AS promo_name, pc.description AS promo_description,
            pc.discount_type, pc.discount_value, pc.minimum_order_idr, pc.maximum_discount_idr,
            pc.starts_at AS promo_starts_at, pc.ends_at AS promo_ends_at, pc.rules
       FROM user_vouchers uv
       JOIN promo_campaigns pc ON pc.id = uv.promo_id
      WHERE uv.user_id = $1
        AND ($2::text IS NULL OR uv.status = $2)
      ORDER BY
        CASE uv.status WHEN 'available' THEN 0 WHEN 'reserved' THEN 1 ELSE 2 END,
        uv.expires_at ASC NULLS LAST
      ${paginationSql(pagination)}`,
    [userId, status ?? null],
  );
}

export async function countUserVouchers(userId: string, status?: string, executor: Exec = db) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int FROM user_vouchers WHERE user_id = $1 AND ($2::text IS NULL OR status = $2)`,
    [userId, status ?? null],
  );
  return Number(value ?? 0);
}

export async function findUserVoucher(voucherId: string, userId: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT uv.id, uv.promo_id, uv.code, uv.status, uv.issued_at, uv.expires_at, uv.used_at,
            pc.name AS promo_name, pc.description AS promo_description,
            pc.discount_type, pc.discount_value, pc.minimum_order_idr, pc.maximum_discount_idr,
            pc.starts_at AS promo_starts_at, pc.ends_at AS promo_ends_at, pc.rules
       FROM user_vouchers uv
       JOIN promo_campaigns pc ON pc.id = uv.promo_id
      WHERE uv.id = $1 AND uv.user_id = $2`,
    [voucherId, userId],
  );
}

export async function findUserVoucherByCode(code: string, userId: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT uv.id, uv.promo_id, uv.code, uv.status, uv.issued_at, uv.expires_at, uv.used_at
       FROM user_vouchers uv
      WHERE uv.code = $1 AND uv.user_id = $2`,
    [code, userId],
  );
}

/** Lock voucher untuk dipakai di dalam transaksi pembuatan order. */
export async function lockUserVoucher(voucherId: string, userId: string, executor: Exec) {
  return one(
    executor,
    `SELECT uv.id, uv.promo_id, uv.code, uv.status, uv.expires_at, uv.used_at,
            pc.discount_type, pc.discount_value, pc.minimum_order_idr,
            pc.maximum_discount_idr, pc.starts_at, pc.ends_at, pc.is_active AS promo_is_active, pc.rules
       FROM user_vouchers uv
       JOIN promo_campaigns pc ON pc.id = uv.promo_id
      WHERE uv.id = $1 AND uv.user_id = $2
      FOR UPDATE OF uv`,
    [voucherId, userId],
  );
}

export async function countUserVoucherRedemptions(promoId: string, userId: string, executor: Exec) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int FROM orders_promo_redemptions WHERE promo_id = $1 AND user_id = $2`,
    [promoId, userId],
  );
  return Number(value ?? 0);
}

export async function countPromoRedemptions(promoId: string, executor: Exec) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int FROM orders_promo_redemptions WHERE promo_id = $1`,
    [promoId],
  );
  return Number(value ?? 0);
}

export async function insertUserVoucher(
  input: {
    userId: string;
    promoId: string;
    code?: string | null;
    expiresAt?: Date | null;
    status?: string;
  },
  executor: Exec,
) {
  return one<{ id: string; code: string | null; status: string }>(
    executor,
    `INSERT INTO user_vouchers (user_id, promo_id, code, status, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, promo_id, code, status, issued_at, expires_at`,
    [input.userId, input.promoId, input.code ?? null, input.status ?? 'available', input.expiresAt ?? null],
  );
}

export async function markVoucherUsed(voucherId: string, executor: Exec) {
  return one(
    executor,
    `UPDATE user_vouchers SET status = 'used', used_at = now() WHERE id = $1 RETURNING id, status`,
    [voucherId],
  );
}

export async function markVoucherAvailable(voucherId: string, executor: Exec) {
  return one(
    executor,
    `UPDATE user_vouchers SET status = 'available' WHERE id = $1 AND status = 'reserved' RETURNING id, status`,
    [voucherId],
  );
}

export async function expireDueVouchers(userId: string, executor: Exec = db) {
  await executor.query(
    `UPDATE user_vouchers
        SET status = 'expired'
      WHERE user_id = $1
        AND status = 'available'
        AND expires_at IS NOT NULL
        AND expires_at < now()`,
    [userId],
  );
}

// --------------------------------------------------------------------------
// Redemptions (orders_promo_redemptions)
// --------------------------------------------------------------------------
export async function insertRedemption(
  input: {
    promoId: string;
    userId?: string | null;
    voucherId?: string | null;
    orderId?: string | null;
    discountIdr: number;
  },
  executor: Exec,
) {
  return one<{ id: string }>(
    executor,
    `INSERT INTO orders_promo_redemptions (promo_id, user_id, voucher_id, order_id, discount_idr)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, promo_id, user_id, voucher_id, order_id, discount_idr, redeemed_at`,
    [input.promoId, input.userId ?? null, input.voucherId ?? null, input.orderId ?? null, input.discountIdr],
  );
}

/** Hapus redemption saat order dibatalkan supaya kuota promo tidak terpakai. */
export async function deleteRedemptionByOrder(orderId: string, executor: Exec) {
  await executor.query(`DELETE FROM orders_promo_redemptions WHERE order_id = $1`, [orderId]);
}

export async function listRedemptions(
  filters: { promoId?: string; branchId?: string; from?: string; to?: string },
  pagination: Paging,
  executor: Exec = db,
) {
  return many(
    executor,
    `SELECT opr.id, opr.promo_id, opr.user_id, opr.order_id, opr.discount_idr, opr.redeemed_at,
            pc.name AS promo_name, pc.code AS promo_code,
            o.order_number, o.total_idr, o.branch_id, o.fulfillment_type,
            u.display_name AS user_name
       FROM orders_promo_redemptions opr
       JOIN promo_campaigns pc ON pc.id = opr.promo_id
       LEFT JOIN orders o ON o.id = opr.order_id
       LEFT JOIN users u ON u.id = opr.user_id
      WHERE ($1::uuid IS NULL OR opr.promo_id = $1)
        AND ($2::uuid IS NULL OR o.branch_id = $2)
        AND ($3::timestamptz IS NULL OR opr.redeemed_at >= $3::timestamptz)
        AND ($4::timestamptz IS NULL OR opr.redeemed_at <= $4::timestamptz)
      ORDER BY opr.redeemed_at DESC
      ${paginationSql(pagination)}`,
    [filters.promoId ?? null, filters.branchId ?? null, filters.from ?? null, filters.to ?? null],
  );
}

export async function countRedemptions(
  filters: { promoId?: string; branchId?: string; from?: string; to?: string },
  executor: Exec = db,
) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int
       FROM orders_promo_redemptions opr
       LEFT JOIN orders o ON o.id = opr.order_id
      WHERE ($1::uuid IS NULL OR opr.promo_id = $1)
        AND ($2::uuid IS NULL OR o.branch_id = $2)
        AND ($3::timestamptz IS NULL OR opr.redeemed_at >= $3::timestamptz)
        AND ($4::timestamptz IS NULL OR opr.redeemed_at <= $4::timestamptz)`,
    [filters.promoId ?? null, filters.branchId ?? null, filters.from ?? null, filters.to ?? null],
  );
  return Number(value ?? 0);
}