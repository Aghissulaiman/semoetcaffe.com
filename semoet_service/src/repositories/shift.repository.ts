import { db, many, one, scalar, type Exec } from './base.js';
import { paginationSql, type Paging } from '../utils/pagination.js';

const SHIFT_SELECT = `
  SELECT s.id, s.branch_id, s.staff_user_id, s.status, s.opened_at, s.closed_at,
         s.planned_start_at, s.planned_end_at,
         s.opening_cash_idr, s.closing_cash_idr, s.notes, s.closing_notes,
         s.opened_by, s.closed_by, s.created_at, s.updated_at,
         b.name AS branch_name,
         u.display_name AS staff_name, u.email AS staff_email,
         ob.display_name AS opened_by_name,
         cb.display_name AS closed_by_name,
         COALESCE(sm.order_count, 0)::int AS order_count,
         COALESCE(sm.sales_idr, 0)::bigint AS sales_idr,
         COALESCE(sm.cash_sales_idr, 0)::bigint AS cash_sales_idr
    FROM shifts s
    JOIN branches b ON b.id = s.branch_id
    JOIN users u ON u.id = s.staff_user_id
    LEFT JOIN users ob ON ob.id = s.opened_by
    LEFT JOIN users cb ON cb.id = s.closed_by
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS order_count,
             COALESCE(SUM(o.total_idr), 0)::bigint AS sales_idr,
             COALESCE(SUM(pay.cash_amount_idr), 0)::bigint AS cash_sales_idr
        FROM orders o
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(pt.amount_idr) FILTER (WHERE pt.payment_method = 'cash'), 0)::bigint
                   AS cash_amount_idr
            FROM payment_transactions pt
           WHERE pt.order_id = o.id
             AND pt.status = 'succeeded'
             AND pt.transaction_type = 'charge'
        ) pay ON true
       WHERE o.branch_id = s.branch_id
         AND o.payment_status = 'paid'
         AND o.placed_at >= s.opened_at
         AND (s.closed_at IS NULL OR o.placed_at < s.closed_at)
    ) sm ON true
`;

/** Akun aktif yang benar-benar memiliki role `staff`. */
export async function listStaffAccounts(executor: Exec = db) {
  return many(
    executor,
    `SELECT u.id, u.display_name, u.email, u.phone_e164, u.last_login_at,
            array_agg(r.code ORDER BY r.code) AS role_codes
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
      WHERE u.status = 'active'
        AND u.deleted_at IS NULL
        AND r.code = 'staff'
      GROUP BY u.id
      ORDER BY u.display_name ASC`,
    [],
  );
}

export async function findStaffAccount(userId: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT u.id, u.display_name, u.email, u.phone_e164, u.last_login_at,
            array_agg(r.code ORDER BY r.code) AS role_codes
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
      WHERE u.id = $1
        AND u.status = 'active'
        AND u.deleted_at IS NULL
        AND r.code = 'staff'
      GROUP BY u.id`,
    [userId],
  );
}

export async function findShiftById(shiftId: string, executor: Exec = db) {
  return one(executor, `${SHIFT_SELECT} WHERE s.id = $1`, [shiftId]);
}

export async function findActiveShift(branchId: string, executor: Exec = db) {
  return one(
    executor,
    `${SHIFT_SELECT}
      WHERE s.branch_id = $1 AND s.status = 'open'
      ORDER BY s.opened_at DESC
      LIMIT 1`,
    [branchId],
  );
}

export async function findActiveShiftForStaff(staffUserId: string, executor: Exec = db) {
  return one(
    executor,
    `${SHIFT_SELECT}
      WHERE s.staff_user_id = $1 AND s.status = 'open'
      ORDER BY s.opened_at DESC
      LIMIT 1`,
    [staffUserId],
  );
}

export async function listShifts(branchId: string, pagination: Paging, executor: Exec = db) {
  return many(
    executor,
    `${SHIFT_SELECT}
      WHERE s.branch_id = $1
      ORDER BY s.opened_at DESC
      ${paginationSql(pagination)}`,
    [branchId],
  );
}

export async function countShifts(branchId: string, executor: Exec = db) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int FROM shifts WHERE branch_id = $1`,
    [branchId],
  );
  return Number(value ?? 0);
}

export async function lockShiftRow(shiftId: string, executor: Exec) {
  return one(
    executor,
    `SELECT id, branch_id, staff_user_id, status
       FROM shifts
      WHERE id = $1
      FOR UPDATE`,
    [shiftId],
  );
}

export async function insertShift(
  input: {
    branchId: string;
    staffUserId: string;
    openingCashIdr: number;
    plannedStartAt?: string | null;
    plannedEndAt?: string | null;
    notes?: string | null;
    openedBy: string;
  },
  executor: Exec,
) {
  return one(
    executor,
    `INSERT INTO shifts
       (branch_id, staff_user_id, status, opening_cash_idr,
        planned_start_at, planned_end_at, notes, opened_by)
     VALUES ($1, $2, 'open', $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      input.branchId,
      input.staffUserId,
      input.openingCashIdr,
      input.plannedStartAt ?? null,
      input.plannedEndAt ?? null,
      input.notes?.trim() || null,
      input.openedBy,
    ],
  );
}

export async function updateShiftPlan(
  shiftId: string,
  plannedStartAt: string,
  plannedEndAt: string,
  executor: Exec,
) {
  return one(
    executor,
    `UPDATE shifts
        SET planned_start_at = $2,
            planned_end_at = $3,
            updated_at = now()
      WHERE id = $1
        AND status = 'open'
      RETURNING id`,
    [shiftId, plannedStartAt, plannedEndAt],
  );
}

export async function closeShift(
  shiftId: string,
  closingCashIdr: number,
  notes: string | null,
  closedBy: string,
  executor: Exec,
) {
  return one(
    executor,
    `UPDATE shifts
        SET status = 'closed',
            closed_at = now(),
            closing_cash_idr = $2,
            closing_notes = $3,
            closed_by = $4,
            updated_at = now()
      WHERE id = $1
      RETURNING id`,
    [shiftId, closingCashIdr, notes?.trim() || null, closedBy],
  );
}
