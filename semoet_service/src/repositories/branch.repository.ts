import { db, many, one, scalar, type Exec } from './base.js';
import { paginationSql, type Paging } from '../utils/pagination.js';
import { sha256 } from '../utils/codeGenerator.js';

const BRANCH_COLUMNS = `
  id, code, name, phone, address, timezone, latitude, longitude, is_active, created_at, updated_at
`;

/**
 * Jarak (km) via Haversine, dipakai filter "cabang terdekat".
 * Parameter mengikuti posisi di `listBranches`: $3 = latitude, $4 = longitude
 * ($1 = status aktif, $2 = kata kunci, $5 = radius).
 */
const DISTANCE_SQL = `
  CASE
    WHEN $3::numeric IS NULL OR $4::numeric IS NULL THEN NULL
    ELSE 6371 * acos(
      LEAST(1, GREATEST(-1,
        cos(radians($3::numeric)) * cos(radians(br.latitude))
        * cos(radians(br.longitude) - radians($4::numeric))
        + sin(radians($3::numeric)) * sin(radians(br.latitude))
      ))
    )
  END
`;

export interface ListBranchFilters {
  isActive?: boolean;
  q?: string;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  withDistance?: boolean;
}

export async function listBranches(
  pagination: Paging,
  filters: ListBranchFilters,
  executor: Exec = db,
) {
  return many(
    executor,
    `SELECT br.id, br.code, br.name, br.phone, br.address, br.timezone,
            br.latitude, br.longitude, br.is_active,
            ${filters.withDistance ? `${DISTANCE_SQL} AS distance_km` : 'NULL::numeric AS distance_km'}
       FROM branches br
      WHERE ($1::boolean IS NULL OR br.is_active = $1)
        AND ($2::text IS NULL OR br.name ILIKE '%' || $2 || '%' OR br.address ILIKE '%' || $2 || '%' OR br.code ILIKE '%' || $2 || '%')
        AND (
          $3::numeric IS NULL OR $4::numeric IS NULL OR $5::numeric IS NULL
          OR (${DISTANCE_SQL}) <= $5::numeric
        )
      ORDER BY
        ${filters.withDistance ? 'distance_km ASC NULLS LAST,' : ''}
        br.name ASC
      ${paginationSql(pagination)}`,
    [
      filters.isActive ?? null,
      filters.q ?? null,
      filters.latitude ?? null,
      filters.longitude ?? null,
      filters.radiusKm ?? null,
    ],
  );
}

export async function countBranches(filters: ListBranchFilters, executor: Exec = db) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int
       FROM branches br
      WHERE ($1::boolean IS NULL OR br.is_active = $1)
        AND ($2::text IS NULL OR br.name ILIKE '%' || $2 || '%' OR br.address ILIKE '%' || $2 || '%' OR br.code ILIKE '%' || $2 || '%')`,
    [filters.isActive ?? null, filters.q ?? null],
  );
  return Number(value ?? 0);
}

export async function findBranchById(branchId: string, executor: Exec = db) {
  return one(executor, `SELECT ${BRANCH_COLUMNS} FROM branches WHERE id = $1`, [branchId]);
}

export async function findBranchByCode(code: string, executor: Exec = db) {
  return one(executor, `SELECT ${BRANCH_COLUMNS} FROM branches WHERE code = $1`, [code]);
}

export async function branchExists(branchId: string, executor: Exec = db) {
  const value = await scalar<boolean>(
    executor,
    `SELECT EXISTS (SELECT 1 FROM branches WHERE id = $1 AND is_active = true)`,
    [branchId],
  );
  return Boolean(value);
}

export async function listBusinessHours(branchId: string, executor: Exec = db) {
  return many(
    executor,
    `SELECT id, branch_id, day_of_week, opens_at, closes_at, service_type
       FROM branch_business_hours
      WHERE branch_id = $1
      ORDER BY day_of_week ASC, service_type ASC, opens_at ASC`,
    [branchId],
  );
}

export async function findHoursForDay(branchId: string, dayOfWeek: number, serviceType: string, executor: Exec = db) {
  return many(
    executor,
    `SELECT id, opens_at, closes_at, service_type
       FROM branch_business_hours
      WHERE branch_id = $1 AND day_of_week = $2 AND service_type IN ($3, 'all')
      ORDER BY service_type DESC, opens_at ASC`,
    [branchId, dayOfWeek, serviceType],
  );
}

export async function listAreas(branchId: string, isActive?: boolean, executor: Exec = db) {
  return many(
    executor,
    `SELECT a.id, a.branch_id, a.name, a.area_type, a.image_url, a.image_storage_key, a.is_active,
            a.price_per_hour_idr,
            COALESCE(t.table_count, 0) AS table_count,
            COALESCE(t.total_capacity, 0) AS total_capacity
       FROM dining_areas a
       LEFT JOIN (
         SELECT area_id, COUNT(*)::int AS table_count, SUM(capacity)::int AS total_capacity
           FROM cafe_tables
          WHERE is_active = true
          GROUP BY area_id
       ) t ON t.area_id = a.id
      WHERE a.branch_id = $1
        AND ($2::boolean IS NULL OR a.is_active = $2)
      ORDER BY a.name ASC`,
    [branchId, isActive ?? null],
  );
}

export async function findAreaById(areaId: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT id, branch_id, name, area_type, image_url, image_storage_key, price_per_hour_idr, is_active
       FROM dining_areas WHERE id = $1`,
    [areaId],
  );
}

