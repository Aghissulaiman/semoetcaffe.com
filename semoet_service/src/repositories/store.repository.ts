import { db, many, one, type Exec } from './base.js';

export interface StoreStatusRow {
  branchId: string;
  mode: 'auto' | 'open' | 'closed';
  updatedAt: Date | string | null;
  updatedByName: string | null;
}

export interface StoreScheduleRow {
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
}

const STATUS_SELECT = `
  SELECT s.branch_id, s.mode, s.updated_at,
         u.display_name AS updated_by_name
    FROM branch_store_status s
    LEFT JOIN users u ON u.id = s.updated_by
`;

export async function findStatus(branchId: string, executor: Exec = db) {
  return one<StoreStatusRow>(
    executor,
    `${STATUS_SELECT} WHERE s.branch_id = $1`,
    [branchId],
  );
}

export async function upsertStatus(
  branchId: string,
  mode: 'auto' | 'open' | 'closed',
  actorUserId: string | null,
  executor: Exec = db,
) {
  return one<StoreStatusRow>(
    executor,
    `INSERT INTO branch_store_status (branch_id, mode, updated_by, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (branch_id) DO UPDATE
       SET mode = EXCLUDED.mode,
           updated_by = EXCLUDED.updated_by,
           updated_at = now()
     RETURNING branch_id, mode, updated_at,
               (SELECT display_name FROM users WHERE id = $3) AS updated_by_name`,
    [branchId, mode, actorUserId],
  );
}

export async function listSchedule(branchId: string, executor: Exec = db) {
  return many<StoreScheduleRow>(
    executor,
    `SELECT day_of_week, opens_at, closes_at
       FROM branch_business_hours
      WHERE branch_id = $1
        AND service_type = 'all'
      ORDER BY day_of_week ASC, opens_at ASC`,
    [branchId],
  );
}

/** Ganti jadwal "all" menjadi satu jam buka/tutup yang sama untuk 7 hari. */
export async function replaceDailySchedule(
  branchId: string,
  opensAt: string,
  closesAt: string,
  executor: Exec = db,
) {
  await executor.query(
    `DELETE FROM branch_business_hours
      WHERE branch_id = $1
        AND service_type = 'all'`,
    [branchId],
  );
  await executor.query(
    `INSERT INTO branch_business_hours
       (branch_id, day_of_week, opens_at, closes_at, service_type)
     SELECT $1, day_of_week, $2::time, $3::time, 'all'
       FROM generate_series(0, 6) AS day_of_week`,
    [branchId, opensAt, closesAt],
  );
  return listSchedule(branchId, executor);
}
