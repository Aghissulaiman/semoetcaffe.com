import { db, many, one, scalar, type Exec } from './base.js';
import { paginationSql, type Paging } from '../utils/pagination.js';

const RESERVATION_COLUMNS = `
  r.id, r.reservation_number, r.user_id, r.branch_id, r.area_id, r.reserved_for,
  r.duration_minutes, r.guest_count, r.seating_preference, r.status,
  r.special_requests, r.created_at, r.updated_at,
  r.contact_name, r.contact_phone,
  r.area_price_per_hour_idr, r.total_estimate_idr, r.room_total_idr, r.menu_total_idr,
  r.deposit_amount_idr, r.deposit_status, r.deposit_proof_url,
  r.deposit_proof_storage_key, r.deposit_paid_at, r.deposit_note,
  r.deposit2_amount_idr, r.deposit2_status, r.deposit2_proof_url,
  r.deposit2_proof_storage_key, r.deposit2_paid_at, r.deposit2_note,
  r.settlement_amount_idr, r.settlement_status, r.settlement_proof_url,
  r.settlement_proof_storage_key, r.settlement_paid_at, r.settlement_note
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
  /** Kontak yang diisi pelanggan pada form reservasi. */
  contactName?: string | null;
  contactPhone?: string | null;
  /** Sewa ruangan + nominal DP1 (bila pelanggan membayar di muka). */
  areaPricePerHourIdr?: number | null;
  totalEstimateIdr?: number | null;
  /** Pemecahan total: sewa ruangan & order menu. */
  roomTotalIdr?: number | null;
  menuTotalIdr?: number | null;
  depositAmountIdr?: number | null;
  depositStatus?: string | null;
  depositProofUrl?: string | null;
  depositProofStorageKey?: string | null;
  deposit1Paid?: boolean;
  /** DP2 & pelunasan sudah ditetapkan sistem saat reservasi dibuat. */
  deposit2AmountIdr?: number | null;
  deposit2Status?: string | null;
  settlementAmountIdr?: number | null;
  settlementStatus?: string | null;
  /** Status awal; default 'requested' (alur customer). Admin boleh menimpa. */
  status?: string | null;
}

export async function insertReservation(input: InsertReservationInput, executor: Exec) {
  return one<{ id: string; reservationNumber: string }>(
    executor,
    `INSERT INTO reservations (
        reservation_number, user_id, branch_id, area_id, reserved_for,
        duration_minutes, guest_count, seating_preference, status, special_requests,
        area_price_per_hour_idr, total_estimate_idr, room_total_idr, menu_total_idr,
        deposit_amount_idr, deposit_status, deposit_proof_url, deposit_proof_storage_key,
        deposit_paid_at,
        deposit2_amount_idr, deposit2_status,
        settlement_amount_idr, settlement_status,
        contact_name, contact_phone
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($10,'requested'),$9,
               $11,$12,$13,$14,$15,COALESCE($16,'unpaid'),$17,$18,
               CASE WHEN $19::boolean THEN now() ELSE NULL END,
               $20,COALESCE($21,'unpaid'),
               $22,COALESCE($23,'unpaid'),
               $24,$25)
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
      input.status ?? null,
      input.areaPricePerHourIdr ?? null,
      input.totalEstimateIdr ?? null,
      input.roomTotalIdr ?? null,
      input.menuTotalIdr ?? null,
      input.depositAmountIdr ?? null,
      input.depositStatus ?? null,
      input.depositProofUrl ?? null,
      input.depositProofStorageKey ?? null,
      input.deposit1Paid ?? false,
      input.deposit2AmountIdr ?? null,
      input.deposit2Status ?? null,
      input.settlementAmountIdr ?? null,
      input.settlementStatus ?? null,
      input.contactName ?? null,
      input.contactPhone ?? null,
    ],
  );
}

/** Satu baris order menu yang menyertai reservasi. */
export interface ReservationMenuItemInput {
  productId: string;
  variantId: string;
  productName: string;
  variantName: string | null;
  quantity: number;
  unitPriceIdr: number;
  modifiersTotalIdr: number;
  lineTotalIdr: number;
  note?: string | null;
}