/** Cek bentrok nama area dalam satu cabang (kecuali id tertentu). */
export async function areaNameExists(
  branchId: string,
  name: string,
  excludeId: string | null,
  executor: Exec = db,
): Promise<boolean> {
  const row = await one<{ exists: boolean }>(
    executor,
    `SELECT EXISTS(
       SELECT 1 FROM dining_areas
        WHERE branch_id = $1 AND lower(name) = lower($2)
          AND ($3::uuid IS NULL OR id <> $3::uuid)
     ) AS exists`,
    [branchId, name, excludeId],
  );
  return Boolean(row?.exists);
}

export interface CreateAreaInput {
  branchId: string;
  name: string;
  areaType: string;
  pricePerHourIdr?: number | null;
  imageUrl?: string | null;
  imageStorageKey?: string | null;
  isActive?: boolean;
}

export async function insertArea(input: CreateAreaInput, executor: Exec = db) {
  return one(
    executor,
    `INSERT INTO dining_areas (branch_id, name, area_type, price_per_hour_idr, image_url, image_storage_key, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, true))
     RETURNING id, branch_id, name, area_type, price_per_hour_idr, image_url, image_storage_key, is_active`,
    [
      input.branchId,
      input.name,
      input.areaType,
      input.pricePerHourIdr ?? null,
      input.imageUrl ?? null,
      input.imageStorageKey ?? null,
      input.isActive ?? null,
    ],
  );
}

export interface UpdateAreaInput {
  name?: string;
  areaType?: string;
  pricePerHourIdr?: number | null;
  imageUrl?: string | null;
  imageStorageKey?: string | null;
  isActive?: boolean;
}

export async function updateArea(areaId: string, patch: UpdateAreaInput, executor: Exec = db) {
  return one(
    executor,
    `UPDATE dining_areas
        SET name = COALESCE($2, name),
            area_type = COALESCE($3, area_type),
            price_per_hour_idr = CASE WHEN $4::boolean THEN $5 ELSE price_per_hour_idr END,
            image_url = CASE WHEN $6::boolean THEN $7 ELSE image_url END,
            image_storage_key = CASE WHEN $6::boolean THEN $8 ELSE image_storage_key END,
            is_active = COALESCE($9, is_active)
      WHERE id = $1
      RETURNING id, branch_id, name, area_type, price_per_hour_idr, image_url, image_storage_key, is_active`,
    [
      areaId,
      patch.name ?? null,
      patch.areaType ?? null,
      patch.pricePerHourIdr !== undefined,
      patch.pricePerHourIdr ?? null,
      patch.imageUrl !== undefined || patch.imageStorageKey !== undefined,
      patch.imageUrl ?? null,
      patch.imageStorageKey ?? null,
      patch.isActive ?? null,
    ],
  );
}

