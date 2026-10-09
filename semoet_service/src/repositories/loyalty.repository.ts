import { db, many, one, scalar, type Exec } from './base.js';
import { paginationSql, type Paging } from '../utils/pagination.js';

// --------------------------------------------------------------------------
// Rewards (loyalty_rewards)
// --------------------------------------------------------------------------
export async function listRewards(
  filters: { rewardType?: string; isActive?: boolean; maxPoints?: number },
  executor: Exec = db,
) {
  return many(
    executor,
    `SELECT id, code, name, description, points_cost, reward_type, reward_config, is_active
       FROM loyalty_rewards
      WHERE ($1::text IS NULL OR reward_type = $1)
        AND ($2::boolean IS NULL OR is_active = $2)
        AND ($3::int IS NULL OR points_cost <= $3)
      ORDER BY points_cost ASC`,
    [filters.rewardType ?? null, filters.isActive ?? null, filters.maxPoints ?? null],
  );
}

export async function findRewardById(rewardId: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT id, code, name, description, points_cost, reward_type, reward_config, is_active
       FROM loyalty_rewards
      WHERE id = $1`,
    [rewardId],
  );
}

export async function lockRewardById(rewardId: string, executor: Exec) {
  return one(
    executor,
    `SELECT id, code, name, description, points_cost, reward_type, reward_config, is_active
       FROM loyalty_rewards
      WHERE id = $1
      FOR UPDATE`,
    [rewardId],
  );
}

// --------------------------------------------------------------------------
// Point ledger (point_ledger) - sumber kebenaran saldo
// --------------------------------------------------------------------------
/**
 * Ringkasan saldo poin dari `point_ledger`.
 * `one()` melakukan camelize, jadi field di sini WAJIB camelCase.
 */
export interface PointsSummaryRow {
  balance: number;
  lifetimeEarned: number;
  lifetimeRedeemed: number;
  lifetimeExpired: number;
  expiringSoon: number;
  nextExpiryAt: string | null;
}

export async function getPointsSummary(userId: string, executor: Exec = db) {
  return one<PointsSummaryRow>(
    executor,
    `SELECT
        COALESCE(SUM(points_delta), 0)::int AS balance,
        COALESCE(SUM(points_delta) FILTER (WHERE mutation_type = 'earn'), 0)::int AS lifetime_earned,
        COALESCE(ABS(COALESCE(SUM(points_delta) FILTER (WHERE mutation_type = 'redeem'), 0)))::int AS lifetime_redeemed,
        COALESCE(ABS(COALESCE(SUM(points_delta) FILTER (WHERE mutation_type = 'expire'), 0)))::int AS lifetime_expired,
        COALESCE(SUM(points_delta) FILTER (
          WHERE mutation_type = 'earn'
            AND expires_at IS NOT NULL
            AND expires_at BETWEEN now() AND now() + interval '30 days'
        ), 0)::int AS expiring_soon,
        MIN(expires_at) FILTER (
          WHERE mutation_type = 'earn' AND expires_at IS NOT NULL AND expires_at > now()
        ) AS next_expiry_at
       FROM point_ledger
      WHERE user_id = $1`,
    [userId],
  );
}

export async function listPointHistory(
  userId: string,
  filters: { mutationType?: string; referenceType?: string; from?: string; to?: string },
  pagination: Paging,
  executor: Exec = db,
) {
  return many(
    executor,
    `SELECT pl.id, pl.points_delta, pl.mutation_type, pl.description,
            pl.reference_type, pl.reference_id, pl.expires_at, pl.created_at,
            CASE
              WHEN pl.reference_type = 'order' THEN o.order_number
              WHEN pl.reference_type = 'loyalty_redemption' THEN lr.id::text
              ELSE NULL
            END AS reference_label
       FROM point_ledger pl
       LEFT JOIN orders o ON o.id = pl.reference_id AND pl.reference_type = 'order'
       LEFT JOIN loyalty_redemptions lr ON lr.id = pl.reference_id AND pl.reference_type = 'loyalty_redemption'
      WHERE pl.user_id = $1
        AND ($2::text IS NULL OR pl.mutation_type = $2)
        AND ($3::text IS NULL OR pl.reference_type = $3)
        AND ($4::timestamptz IS NULL OR pl.created_at >= $4::timestamptz)
        AND ($5::timestamptz IS NULL OR pl.created_at <= $5::timestamptz)
      ORDER BY pl.created_at DESC
      ${paginationSql(pagination)}`,
    [userId, filters.mutationType ?? null, filters.referenceType ?? null, filters.from ?? null, filters.to ?? null],
  );
}

export async function countPointHistory(
  userId: string,
  filters: { mutationType?: string; referenceType?: string; from?: string; to?: string },
  executor: Exec = db,
) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int
       FROM point_ledger
      WHERE user_id = $1
        AND ($2::text IS NULL OR mutation_type = $2)
        AND ($3::text IS NULL OR reference_type = $3)
        AND ($4::timestamptz IS NULL OR created_at >= $4::timestamptz)
        AND ($5::timestamptz IS NULL OR created_at <= $5::timestamptz)`,
    [userId, filters.mutationType ?? null, filters.referenceType ?? null, filters.from ?? null, filters.to ?? null],
  );
  return Number(value ?? 0);
}

