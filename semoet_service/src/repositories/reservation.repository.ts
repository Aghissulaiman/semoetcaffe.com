import { db, many, one, scalar, type Exec } from './base.js';
import { paginationSql, type Paging } from '../utils/pagination.js';

const RESERVATION_COLUMNS = `
  r.id, r.reservation_number, r.user_id, r.branch_id, r.area_id, r.reserved_for,
  r.duration_minutes, r.guest_count, r.seating_preference, r.status,
  r.special_requests, r.created_at, r.updated_at
`;

export interface InsertReservationInput {
  reservationNumber: string;
  userId: string;
  branchId: string;
  areaId?: string | null;
  reservedFor: Date;
  durationMinutes: number;
  guestCount: number;
  seatingPreference?: string | null;
  specialRequests?: string | null;
}

export async function insertReservation(input: InsertReservationInput, executor: Exec) {
  return one<{ id: string; reservationNumber: string }>(
    executor,
    `INSERT INTO reservations (
        reservation_number, user_id, branch_id, area_id, reserved_for,
        duration_minutes, guest_count, seating_preference, status, special_requests
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'requested',$9)
     RETURNING id, reservation_number, created_at`,
    [
      input.reservationNumber,
      input.userId,
      input.branchId,
      input.areaId ?? null,
      input.reservedFor,
      input.durationMinutes,
      input.guestCount,
      input.seatingPreference ?? null,
      input.specialRequests ?? null,
    ],
  );
}

/** Generate nomor reservasi unik (retry bila tabrakan). */
export async function reservationNumberExists(reservationNumber: string, executor: Exec = db) {
  const value = await scalar<boolean>(
    executor,
    `SELECT EXISTS (SELECT 1 FROM reservations WHERE reservation_number = $1)`,
    [reservationNumber],
  );
  return Boolean(value);
}

export async function findReservationById(reservationId: string, executor: Exec = db) {
  return one(executor, `SELECT ${RESERVATION_COLUMNS} FROM reservations r WHERE r.id = $1`, [
    reservationId,
  ]);
}

export async function findReservationForUser(reservationId: string, userId: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT ${RESERVATION_COLUMNS} FROM reservations r WHERE r.id = $1 AND r.user_id = $2`,
    [reservationId, userId],
  );
}

export async function lockReservationForUser(reservationId: string, userId: string, executor: Exec) {
  return one(
    executor,
    `SELECT ${RESERVATION_COLUMNS} FROM reservations r WHERE r.id = $1 AND r.user_id = $2 FOR UPDATE`,
    [reservationId, userId],
  );
}

/**
 * Deteksi overlap reservasi pada cabang yang sama.
 * Interval overlap: reserved_for < :end AND reserved_for + duration > :start
 */
export async function findOverlappingReservations(
  branchId: string,
  start: Date,
  end: Date,
  excludeReservationId: string | null,
  executor: Exec,
) {
  return many<{ id: string; reservationNumber: string; reservedFor: string; status: string; guestCount: number }>(
    executor,
    `SELECT id, reservation_number, reserved_for, status, guest_count
       FROM reservations
      WHERE branch_id = $1
        AND status NOT IN ('cancelled','no_show')
        AND reserved_for < $3
        AND (reserved_for + make_interval(mins => duration_minutes)) > $2
        AND ($4::uuid IS NULL OR id <> $4)
      ORDER BY reserved_for ASC`,
    [branchId, start, end, excludeReservationId],
  );
}

export async function updateReservation(
  reservationId: string,
  userId: string,
  data: Record<string, unknown>,
  executor: Exec = db,
) {
  const columns = Object.keys(data);
  if (columns.length === 0) return null;
  const assignments = columns.map((column, index) => `${column} = $${index + 3}`).join(', ');
  return one(
    executor,
    `UPDATE reservations SET ${assignments}, updated_at = now()
      WHERE id = $1 AND user_id = $2
      RETURNING ${RESERVATION_COLUMNS}`,
    [reservationId, userId, ...Object.values(data)],
  );
}

/** Update status oleh staff (tanpa batas ownership). */
export async function updateReservationStatusByStaff(
  reservationId: string,
  data: Record<string, unknown>,
  executor: Exec = db,
) {
  const columns = Object.keys(data);
  if (columns.length === 0) return null;
  const assignments = columns.map((column, index) => `${column} = $${index + 2}`).join(', ');
  return one(
    executor,
    `UPDATE reservations SET ${assignments}, updated_at = now() WHERE id = $1 RETURNING ${RESERVATION_COLUMNS}`,
    [reservationId, ...Object.values(data)],
  );
}

export interface ListReservationFilters {
  status?: string;
  upcomingOnly?: boolean;
}

export async function listReservationsForUser(
  userId: string,
  filters: ListReservationFilters,
  pagination: Paging,
  executor: Exec = db,
) {
  return many(
    executor,
    `SELECT ${RESERVATION_COLUMNS},
            b.name AS branch_name, b.code AS branch_code, b.address AS branch_address,
            a.name AS area_name, a.area_type,
            tables.table_codes
       FROM reservations r
       JOIN branches b ON b.id = r.branch_id
       LEFT JOIN dining_areas a ON a.id = r.area_id
       LEFT JOIN LATERAL (
         SELECT array_agg(t.table_code ORDER BY t.table_code) AS table_codes
           FROM reservation_tables rt
           JOIN cafe_tables t ON t.id = rt.table_id
          WHERE rt.reservation_id = r.id
       ) tables ON true
      WHERE r.user_id = $1
        AND ($2::text IS NULL OR r.status = $2)
        AND ($3::boolean = false OR r.reserved_for >= now())
      ORDER BY r.reserved_for DESC
      ${paginationSql(pagination)}`,
    [userId, filters.status ?? null, filters.upcomingOnly ?? false],
  );
}

export async function countReservationsForUser(
  userId: string,
  filters: ListReservationFilters,
  executor: Exec = db,
) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int
       FROM reservations
      WHERE user_id = $1
        AND ($2::text IS NULL OR status = $2)
        AND ($3::boolean = false OR reserved_for >= now())`,
    [userId, filters.status ?? null, filters.upcomingOnly ?? false],
  );
  return Number(value ?? 0);
}