/** Jumlah meja aktif dalam sebuah area (untuk cegah hapus area terpakai). */
export async function countTablesInArea(areaId: string, executor: Exec = db): Promise<number> {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int FROM cafe_tables WHERE area_id = $1`,
    [areaId],
  );
  return Number(value ?? 0);
}

/** Reservasi yang masih aktif dan memakai area ini (mencegah hapus ruangan). */
export async function listActiveReservationsInArea(areaId: string, executor: Exec = db) {
  return many<{ id: string; reservationNumber: string; status: string }>(
    executor,
    `SELECT r.id, r.reservation_number, r.status
       FROM reservation_rooms rr
       JOIN reservations r ON r.id = rr.reservation_id
      WHERE rr.area_id = $1
        AND r.status IN ('requested','confirmed','seated')
      ORDER BY r.reserved_for ASC`,
    [areaId],
  );
}

/**
 * Lepas tautan ruangan dari reservasi yang sudah final (selesai/dibatalkan/no
 * show). Reservasi aktif tidak disentuh — hapus ruangan tetap ditolak selama
 * masih ada reservasi aktif.
 */
export async function deleteReservationRoomLinks(areaId: string, executor: Exec = db) {
  await executor.query(
    `DELETE FROM reservation_rooms rr
      USING reservations r
      WHERE rr.reservation_id = r.id
        AND rr.area_id = $1
        AND r.status NOT IN ('requested','confirmed','seated')`,
    [areaId],
  );
}

export async function deleteArea(areaId: string, executor: Exec = db) {
  return one(executor, `DELETE FROM dining_areas WHERE id = $1 RETURNING id`, [areaId]);
}

export interface CreateTableInput {
  areaId: string;
  tableCode: string;
  capacity: number;
  isActive?: boolean;
}

export async function insertTable(input: CreateTableInput, executor: Exec = db) {
  return one(
    executor,
    `INSERT INTO cafe_tables (area_id, table_code, capacity, is_active)
     VALUES ($1, $2, $3, COALESCE($4, true))
     RETURNING id, area_id, table_code, capacity, is_active`,
    [input.areaId, input.tableCode, input.capacity, input.isActive ?? null],
  );
}

export interface UpdateTableInput {
  tableCode?: string;
  capacity?: number;
  isActive?: boolean;
}

export async function updateTable(tableId: string, patch: UpdateTableInput, executor: Exec = db) {
  return one(
    executor,
    `UPDATE cafe_tables
        SET table_code = COALESCE($2, table_code),
            capacity = COALESCE($3, capacity),
            is_active = COALESCE($4, is_active)
      WHERE id = $1
      RETURNING id, area_id, table_code, capacity, is_active`,
    [tableId, patch.tableCode ?? null, patch.capacity ?? null, patch.isActive ?? null],
  );
}

/** Apakah meja sedang dipakai reservasi/reservation_tables aktif. */
export async function tableHasReservation(tableId: string, executor: Exec = db): Promise<boolean> {
  const row = await one<{ exists: boolean }>(
    executor,
    `SELECT EXISTS(
       SELECT 1 FROM reservation_tables rt
        JOIN reservations r ON r.id = rt.reservation_id
        WHERE rt.table_id = $1
          AND r.status IN ('requested','confirmed','seated')
     ) AS exists`,
    [tableId],
  );
  return Boolean(row?.exists);
}

export async function deleteTable(tableId: string, executor: Exec = db) {
  return one(executor, `DELETE FROM cafe_tables WHERE id = $1 RETURNING id`, [tableId]);
}

export interface ListTableFilters {
  areaId?: string;
  isActive?: boolean;
  minCapacity?: number;
}

export async function listTables(
  branchId: string,
  pagination: Paging,
  filters: ListTableFilters,
  executor: Exec = db,
) {
  return many(
    executor,
    `SELECT t.id, t.area_id, t.table_code, t.capacity, t.is_active,
            a.name AS area_name, a.area_type
       FROM cafe_tables t
       JOIN dining_areas a ON a.id = t.area_id
      WHERE a.branch_id = $1
        AND ($2::uuid IS NULL OR t.area_id = $2)
        AND ($3::boolean IS NULL OR t.is_active = $3)
        AND ($4::int IS NULL OR t.capacity >= $4)
      ORDER BY a.name ASC, t.table_code ASC
      ${paginationSql(pagination)}`,
    [branchId, filters.areaId ?? null, filters.isActive ?? null, filters.minCapacity ?? null],
  );
}

export async function countTables(branchId: string, filters: ListTableFilters, executor: Exec = db) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int
       FROM cafe_tables t
       JOIN dining_areas a ON a.id = t.area_id
      WHERE a.branch_id = $1
        AND ($2::uuid IS NULL OR t.area_id = $2)
        AND ($3::boolean IS NULL OR t.is_active = $3)
        AND ($4::int IS NULL OR t.capacity >= $4)`,
    [branchId, filters.areaId ?? null, filters.isActive ?? null, filters.minCapacity ?? null],
  );
  return Number(value ?? 0);
}

export async function findTableById(tableId: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT t.id, t.area_id, t.table_code, t.capacity, t.is_active, a.branch_id
       FROM cafe_tables t
       JOIN dining_areas a ON a.id = t.area_id
      WHERE t.id = $1`,
    [tableId],
  );
}

/**
 * Kolom qr_token_hash menyimpan hash dari token yang dicetak pada QR meja.
 * Token mentah hanya ada di sistem pencetakan QR, jadi di-hash saat lookup.
 */
export async function findTableByQrToken(token: string, executor: Exec = db) {
  const tokenHash = sha256(token);
  return one(
    executor,
    `SELECT t.id, t.area_id, t.table_code, t.capacity, t.is_active,
            a.branch_id, a.name AS area_name, a.area_type,
            br.code AS branch_code, br.name AS branch_name, br.address AS branch_address
       FROM cafe_tables t
       JOIN dining_areas a ON a.id = t.area_id
       JOIN branches br ON br.id = a.branch_id
      WHERE t.qr_token_hash = $1`,
    [tokenHash],
  );
}

/** Meja yang sedang dipakai order aktif (untuk legit dine-in). */
export async function findActiveOrderByTable(tableId: string, executor: Exec = db) {
  return one<{ id: string; orderNumber: string; orderStatus: string }>(
    executor,
    `SELECT id, order_number, order_status
       FROM orders
      WHERE table_id = $1
        AND order_status IN ('placed','accepted','preparing','ready')
      ORDER BY placed_at DESC
      LIMIT 1`,
    [tableId],
  );
}