/** Simpan order menu reservasi (makanan/minuman). */
export async function insertReservationMenuItems(
  reservationId: string,
  items: ReservationMenuItemInput[],
  executor: Exec,
) {
  if (items.length === 0) return;
  await executor.query(
    `INSERT INTO reservation_menu_items (
        reservation_id, product_id, variant_id, product_name, variant_name,
        quantity, unit_price_idr, modifiers_total_idr, line_total_idr, note
     )
     SELECT $1, x.product_id, x.variant_id, x.product_name, x.variant_name,
            x.quantity, x.unit_price_idr, x.modifiers_total_idr, x.line_total_idr, x.note
       FROM unnest(
              $2::uuid[], $3::uuid[], $4::text[], $5::text[],
              $6::smallint[], $7::bigint[], $8::bigint[], $9::bigint[], $10::text[]
            ) AS x(product_id, variant_id, product_name, variant_name,
                  quantity, unit_price_idr, modifiers_total_idr, line_total_idr, note)`,
    [
      reservationId,
      items.map((item) => item.productId),
      items.map((item) => item.variantId),
      items.map((item) => item.productName),
      items.map((item) => item.variantName),
      items.map((item) => item.quantity),
      items.map((item) => item.unitPriceIdr),
      items.map((item) => item.modifiersTotalIdr),
      items.map((item) => item.lineTotalIdr),
      items.map((item) => item.note ?? null),
    ],
  );
}

