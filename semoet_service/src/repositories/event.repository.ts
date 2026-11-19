import { db, many, one, scalar, type Exec } from './base.js';
import { paginationSql, type Paging } from '../utils/pagination.js';

// --------------------------------------------------------------------------
// Packages
// --------------------------------------------------------------------------
export async function listEventPackages(
  filters: { isActive?: boolean; minGuests?: number; maxGuests?: number },
  executor: Exec = db,
) {
  return many(
    executor,
    `SELECT id, code, name, description, base_price_idr, minimum_guests, maximum_guests,
            inclusions, is_active, created_at, updated_at
       FROM event_packages
      WHERE ($1::boolean IS NULL OR is_active = $1)
        AND ($2::int IS NULL OR minimum_guests <= $2)
        AND ($3::int IS NULL OR maximum_guests IS NULL OR maximum_guests >= $3)
      ORDER BY base_price_idr ASC`,
    [filters.isActive ?? null, filters.minGuests ?? null, filters.maxGuests ?? null],
  );
}

export async function findEventPackageByCode(code: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT id, code, name, description, base_price_idr, minimum_guests, maximum_guests,
            inclusions, is_active, created_at, updated_at
       FROM event_packages
      WHERE code = $1`,
    [code],
  );
}

export async function findEventPackageById(packageId: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT id, code, name, description, base_price_idr, minimum_guests, maximum_guests,
            inclusions, is_active
       FROM event_packages
      WHERE id = $1`,
    [packageId],
  );
}

export async function listCateringPackages(
  filters: { isActive?: boolean; minGuests?: number; maxGuests?: number },
  executor: Exec = db,
) {
  return many(
    executor,
    `SELECT id, code, name, description, price_per_person_idr, minimum_guests, maximum_guests,
            menu_details, lead_time_hours, is_active, created_at, updated_at
       FROM catering_packages
      WHERE ($1::boolean IS NULL OR is_active = $1)
        AND ($2::int IS NULL OR minimum_guests <= $2)
        AND ($3::int IS NULL OR maximum_guests IS NULL OR maximum_guests >= $3)
      ORDER BY price_per_person_idr ASC`,
    [filters.isActive ?? null, filters.minGuests ?? null, filters.maxGuests ?? null],
  );
}

export async function findCateringPackageByCode(code: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT id, code, name, description, price_per_person_idr, minimum_guests, maximum_guests,
            menu_details, lead_time_hours, is_active, created_at, updated_at
       FROM catering_packages
      WHERE code = $1`,
    [code],
  );
}

export async function findCateringPackageById(packageId: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT id, code, name, description, price_per_person_idr, minimum_guests, maximum_guests,
            menu_details, lead_time_hours, is_active
       FROM catering_packages
      WHERE id = $1`,
    [packageId],
  );
}

/** Validasi banyak paket sekaligus saat booking (wajib lead_time_hours). */
export async function findCateringPackagesByIds(packageIds: string[], executor: Exec = db) {
  if (packageIds.length === 0) return [];
  return many(
    executor,
    `SELECT id, code, name, price_per_person_idr, minimum_guests, maximum_guests, lead_time_hours, is_active
       FROM catering_packages
      WHERE id = ANY($1::uuid[])`,
    [packageIds],
  );
}

// --------------------------------------------------------------------------
// Bookings
// --------------------------------------------------------------------------
const BOOKING_COLUMNS = `
  eb.id, eb.booking_number, eb.user_id, eb.branch_id, eb.event_package_id,
  eb.event_type, eb.event_name, eb.starts_at, eb.ends_at, eb.guest_count,
  eb.event_package_name_snapshot, eb.event_package_price_snapshot_idr,
  eb.subtotal_idr, eb.deposit_idr, eb.status, eb.custom_requests, eb.created_at, eb.updated_at
`;

export interface InsertEventBookingInput {
  bookingNumber: string;
  userId: string;
  branchId: string;
  eventPackageId?: string | null;
  eventType: string;
  eventName?: string | null;
  startsAt: Date;
  endsAt?: Date | null;
  guestCount: number;
  eventPackageNameSnapshot?: string | null;
  eventPackagePriceSnapshotIdr: number;
  subtotalIdr: number;
  depositIdr: number;
  status: string;
  customRequests?: string | null;
}