/** Jadwal reservasi untuk tanggal tertentu - dipakai guest yang melakukan scan QR. */
export async function listBranchReservations(
  branchId: string,
  date: string,
  executor: Exec = db,
) {
  return many(
    executor,
    `SELECT r.id, r.reservation_number, r.reserved_for, r.duration_minutes,
            r.guest_count, r.status, u.display_name AS user_name
       FROM reservations r
       JOIN users u ON u.id = r.user_id
      WHERE r.branch_id = $1
        AND r.status NOT IN ('cancelled','no_show')
        AND (r.reserved_for AT TIME ZONE 'Asia/Jakarta')::date = $2::date
      ORDER BY r.reserved_for ASC`,
    [branchId, date],
  );
}

// --------------------------------------------------------------------------
// Meja reservasi (reservation_tables)
// --------------------------------------------------------------------------
export async function insertReservationTables(reservationId: string, tableIds: string[], executor: Exec) {
  if (tableIds.length === 0) return;
  await executor.query(
    `INSERT INTO reservation_tables (reservation_id, table_id)
     SELECT $1, unnest($2::uuid[])
     ON CONFLICT DO NOTHING`,
    [reservationId, tableIds],
  );
}

export async function replaceReservationTables(reservationId: string, tableIds: string[], executor: Exec) {
  await executor.query(`DELETE FROM reservation_tables WHERE reservation_id = $1`, [reservationId]);
  await insertReservationTables(reservationId, tableIds, executor);
}

export async function listReservationTables(reservationId: string, executor: Exec = db) {
  return many(
    executor,
    `SELECT rt.table_id, t.table_code, t.capacity, t.area_id, a.name AS area_name
       FROM reservation_tables rt
       JOIN cafe_tables t ON t.id = rt.table_id
       JOIN dining_areas a ON a.id = t.area_id
      WHERE rt.reservation_id = $1
      ORDER BY t.table_code`,
    [reservationId],
  );
}

/** Meja yang sudah dibooked pada window waktu tertentu. */
export async function findReservedTables(
  branchId: string,
  start: Date,
  end: Date,
  excludeReservationId: string | null,
  executor: Exec,
) {
  return many<{ tableId: string; reservationId: string; reservationNumber: string; reservedFor: string }>(
    executor,
    `SELECT rt.table_id, r.id AS reservation_id, r.reservation_number, r.reserved_for
       FROM reservation_tables rt
       JOIN reservations r ON r.id = rt.reservation_id
       JOIN cafe_tables t ON t.id = rt.table_id
       JOIN dining_areas a ON a.id = t.area_id
      WHERE a.branch_id = $1
        AND r.status NOT IN ('cancelled','no_show')
        AND r.reserved_for < $3
        AND (r.reserved_for + make_interval(mins => r.duration_minutes)) > $2
        AND ($4::uuid IS NULL OR r.id <> $4)`,
    [branchId, start, end, excludeReservationId],
  );
}

/** Auto-alokasi meja yang cukup kapasitas dan belum terbooking. */
export async function findAvailableTables(
  branchId: string,
  minCapacity: number,
  start: Date,
  end: Date,
  executor: Exec,
) {
  return many<{ id: string; tableCode: string; capacity: number; areaId: string; areaName: string; areaType: string }>(
    executor,
    `SELECT t.id, t.table_code, t.capacity, t.area_id, a.name AS area_name, a.area_type
       FROM cafe_tables t
       JOIN dining_areas a ON a.id = t.area_id
      WHERE a.branch_id = $1
        AND t.is_active = true
        AND a.is_active = true
        AND t.capacity >= $2
        AND NOT EXISTS (
          SELECT 1
            FROM reservation_tables rt
            JOIN reservations r ON r.id = rt.reservation_id
           WHERE rt.table_id = t.id
             AND r.status NOT IN ('cancelled','no_show')
             AND r.reserved_for < $4
             AND (r.reserved_for + make_interval(mins => r.duration_minutes)) > $3
        )
      ORDER BY t.capacity ASC, t.table_code ASC
      LIMIT 20`,
    [branchId, minCapacity, start, end],
  );
}

export async function deleteReservation(reservationId: string, executor: Exec = db) {
  await executor.query(`DELETE FROM reservations WHERE id = $1`, [reservationId]);
}