/** Daftar order menu sebuah reservasi (urutan pesan). */
export async function listReservationMenuItems(reservationId: string, executor: Exec = db) {
  return many(
    executor,
    `SELECT id, product_id, variant_id, product_name, variant_name,
            quantity, unit_price_idr, modifiers_total_idr, line_total_idr, note
       FROM reservation_menu_items
      WHERE reservation_id = $1
      ORDER BY created_at ASC, id ASC`,
    [reservationId],
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

/**
 * Detail reservasi + kontak pelanggan & cabang (dipakai admin).
 *
 * JOIN ke `users` dan `branches` supaya `user_name`/`user_email`/`user_phone`
 * dan `branch_name`/`branch_phone`/`branch_email`/`branch_address` terisi —
 * sebelumnya endpoint detail tidak men-JOIN sehingga kolom itu kosong.
 */
export async function findReservationById(reservationId: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT ${RESERVATION_COLUMNS},
            u.display_name AS user_name, u.email AS user_email, u.phone_e164 AS user_phone,
            b.name AS branch_name, b.phone AS branch_phone, b.email AS branch_email,
            b.address AS branch_address
       FROM reservations r
       LEFT JOIN users u ON u.id = r.user_id
       LEFT JOIN branches b ON b.id = r.branch_id
      WHERE r.id = $1`,
    [reservationId],
  );
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
  return many<{
    id: string;
    reservationNumber: string;
    reservedFor: string;
    durationMinutes: number;
    status: string;
    guestCount: number;
    roomIds: string[];
  }>(
    executor,
    `SELECT r.id, r.reservation_number, r.reserved_for, r.duration_minutes, r.status,
            r.guest_count,
            COALESCE(
              (SELECT array_agg(rr.area_id) FROM reservation_rooms rr WHERE rr.reservation_id = r.id),
              ARRAY[]::uuid[]
            ) AS room_ids
       FROM reservations r
      WHERE r.branch_id = $1
        AND r.status NOT IN ('cancelled','no_show','completed')
        AND r.reserved_for < $3
        AND (r.reserved_for + make_interval(mins => r.duration_minutes)) > $2
        AND ($4::uuid IS NULL OR r.id <> $4)
      ORDER BY r.reserved_for ASC`,
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
    `UPDATE reservations r SET ${assignments}, updated_at = now()
      WHERE r.id = $1 AND r.user_id = $2
      RETURNING ${RESERVATION_COLUMNS}`,
    [reservationId, userId, ...Object.values(data)],
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
            tables.table_codes,
            rooms.rooms
       FROM reservations r
       JOIN branches b ON b.id = r.branch_id
       LEFT JOIN dining_areas a ON a.id = r.area_id
       LEFT JOIN LATERAL (
         SELECT array_agg(t.table_code ORDER BY t.table_code) AS table_codes
           FROM reservation_tables rt
           JOIN cafe_tables t ON t.id = rt.table_id
          WHERE rt.reservation_id = r.id
       ) tables ON true
       LEFT JOIN LATERAL (
         SELECT json_agg(json_build_object(
                  'areaId', da.id, 'name', da.name, 'areaType', da.area_type,
                  'pricePerHourIdr', da.price_per_hour_idr, 'imageUrl', da.image_url
                ) ORDER BY da.name) AS rooms
           FROM reservation_rooms rr
           JOIN dining_areas da ON da.id = rr.area_id
          WHERE rr.reservation_id = r.id
       ) rooms ON true
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
// Admin: list all reservations with filters
// --------------------------------------------------------------------------
export interface ListAdminReservationFilters {
  branchId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
}

export async function listAdminReservations(
  filters: ListAdminReservationFilters,
  pagination: { page: number; limit: number; offset: number },
  executor: Exec = db,
) {
  return many(
    executor,
    `SELECT r.id, r.reservation_number, r.branch_id, b.name AS branch_name,
            r.area_id, a.name AS area_name, a.area_type,
            r.reserved_for, r.duration_minutes, r.guest_count, r.status,
            u.display_name AS user_name, u.email AS user_email, u.phone_e164 AS user_phone,
            r.contact_name, r.contact_phone,
            r.special_requests, r.created_at,
            r.area_price_per_hour_idr, r.total_estimate_idr,
            r.room_total_idr, r.menu_total_idr,
            r.deposit_amount_idr, r.deposit_status, r.deposit_proof_url, r.deposit_paid_at,
            r.deposit2_amount_idr, r.deposit2_status, r.deposit2_proof_url, r.deposit2_paid_at,
            r.settlement_amount_idr, r.settlement_status, r.settlement_proof_url, r.settlement_paid_at,
            COALESCE(tables.table_codes, ARRAY[]::text[]) AS tables,
            rooms.rooms
       FROM reservations r
       JOIN branches b ON b.id = r.branch_id
       JOIN users u ON u.id = r.user_id
       LEFT JOIN dining_areas a ON a.id = r.area_id
       LEFT JOIN LATERAL (
         SELECT array_agg(ct.table_code ORDER BY ct.table_code) AS table_codes
           FROM reservation_tables rt
           JOIN cafe_tables ct ON ct.id = rt.table_id
          WHERE rt.reservation_id = r.id
       ) tables ON true
       LEFT JOIN LATERAL (
         SELECT json_agg(json_build_object(
                  'areaId', da.id, 'name', da.name, 'areaType', da.area_type,
                  'pricePerHourIdr', da.price_per_hour_idr, 'imageUrl', da.image_url
                ) ORDER BY da.name) AS rooms
           FROM reservation_rooms rr
           JOIN dining_areas da ON da.id = rr.area_id
          WHERE rr.reservation_id = r.id
       ) rooms ON true
      WHERE ($1::uuid IS NULL OR r.branch_id = $1)
        AND ($2::text IS NULL OR r.status = $2)
        AND ($3::date IS NULL OR (r.reserved_for AT TIME ZONE 'Asia/Jakarta')::date >= $3::date)
        AND ($4::date IS NULL OR (r.reserved_for AT TIME ZONE 'Asia/Jakarta')::date <= $4::date)
        AND ($5::text IS NULL OR r.reservation_number ILIKE '%' || $5 || '%'
                                  OR u.display_name ILIKE '%' || $5 || '%'
                                  OR u.email ILIKE '%' || $5 || '%'
                                  OR u.phone_e164 ILIKE '%' || $5 || '%'
                                  OR r.contact_name ILIKE '%' || $5 || '%'
                                  OR r.contact_phone ILIKE '%' || $5 || '%')
      ORDER BY r.created_at DESC
      LIMIT $6 OFFSET $7`,
    [
      filters.branchId ?? null,
      filters.status ?? null,
      filters.dateFrom ?? null,
      filters.dateTo ?? null,
      filters.q ?? null,
      pagination.limit,
      pagination.offset,
    ],
  );
}

export async function countAdminReservations(filters: ListAdminReservationFilters, executor: Exec = db) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int
       FROM reservations r
       JOIN users u ON u.id = r.user_id
      WHERE ($1::uuid IS NULL OR r.branch_id = $1)
        AND ($2::text IS NULL OR r.status = $2)
        AND ($3::date IS NULL OR (r.reserved_for AT TIME ZONE 'Asia/Jakarta')::date >= $3::date)
        AND ($4::date IS NULL OR (r.reserved_for AT TIME ZONE 'Asia/Jakarta')::date <= $4::date)
        AND ($5::text IS NULL OR r.reservation_number ILIKE '%' || $5 || '%'
                                  OR u.display_name ILIKE '%' || $5 || '%'
                                  OR u.email ILIKE '%' || $5 || '%'
                                  OR u.phone_e164 ILIKE '%' || $5 || '%'
                                  OR r.contact_name ILIKE '%' || $5 || '%'
                                  OR r.contact_phone ILIKE '%' || $5 || '%')`,
    [
      filters.branchId ?? null,
      filters.status ?? null,
      filters.dateFrom ?? null,
      filters.dateTo ?? null,
      filters.q ?? null,
    ],
  );
  return Number(value ?? 0);
}

/** Satu reservasi dengan info pengguna + kode meja, memakai bentuk yang sama
 *  seperti listAdminReservations (dipakai setelah tambah/ubah reservasi). */
export async function findAdminReservationById(reservationId: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT r.id, r.reservation_number, r.branch_id, b.name AS branch_name,
            r.reserved_for, r.duration_minutes, r.guest_count, r.status,
            u.display_name AS user_name, u.email AS user_email, u.phone_e164 AS user_phone,
            r.contact_name, r.contact_phone,
            r.special_requests, r.created_at,
            ARRAY_AGG(ct.table_code) FILTER (WHERE ct.table_code IS NOT NULL) AS tables
       FROM reservations r
       JOIN branches b ON b.id = r.branch_id
       JOIN users u ON u.id = r.user_id
       LEFT JOIN reservation_tables rt ON rt.reservation_id = r.id
       LEFT JOIN cafe_tables ct ON ct.id = rt.table_id
      WHERE r.id = $1
      GROUP BY r.id, r.reservation_number, r.branch_id, b.name, r.reserved_for,
               r.duration_minutes, r.guest_count, r.status, u.display_name,
               u.email, u.phone_e164, r.special_requests, r.created_at`,
    [reservationId],
  );
}

export async function updateReservationStatusByStaff(
  reservationId: string,
  status: string,
  executor: Exec = db,
) {
  return one(
    executor,
    `UPDATE reservations SET status = $2, updated_at = now() WHERE id = $1 RETURNING id`,
    [reservationId, status],
  );
}

export interface UpdateDepositStageInput {
  amountIdr?: number | null;
  status?: string | null;
  proofUrl?: string | null;
  proofStorageKey?: string | null;
  note?: string | null;
  /** Tandai waktu pembayaran bila status jadi 'paid'. */
  markPaid?: boolean;
}

/**
 * Perbarui salah satu tahap DP. `prefix` menentukan kolom:
 *   '' → DP1 (`deposit_*`), 'deposit2' → DP2, 'settlement' → pelunasan.
 * Field `undefined` tidak diubah; `null` mengosongkan.
 */
export async function updateReservationDepositStage(
  reservationId: string,
  prefix: '' | 'deposit2' | 'settlement',
  input: UpdateDepositStageInput,
  executor: Exec = db,
) {
  const col = (suffix: string) => (prefix ? `${prefix}_${suffix}` : `deposit_${suffix}`);
  return one(
    executor,
    `UPDATE reservations
        SET ${col('amount_idr')} = CASE WHEN $2::boolean THEN $3 ELSE ${col('amount_idr')} END,
            ${col('status')} = COALESCE($4, ${col('status')}),
            ${col('proof_url')} = CASE WHEN $5::boolean THEN $6 ELSE ${col('proof_url')} END,
            ${col('proof_storage_key')} = CASE WHEN $7::boolean THEN $8 ELSE ${col('proof_storage_key')} END,
            ${col('note')} = CASE WHEN $9::boolean THEN $10 ELSE ${col('note')} END,
            ${col('paid_at')} = CASE
              WHEN $11::boolean AND $4 = 'paid' THEN now()
              WHEN $4 IS NOT NULL AND $4 <> 'paid' THEN NULL
              ELSE ${col('paid_at')}
            END,
            updated_at = now()
      WHERE id = $1
      RETURNING id`,
    [
      reservationId,
      input.amountIdr !== undefined,
      input.amountIdr ?? null,
      input.status ?? null,
      input.proofUrl !== undefined,
      input.proofUrl ?? null,
      input.proofStorageKey !== undefined,
      input.proofStorageKey ?? null,
      input.note !== undefined,
      input.note ?? null,
      input.markPaid ?? false,
    ],
  );
}

export interface UpdateReservationDepositInput {
  depositAmountIdr?: number | null;
  depositStatus?: string | null;
  depositProofUrl?: string | null;
  depositProofStorageKey?: string | null;
  depositNote?: string | null;
  /** Tandai waktu pembayaran bila status jadi 'paid'. */
  markPaid?: boolean;
}

/** Perbarui data DP1 (tahap awal). Field `undefined` tidak diubah; `null` mengosongkan. */
export async function updateReservationDeposit(
  reservationId: string,
  input: UpdateReservationDepositInput,
  executor: Exec = db,
) {
  return updateReservationDepositStage(
    reservationId,
    '',
    {
      amountIdr: input.depositAmountIdr,
      status: input.depositStatus,
      proofUrl: input.depositProofUrl,
      proofStorageKey: input.depositProofStorageKey,
      note: input.depositNote,
      markPaid: input.markPaid,
    },
    executor,
  );
}

/** Catat perubahan status ke riwayat (untuk notifikasi & jejak audit). */
export async function insertReservationStatusHistory(
  input: {
    reservationId: string;
    fromStatus: string | null;
    toStatus: string;
    note?: string | null;
    actorUserId?: string | null;
  },
  executor: Exec = db,
) {
  return one(
    executor,
    `INSERT INTO reservation_status_history (reservation_id, from_status, to_status, note, actor_user_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      input.reservationId,
      input.fromStatus,
      input.toStatus,
      input.note ?? null,
      input.actorUserId ?? null,
    ],
  );
}