export async function insertEventBooking(input: InsertEventBookingInput, executor: Exec) {
  return one<{ id: string; bookingNumber: string }>(
    executor,
    `INSERT INTO event_bookings (
        booking_number, user_id, branch_id, event_package_id, event_type, event_name,
        starts_at, ends_at, guest_count, event_package_name_snapshot,
        event_package_price_snapshot_idr, subtotal_idr, deposit_idr, status, custom_requests
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING id, booking_number, created_at`,
    [
      input.bookingNumber,
      input.userId,
      input.branchId,
      input.eventPackageId ?? null,
      input.eventType,
      input.eventName ?? null,
      input.startsAt,
      input.endsAt ?? null,
      input.guestCount,
      input.eventPackageNameSnapshot ?? null,
      input.eventPackagePriceSnapshotIdr,
      input.subtotalIdr,
      input.depositIdr,
      input.status,
      input.customRequests ?? null,
    ],
  );
}

export async function bookingNumberExists(bookingNumber: string, executor: Exec = db) {
  const value = await scalar<boolean>(
    executor,
    `SELECT EXISTS (SELECT 1 FROM event_bookings WHERE booking_number = $1)`,
    [bookingNumber],
  );
  return Boolean(value);
}

export async function findBookingById(bookingId: string, executor: Exec = db) {
  return one(executor, `SELECT ${BOOKING_COLUMNS} FROM event_bookings eb WHERE eb.id = $1`, [bookingId]);
}

export async function findBookingForUser(bookingId: string, userId: string, executor: Exec = db) {
  return one(executor, `SELECT ${BOOKING_COLUMNS} FROM event_bookings eb WHERE eb.id = $1 AND eb.user_id = $2`, [
    bookingId,
    userId,
  ]);
}

export async function lockBookingForUser(bookingId: string, userId: string, executor: Exec) {
  return one(
    executor,
    `SELECT ${BOOKING_COLUMNS} FROM event_bookings eb WHERE eb.id = $1 AND eb.user_id = $2 FOR UPDATE`,
    [bookingId, userId],
  );
}

export async function updateBookingStatus(
  bookingId: string,
  data: Record<string, unknown>,
  userId: string | null,
  executor: Exec = db,
) {
  const columns = Object.keys(data);
  if (columns.length === 0) return null;
  const assignments = columns.map((column, index) => `${column} = $${index + 3}`).join(', ');
  return one(
    executor,
    `UPDATE event_bookings eb SET ${assignments}, updated_at = now()
      WHERE eb.id = $1 AND ($2::uuid IS NULL OR eb.user_id = $2)
      RETURNING ${BOOKING_COLUMNS}`,
    [bookingId, userId, ...Object.values(data)],
  );
}

export async function listBookingsForUser(
  userId: string,
  filters: { status?: string },
  pagination: Paging,
  executor: Exec = db,
) {
  return many(
    executor,
    `SELECT ${BOOKING_COLUMNS},
            b.name AS branch_name, b.code AS branch_code,
            ep.code AS event_package_code,
            catering.line_total_idr AS catering_total_idr,
            addons.line_total_idr AS addons_total_idr
       FROM event_bookings eb
       JOIN branches b ON b.id = eb.branch_id
       LEFT JOIN event_packages ep ON ep.id = eb.event_package_id
       LEFT JOIN LATERAL (
         SELECT SUM(line_total_idr)::bigint AS line_total_idr
           FROM event_booking_catering WHERE event_booking_id = eb.id
       ) catering ON true
       LEFT JOIN LATERAL (
         SELECT SUM(line_total_idr)::bigint AS line_total_idr
           FROM event_booking_addons WHERE event_booking_id = eb.id
       ) addons ON true
      WHERE eb.user_id = $1
        AND ($2::text IS NULL OR eb.status = $2)
      ORDER BY eb.starts_at DESC
      ${paginationSql(pagination)}`,
    [userId, filters.status ?? null],
  );
}