/**
 * Kunci baris users saat poin sedang dimodifikasi.
 * PostgreSQL tidak mengizinkan FOR UPDATE pada query agregat, jadi penguncian
 * dilakukan pada baris users: semua mutasi poin satu user jadi ter-serialisasi.
 */
export async function lockUserForPoints(userId: string, executor: Exec) {
  await executor.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [userId]);
  return one<{ balance: number }>(
    executor,
    `SELECT COALESCE(SUM(points_delta), 0)::int AS balance
       FROM point_ledger
      WHERE user_id = $1`,
    [userId],
  );
}

export async function insertPointEntry(
  input: {
    userId: string;
    pointsDelta: number;
    mutationType: string;
    description?: string | null;
    referenceType?: string | null;
    referenceId?: string | null;
    idempotencyKey?: string | null;
    expiresAt?: Date | null;
  },
  executor: Exec,
) {
  return one<{ id: string; pointsDelta: number }>(
    executor,
    `INSERT INTO point_ledger (
        user_id, points_delta, mutation_type, description,
        reference_type, reference_id, idempotency_key, expires_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id, points_delta, mutation_type, created_at`,
    [
      input.userId,
      input.pointsDelta,
      input.mutationType,
      input.description ?? null,
      input.referenceType ?? null,
      input.referenceId ?? null,
      input.idempotencyKey ?? null,
      input.expiresAt ?? null,
    ],
  );
}

export async function findPointEntryByIdempotencyKey(key: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT id, user_id, points_delta, mutation_type FROM point_ledger WHERE idempotency_key = $1`,
    [key],
  );
}

export async function expirePoints(now: Date, executor: Exec = db) {
  const result = await executor.query(
    `INSERT INTO point_ledger (user_id, points_delta, mutation_type, description, reference_type, reference_id)
     SELECT pl.user_id, -pl.points_delta, 'expire', 'Poin kedaluwarsa otomatis', 'point_ledger', pl.id
       FROM point_ledger pl
      WHERE pl.mutation_type = 'earn'
        AND pl.expires_at IS NOT NULL
        AND pl.expires_at <= $1
        AND NOT EXISTS (
          SELECT 1 FROM point_ledger exp
           WHERE exp.reference_type = 'point_ledger'
             AND exp.reference_id = pl.id
             AND exp.mutation_type = 'expire'
        )
     RETURNING id`,
    [now],
  );
  return result.rowCount ?? 0;
}

// --------------------------------------------------------------------------
// Redemptions (loyalty_redemptions)
// --------------------------------------------------------------------------
export async function insertRedemption(
  input: {
    userId: string;
    rewardId: string;
    pointsSpent: number;
    voucherId?: string | null;
    status?: string;
  },
  executor: Exec,
) {
  return one<{ id: string; status: string }>(
    executor,
    `INSERT INTO loyalty_redemptions (user_id, reward_id, points_spent, voucher_id, status)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING id, user_id, reward_id, points_spent, voucher_id, status, created_at`,
    [input.userId, input.rewardId, input.pointsSpent, input.voucherId ?? null, input.status ?? 'completed'],
  );
}

export async function listRedemptions(
  userId: string,
  pagination: Paging,
  status?: string,
  executor: Exec = db,
) {
  return many(
    executor,
    `SELECT lr.id, lr.reward_id, lr.points_spent, lr.voucher_id, lr.status, lr.created_at,
            rew.code AS reward_code, rew.name AS reward_name, rew.reward_type, rew.reward_config,
            uv.code AS voucher_code, uv.status AS voucher_status, uv.expires_at AS voucher_expires_at
       FROM loyalty_redemptions lr
       JOIN loyalty_rewards rew ON rew.id = lr.reward_id
       LEFT JOIN user_vouchers uv ON uv.id = lr.voucher_id
      WHERE lr.user_id = $1
        AND ($2::text IS NULL OR lr.status = $2)
      ORDER BY lr.created_at DESC
      ${paginationSql(pagination)}`,
    [userId, status ?? null],
  );
}

export async function countRedemptions(userId: string, status?: string, executor: Exec = db) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int FROM loyalty_redemptions WHERE user_id = $1 AND ($2::text IS NULL OR status = $2)`,
    [userId, status ?? null],
  );
  return Number(value ?? 0);
}

export async function lockRedemption(id: string, userId: string, executor: Exec) {
  return one(
    executor,
    `SELECT id, user_id, reward_id, points_spent, voucher_id, status
       FROM loyalty_redemptions
      WHERE id = $1 AND user_id = $2
      FOR UPDATE`,
    [id, userId],
  );
}

export async function cancelRedemption(id: string, userId: string, executor: Exec) {
  return one(
    executor,
    `UPDATE loyalty_redemptions SET status = 'cancelled' WHERE id = $1 AND user_id = $2 RETURNING id, status`,
    [id, userId],
  );
}