/** Riwayat status sebuah reservasi, terbaru dulu. */
export async function listReservationStatusHistory(reservationId: string, executor: Exec = db) {
  return many(
    executor,
    `SELECT h.id, h.from_status, h.to_status, h.note, h.created_at,
            u.display_name AS actor_name
       FROM reservation_status_history h
       LEFT JOIN users u ON u.id = h.actor_user_id
      WHERE h.reservation_id = $1
      ORDER BY h.created_at DESC`,
    [reservationId],
  );
}

export async function updateReservationTables(
  reservationId: string,
  tableIds: string[],
  executor: Exec = db,
) {
  await executor.query(`DELETE FROM reservation_tables WHERE reservation_id = $1`, [reservationId]);
  if (tableIds.length > 0) {
    await executor.query(
      `INSERT INTO reservation_tables (reservation_id, table_id)
       SELECT $1, unnest($2::uuid[]) ON CONFLICT DO NOTHING`,
      [reservationId, tableIds],
    );
  }
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

// --------------------------------------------------------------------------
// Ruangan reservasi (reservation_rooms) — reservasi per-ruangan
// --------------------------------------------------------------------------
export async function insertReservationRooms(
  reservationId: string,
  areaIds: string[],
  executor: Exec,
) {
  if (areaIds.length === 0) return;
  await executor.query(
    `INSERT INTO reservation_rooms (reservation_id, area_id)
     SELECT $1, unnest($2::uuid[])
     ON CONFLICT DO NOTHING`,
    [reservationId, areaIds],
  );
}

export async function replaceReservationRooms(
  reservationId: string,
  areaIds: string[],
  executor: Exec,
) {
  await executor.query(`DELETE FROM reservation_rooms WHERE reservation_id = $1`, [reservationId]);
  await insertReservationRooms(reservationId, areaIds, executor);
}

export async function listReservationRooms(reservationId: string, executor: Exec = db) {
  return many(
    executor,
    `SELECT rr.area_id, a.name, a.area_type, a.price_per_hour_idr, a.image_url
       FROM reservation_rooms rr
       JOIN dining_areas a ON a.id = rr.area_id
      WHERE rr.reservation_id = $1
      ORDER BY a.name`,
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
        AND r.status NOT IN ('cancelled','no_show','completed')
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
             AND r.status NOT IN ('cancelled','no_show','completed')
             AND r.reserved_for < $4
             AND (r.reserved_for + make_interval(mins => r.duration_minutes)) > $3
        )
      ORDER BY t.capacity ASC, t.table_code ASC
      LIMIT 20`,
    [branchId, minCapacity, start, end],
  );
}

/**
 * Hapus reservasi beserta riwayat pembayarannya. Baris riwayat status, menu,
 * dan ruangan ikut terhapus lewat cascade FK. `payment_transactions` memakai
 * ON DELETE RESTRICT, jadi harus dihapus lebih dulu di dalam transaksi yang sama.
 */
export async function deleteReservation(reservationId: string, executor: Exec = db) {
  await executor.query(`DELETE FROM payment_transactions WHERE reservation_id = $1`, [reservationId]);
  await executor.query(`DELETE FROM reservations WHERE id = $1`, [reservationId]);
}

// --------------------------------------------------------------------------
// Pengaturan DP reservasi (satu baris konfigurasi, id = 1)
// --------------------------------------------------------------------------

export interface DepositSettingsRow {
  dp1Percent: number;
  dp1MinIdr: number;
  dp1MaxIdr: number;
  dp2Percent: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

const DEPOSIT_SETTINGS_COLUMNS = `
  dp1_percent::float8 AS "dp1Percent",
  dp1_min_idr::int AS "dp1MinIdr",
  dp1_max_idr::int AS "dp1MaxIdr",
  dp2_percent::float8 AS "dp2Percent",
  updated_at AS "updatedAt",
  updated_by AS "updatedBy"
`;

export async function getDepositSettings(executor: Exec = db) {
  return one<DepositSettingsRow>(
    executor,
    `SELECT ${DEPOSIT_SETTINGS_COLUMNS}
       FROM reservation_deposit_settings
      WHERE id = 1`,
  );
}

export interface UpdateDepositSettingsInput {
  dp1Percent: number;
  dp1MinIdr: number;
  dp1MaxIdr: number;
  dp2Percent: number;
}

export async function updateDepositSettings(
  input: UpdateDepositSettingsInput,
  actorUserId: string,
  executor: Exec = db,
) {
  return one<DepositSettingsRow>(
    executor,
    `UPDATE reservation_deposit_settings
        SET dp1_percent = $1,
            dp1_min_idr = $2,
            dp1_max_idr = $3,
            dp2_percent = $4,
            updated_by = $5
      WHERE id = 1
      RETURNING ${DEPOSIT_SETTINGS_COLUMNS}`,
    [
      input.dp1Percent,
      input.dp1MinIdr,
      input.dp1MaxIdr,
      input.dp2Percent,
      actorUserId,
    ],
  );
}