export async function countBookingsForUser(userId: string, status?: string, executor: Exec = db) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int FROM event_bookings WHERE user_id = $1 AND ($2::text IS NULL OR status = $2)`,
    [userId, status ?? null],
  );
  return Number(value ?? 0);
}

export async function listBookingsForBranch(
  filters: { status?: string; branchId?: string },
  pagination: Paging,
  executor: Exec = db,
) {
  return many(
    executor,
    `SELECT ${BOOKING_COLUMNS},
            b.name AS branch_name, u.display_name AS user_name, u.phone_e164 AS user_phone
       FROM event_bookings eb
       JOIN branches b ON b.id = eb.branch_id
       JOIN users u ON u.id = eb.user_id
      WHERE ($1::text IS NULL OR eb.status = $1)
        AND ($2::uuid IS NULL OR eb.branch_id = $2)
      ORDER BY eb.starts_at DESC
      ${paginationSql(pagination)}`,
    [filters.status ?? null, filters.branchId ?? null],
  );
}

export async function countBookingsForBranch(filters: { status?: string; branchId?: string }, executor: Exec = db) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int
       FROM event_bookings
      WHERE ($1::text IS NULL OR status = $1)
        AND ($2::uuid IS NULL OR branch_id = $2)`,
    [filters.status ?? null, filters.branchId ?? null],
  );
  return Number(value ?? 0);
}

// --------------------------------------------------------------------------
// Admin: list all event bookings with filters
// --------------------------------------------------------------------------
export interface ListAdminEventBookingFilters {
  branchId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
}

export async function listAdminEventBookings(
  filters: ListAdminEventBookingFilters,
  pagination: { page: number; limit: number; offset: number },
  executor: Exec = db,
) {
  return many(
    executor,
    `SELECT eb.id, eb.booking_number, eb.branch_id, b.name AS branch_name,
            eb.event_type, eb.event_name, eb.starts_at, eb.ends_at, eb.guest_count,
            eb.event_package_name_snapshot, eb.event_package_price_snapshot_idr,
            eb.subtotal_idr, eb.deposit_idr, eb.status,
            COALESCE(
              (SELECT SUM(pt.amount_idr) FROM payment_transactions pt
                WHERE pt.event_booking_id = eb.id
                  AND pt.status = 'succeeded' AND pt.transaction_type = 'charge'), 0
            )::bigint AS paid_idr,
            u.display_name AS user_name, u.email AS user_email, u.phone_e164 AS user_phone,
            eb.custom_requests, eb.created_at,
            COALESCE(
              (SELECT json_agg(json_build_object(
                  'id', ebc.id,
                  'cateringPackageId', ebc.catering_package_id,
                  'packageName', ebc.package_name_snapshot,
                  'pricePerPersonIdr', ebc.price_per_person_snapshot_idr,
                  'guestCount', ebc.guest_count,
                  'lineTotalIdr', ebc.line_total_idr
              )) FROM event_booking_catering ebc WHERE ebc.event_booking_id = eb.id), '[]'
            ) AS catering,
            COALESCE(
              (SELECT json_agg(json_build_object(
                  'id', eba.id,
                  'name', eba.name,
                  'quantity', eba.quantity,
                  'unitPriceIdr', eba.unit_price_idr,
                  'lineTotalIdr', eba.line_total_idr
              )) FROM event_booking_addons eba WHERE eba.event_booking_id = eb.id), '[]'
            ) AS addons
       FROM event_bookings eb
       JOIN branches b ON b.id = eb.branch_id
       JOIN users u ON u.id = eb.user_id
      WHERE ($1::uuid IS NULL OR eb.branch_id = $1)
        AND ($2::text IS NULL OR eb.status = $2)
        AND ($3::date IS NULL OR (eb.starts_at AT TIME ZONE 'Asia/Jakarta')::date >= $3::date)
        AND ($4::date IS NULL OR (eb.starts_at AT TIME ZONE 'Asia/Jakarta')::date <= $4::date)
        AND ($5::text IS NULL OR eb.booking_number ILIKE '%' || $5 || '%'
                                  OR u.display_name ILIKE '%' || $5 || '%'
                                  OR u.email ILIKE '%' || $5 || '%'
                                  OR u.phone_e164 ILIKE '%' || $5 || '%'
                                  OR eb.event_name ILIKE '%' || $5 || '%')
      ORDER BY eb.created_at DESC
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

export async function countAdminEventBookings(filters: ListAdminEventBookingFilters, executor: Exec = db) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int
       FROM event_bookings eb
       JOIN users u ON u.id = eb.user_id
      WHERE ($1::uuid IS NULL OR eb.branch_id = $1)
        AND ($2::text IS NULL OR eb.status = $2)
        AND ($3::date IS NULL OR (eb.starts_at AT TIME ZONE 'Asia/Jakarta')::date >= $3::date)
        AND ($4::date IS NULL OR (eb.starts_at AT TIME ZONE 'Asia/Jakarta')::date <= $4::date)
        AND ($5::text IS NULL OR eb.booking_number ILIKE '%' || $5 || '%'
                                  OR u.display_name ILIKE '%' || $5 || '%'
                                  OR u.email ILIKE '%' || $5 || '%'
                                  OR u.phone_e164 ILIKE '%' || $5 || '%'
                                  OR eb.event_name ILIKE '%' || $5 || '%')`,
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

export async function updateEventBookingStatus(
  bookingId: string,
  status: string,
  note: string | null,
  quoteIdr: number | null,
  depositPercent: number | null,
  executor: Exec = db,
) {
  const updates: string[] = ['status = $2', 'updated_at = now()'];
  const params: (string | number | null)[] = [bookingId, status];
  let paramIndex = 3;

  if (note !== null) {
    updates.push(`custom_requests = COALESCE(custom_requests, '') || '\n[Staff ' + now() + '] ' || $${paramIndex}`);
    params.push(note);
    paramIndex++;
  }
  if (quoteIdr !== null) {
    updates.push(`event_package_price_snapshot_idr = $${paramIndex}`);
    params.push(quoteIdr);
    paramIndex++;
    updates.push(`subtotal_idr = $${paramIndex}`);
    params.push(quoteIdr);
    paramIndex++;
    if (depositPercent !== null) {
      updates.push(`deposit_idr = ($${paramIndex - 1} * $${paramIndex} / 100)::bigint`);
      params.push(depositPercent);
      paramIndex++;
    }
  }

  return one(
    executor,
    `UPDATE event_bookings eb SET ${updates.join(', ')} WHERE eb.id = $1 RETURNING ${BOOKING_COLUMNS}`,
    params,
  );
}

/** Konflik jadwal: cabang sudah punya event pada tanggal/waktu yang sama. */
export async function findConflictingBookings(
  branchId: string,
  startsAt: Date,
  endsAt: Date | null,
  excludeBookingId: string | null,
  executor: Exec,
) {
  return many<{ id: string; bookingNumber: string; eventName: string | null; startsAt: string; guestCount: number }>(
    executor,
    `SELECT id, booking_number, event_name, starts_at, guest_count
       FROM event_bookings
      WHERE branch_id = $1
        AND status NOT IN ('cancelled')
        AND starts_at < COALESCE($3::timestamptz, $2::timestamptz + interval '4 hours')
        AND COALESCE(ends_at, starts_at + interval '4 hours') > $2::timestamptz
        AND ($4::uuid IS NULL OR id <> $4)
      ORDER BY starts_at ASC`,
    [branchId, startsAt, endsAt, excludeBookingId],
  );
}

// --------------------------------------------------------------------------
// Detail booking (event_booking_catering & event_booking_addons)
// --------------------------------------------------------------------------
export async function insertBookingCatering(
  input: {
    eventBookingId: string;
    cateringPackageId?: string | null;
    packageNameSnapshot: string;
    pricePerPersonSnapshotIdr: number;
    guestCount: number;
  },
  executor: Exec,
) {
  await executor.query(
    `INSERT INTO event_booking_catering (
        event_booking_id, catering_package_id, package_name_snapshot,
        price_per_person_snapshot_idr, guest_count, line_total_idr
     ) VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      input.eventBookingId,
      input.cateringPackageId ?? null,
      input.packageNameSnapshot,
      input.pricePerPersonSnapshotIdr,
      input.guestCount,
      input.pricePerPersonSnapshotIdr * input.guestCount,
    ],
  );
}

export async function insertBookingAddon(
  input: { eventBookingId: string; name: string; quantity: number; unitPriceIdr: number },
  executor: Exec,
) {
  await executor.query(
    `INSERT INTO event_booking_addons (event_booking_id, name, quantity, unit_price_idr, line_total_idr)
     VALUES ($1,$2,$3,$4,$5)`,
    [input.eventBookingId, input.name, input.quantity, input.unitPriceIdr, input.quantity * input.unitPriceIdr],
  );
}

export async function listBookingCatering(eventBookingId: string, executor: Exec = db) {
  return many(
    executor,
    `SELECT ebc.id, ebc.event_booking_id, ebc.catering_package_id, ebc.package_name_snapshot,
            ebc.price_per_person_snapshot_idr, ebc.guest_count, ebc.line_total_idr,
            cp.code AS package_code
       FROM event_booking_catering ebc
       LEFT JOIN catering_packages cp ON cp.id = ebc.catering_package_id
      WHERE ebc.event_booking_id = $1
      ORDER BY ebc.package_name_snapshot`,
    [eventBookingId],
  );
}

export async function listBookingAddons(eventBookingId: string, executor: Exec = db) {
  return many(
    executor,
    `SELECT id, event_booking_id, name, quantity, unit_price_idr, line_total_idr
       FROM event_booking_addons
      WHERE event_booking_id = $1
      ORDER BY id`,
    [eventBookingId],
  );
}

export async function listEventBookingsPayments(eventBookingId: string, executor: Exec = db) {
  return many(
    executor,
    `SELECT id, provider, payment_method, provider_reference, payment_purpose, transaction_type,
            status, amount_idr, paid_at, created_at
       FROM payment_transactions
      WHERE event_booking_id = $1
      ORDER BY created_at DESC`,
    [eventBookingId],
  );
}

export async function sumEventBookingPaid(eventBookingId: string, executor: Exec = db) {
  const value = await scalar<number>(
    executor,
    `SELECT COALESCE(SUM(amount_idr), 0)::bigint
       FROM payment_transactions
      WHERE event_booking_id = $1 AND status = 'succeeded' AND transaction_type = 'charge'`,
    [eventBookingId],
  );
  return Number(value ?? 0);
}

/** Slot tanggal yang sudah dipakai untuk_branch (untuk halaman "cek ketersediaan"). */
export async function listBookedDates(branchId: string | undefined, from: Date, to: Date, executor: Exec = db) {
  return many<{ date: string; totalBookings: number }>(
    executor,
    `SELECT (starts_at AT TIME ZONE 'Asia/Jakarta')::date AS date, COUNT(*)::int AS total_bookings
       FROM event_bookings
      WHERE ($1::uuid IS NULL OR branch_id = $1)
        AND status <> 'cancelled'
        AND starts_at BETWEEN $2 AND $3
      GROUP BY (starts_at AT TIME ZONE 'Asia/Jakarta')::date
      ORDER BY date`,
    [branchId ?? null, from, to],
  );
}

/**
 * Hapus booking event beserta riwayat pembayarannya. Baris katering & add-on
 * ikut terhapus lewat cascade FK. payment_transactions memakai ON DELETE
 * RESTRICT, jadi harus dihapus lebih dulu di dalam transaksi yang sama.
 */
export async function deleteEventBooking(bookingId: string, executor: Exec = db) {
  await executor.query(`DELETE FROM payment_transactions WHERE event_booking_id = $1`, [bookingId]);
  await executor.query(`DELETE FROM event_bookings WHERE id = $1`, [bookingId]);
}

// --------------------------------------------------------------------------
// Agenda event (penanda tanggal: Ramadan, Lebaran, promo musiman, dsb)
// --------------------------------------------------------------------------

/**
 * Tanggal disimpan sebagai `date`; di-cast ke teks supaya API selalu menerima
 * "YYYY-MM-DD" tanpa terpengaruh timezone server.
 */
const AGENDA_COLUMNS = `id, title, description,
       to_char(starts_on, 'YYYY-MM-DD') AS starts_on,
       to_char(ends_on, 'YYYY-MM-DD') AS ends_on,
       is_active, created_by, created_at, updated_at`;

export interface ListEventAgendaFilters {
  isActive?: boolean;
  /** Hanya agenda yang beririsan dengan rentang ini. */
  from?: string;
  to?: string;
  q?: string;
}

export async function listEventAgenda(
  filters: ListEventAgendaFilters,
  pagination: Paging,
  executor: Exec = db,
) {
  return many(
    executor,
    `SELECT ${AGENDA_COLUMNS}
       FROM event_agenda
      WHERE ($1::boolean IS NULL OR is_active = $1)
        AND ($2::date IS NULL OR ends_on >= $2::date)
        AND ($3::date IS NULL OR starts_on <= $3::date)
        AND ($4::text IS NULL OR title ILIKE '%' || $4 || '%'
                                  OR description ILIKE '%' || $4 || '%')
      ORDER BY starts_on ASC, title ASC
      ${paginationSql(pagination)}`,
    [filters.isActive ?? null, filters.from ?? null, filters.to ?? null, filters.q ?? null],
  );
}

export async function countEventAgenda(filters: ListEventAgendaFilters, executor: Exec = db) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int
       FROM event_agenda
      WHERE ($1::boolean IS NULL OR is_active = $1)
        AND ($2::date IS NULL OR ends_on >= $2::date)
        AND ($3::date IS NULL OR starts_on <= $3::date)
        AND ($4::text IS NULL OR title ILIKE '%' || $4 || '%'
                                  OR description ILIKE '%' || $4 || '%')`,
    [filters.isActive ?? null, filters.from ?? null, filters.to ?? null, filters.q ?? null],
  );
  return Number(value ?? 0);
}

export async function findEventAgendaById(agendaId: string, executor: Exec = db) {
  return one(executor, `SELECT ${AGENDA_COLUMNS} FROM event_agenda WHERE id = $1`, [agendaId]);
}

export interface InsertEventAgendaInput {
  title: string;
  description: string | null;
  startsOn: string;
  endsOn: string;
  isActive: boolean;
  createdBy: string | null;
}

export async function insertEventAgenda(input: InsertEventAgendaInput, executor: Exec = db) {
  return one(
    executor,
    `INSERT INTO event_agenda (title, description, starts_on, ends_on, is_active, created_by)
     VALUES ($1, $2, $3::date, $4::date, $5, $6)
     RETURNING ${AGENDA_COLUMNS}`,
    [input.title, input.description, input.startsOn, input.endsOn, input.isActive, input.createdBy],
  );
}

export interface UpdateEventAgendaInput {
  title?: string;
  description?: string | null;
  startsOn?: string;
  endsOn?: string;
  isActive?: boolean;
}

/** Update parsial; hanya kolom yang dikirim yang ditulis. */
export async function updateEventAgenda(
  agendaId: string,
  input: UpdateEventAgendaInput,
  executor: Exec = db,
) {
  const assignments: string[] = [];
  const params: unknown[] = [agendaId];

  const push = (column: string, value: unknown, cast = '') => {
    params.push(value);
    assignments.push(`${column} = $${params.length}${cast}`);
  };

  if (input.title !== undefined) push('title', input.title);
  if (input.description !== undefined) push('description', input.description);
  if (input.startsOn !== undefined) push('starts_on', input.startsOn, '::date');
  if (input.endsOn !== undefined) push('ends_on', input.endsOn, '::date');
  if (input.isActive !== undefined) push('is_active', input.isActive);

  if (assignments.length === 0) {
    return findEventAgendaById(agendaId, executor);
  }

  return one(
    executor,
    `UPDATE event_agenda
        SET ${assignments.join(', ')}, updated_at = now()
      WHERE id = $1
      RETURNING ${AGENDA_COLUMNS}`,
    params,
  );
}

export async function deleteEventAgenda(agendaId: string, executor: Exec = db) {
  const deleted = await scalar<string>(
    executor,
    `DELETE FROM event_agenda WHERE id = $1 RETURNING id`,
    [agendaId],
  );
  return Boolean(deleted);
}