import { db, withTransaction } from '../config/database.js';
import {
  RESERVATION_STATUS,
  type ReservationStatus,
  type SeatingPreference,
} from '../config/constants.js';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../errors/AppError.js';
import * as authRepo from '../repositories/auth.repository.js';
import * as branchRepo from '../repositories/branch.repository.js';
import * as reservationRepo from '../repositories/reservation.repository.js';
import { generateReservationNumber } from '../utils/codeGenerator.js';
import { buildPaginationMeta, parsePagination, type Pagination } from '../utils/pagination.js';
import { num, str, strOrNull, toIsoOrNull } from '../utils/serialize.js';
import type {
  CheckAvailabilityQuery,
  CreateReservationInput,
  ListMyReservationQuery,
} from '../validators/reservation.validator.js';

export interface Paginated<T> {
  items: T[];
  meta: ReturnType<typeof buildPaginationMeta>;
}

/** Bentuk input pembatalan; diambil dari cancelReservationSchema. */
export type CancelReservationInput = { reason?: string };

/** Offset WIB untuk membentuk batas hari dan slot tanpa bergantung timezone server. */
const WIB_OFFSET = '+07:00';

/** Durasi default saat menghitung slot ketersediaan yang tidak dikirim. */
const DEFAULT_DURATION_MINUTES = 120;

/** Jumlah tamu default untuk pengecekan ketersediaan. */
const DEFAULT_GUEST_COUNT = 2;

/** Panjang satu slot ketersediaan dalam menit. */
const SLOT_MINUTES = 120;

/** Batas jumlah tanggal yang boleh dicek sekaligus pada endpoint publik. */
const MAX_AVAILABILITY_DAYS = 7;

/** Batas jumlah slot per tanggal supaya query publik tidak terlalu berat. */
const MAX_SLOTS_PER_DAY = 8;

/** Batas percobaan generate nomor reservasi sebelum menyerah. */
const MAX_NUMBER_ATTEMPTS = 5;

/** Status reservasi yang masih boleh dibatalkan oleh pemiliknya. */
const CANCELLABLE_STATUS: ReservationStatus[] = ['requested', 'confirmed'];

type TableRow = Record<string, unknown>;

// --------------------------------------------------------------------------
// Helper shaping
// --------------------------------------------------------------------------
function shapeTable(row: TableRow) {
  return {
    id: str(row.id),
    areaId: strOrNull(row.areaId),
    tableCode: strOrNull(row.tableCode),
    capacity: num(row.capacity),
    areaName: strOrNull(row.areaName),
    areaType: strOrNull(row.areaType),
  };
}

function shapeReservation(row: TableRow) {
  const tableCodes = Array.isArray(row.tableCodes)
    ? row.tableCodes.map((code) => String(code))
    : null;

  return {
    id: str(row.id),
    reservationNumber: str(row.reservationNumber),
    userId: str(row.userId),
    branchId: str(row.branchId),
    branchName: strOrNull(row.branchName),
    branchCode: strOrNull(row.branchCode),
    branchAddress: strOrNull(row.branchAddress),
    areaId: strOrNull(row.areaId),
    areaName: strOrNull(row.areaName),
    areaType: strOrNull(row.areaType),
    reservedFor: toIsoOrNull(row.reservedFor),
    durationMinutes: num(row.durationMinutes),
    guestCount: num(row.guestCount),
    seatingPreference: strOrNull(row.seatingPreference),
    status: str(row.status),
    specialRequests: strOrNull(row.specialRequests),
    tableCodes,
    createdAt: toIsoOrNull(row.createdAt),
    updatedAt: toIsoOrNull(row.updatedAt),
  };
}

/**
 * Kontak taken dari akun pemilik reservasi. Tabel reservations tidak
 * menyimpan kolom kontak, jadi data ini disalin dari profil user.
 */
async function loadContact(userId: string) {
  const user = await authRepo.findUserById(userId);
  if (!user) return null;
  return {
    name: strOrNull(user.displayName),
    email: strOrNull(user.email),
    phone: strOrNull(user.phoneE164),
  };
}

/** Parse ISO datetime; null bila formatnya tidak terbaca. */
function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Tanggal 'YYYY-MM-DD' pada zona WIB dari nilai date/time ISO. */
function toWibDate(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const pick = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

/** Ubah 'YYYY-MM-DD' menjadi Date tengah malam WIB. */
function fromWibDate(date: string): Date {
  return new Date(`${date}T00:00:00${WIB_OFFSET}`);
}

/** Tanggal berikutnya dalam format 'YYYY-MM-DD'. */
function nextWibDate(date: string): string {
  const current = fromWibDate(date);
  current.setUTCDate(current.getUTCDate() + 1);
  return current.toISOString().slice(0, 10);
}

/** 'HH:mm' dari jam operasional cabang menjadi datetime WIB pada sebuah tanggal. */
function slotDate(date: string, time: unknown): Date {
  const raw = str(time);
  const normalized = raw.length === 5 ? `${raw}:00` : raw;
  return new Date(`${date}T${normalized.length > 0 ? normalized : '00:00:00'}${WIB_OFFSET}`);
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

/** 0=Minggu ... 6=Sabtu, mengikuti CHECK day_of_week di branch_business_hours. */
function dayOfWeek(date: string): number {
  return fromWibDate(date).getUTCDay();
}

/** Preferensi 'any' (atau kosong) tidak membatasi area. */
function matchesSeatingPreference(
  preference: SeatingPreference | null | undefined,
  areaType: string | null,
): boolean {
  if (!preference || preference === 'any') return true;
  return str(areaType) === preference;
}

/**
 * Meja yang cocok untuk satu reservasi: cukup kapasitas, berada di area yang
 * diminta (bila ada), dan sesuai preferensi tempat duduk.
 */
function selectTables(
  tables: TableRow[],
  input: { guestCount: number; areaId?: string | null; seatingPreference?: SeatingPreference | null },
): TableRow[] {
  return tables.filter((table) => {
    if (num(table.capacity) < input.guestCount) return false;
    if (input.areaId && str(table.areaId) !== input.areaId) return false;
    return matchesSeatingPreference(input.seatingPreference, strOrNull(table.areaType));
  });
}

/** Nomor reservasi unik; diulang bila ternyata sudah dipakai. */
async function generateUniqueReservationNumber(): Promise<string> {
  for (let attempt = 0; attempt < MAX_NUMBER_ATTEMPTS; attempt += 1) {
    const candidate = generateReservationNumber();
    const exists = await reservationRepo.reservationNumberExists(candidate);
    if (!exists) return candidate;
  }
  throw conflict('Gagal membuat nomor reservasi, silakan coba lagi');
}

// --------------------------------------------------------------------------
// POST /reservations
// --------------------------------------------------------------------------
export async function createReservation(userId: string, input: CreateReservationInput) {
  const reservedFor = parseDate(input.reservedFor);
  if (!reservedFor) throw badRequest('Waktu reservasi tidak valid');

  const durationMinutes = input.durationMinutes ?? DEFAULT_DURATION_MINUTES;
  if (reservedFor.getTime() <= Date.now()) {
    throw unprocessable('Waktu reservasi harus berada di masa depan');
  }
  const endsAt = addMinutes(reservedFor, durationMinutes);

  const created = await withTransaction(async (tx) => {
    const branch = await branchRepo.findBranchById(input.branchId, tx);
    if (!branch) throw notFound('Cabang', input.branchId);
    if (branch.isActive === false) throw unprocessable('Cabang ini sedang tidak melayani reservasi');

    if (input.areaId) {
      const area = await branchRepo.findAreaById(input.areaId, tx);
      if (!area) throw notFound('Area', input.areaId);
      if (str(area.branchId) !== input.branchId) {
        throw unprocessable('Area yang dipilih bukan bagian dari cabang ini');
      }
    }

    const available = await reservationRepo.findAvailableTables(
      input.branchId,
      input.guestCount,
      reservedFor,
      endsAt,
      tx,
    );
    const suitable = selectTables(available, {
      guestCount: input.guestCount,
      areaId: input.areaId,
      seatingPreference: input.seatingPreference,
    });
    // Deteksi overlap pada cabang dan window waktu yang sama. Bila meja di
    // cabang masih tersisa berarti tidak ada konflik, jam tersebut hanya padat.
    const overlapping = await reservationRepo.findOverlappingReservations(
      input.branchId,
      reservedFor,
      endsAt,
      null,
      tx,
    );

    if (suitable.length === 0) {
      if (overlapping.length > 0) {
        throw conflict('Meja sudah dibooking untuk jam tersebut');
      }
      throw unprocessable('Tidak ada meja yang tersedia');
    }

    // Meja yang diminta customer (kalau ada) harus ikut berada di daftar meja
    // yang benar-benar bebas pada jam tersebut.
    const preferredIds = new Set(input.preferredTableIds ?? []);
    const chosen = preferredIds.size
      ? suitable.filter((table) => preferredIds.has(str(table.id)))
      : [suitable[0]];
    if (chosen.length === 0) {
      throw conflict('Meja sudah dibooking untuk jam tersebut');
    }

    // findAvailableTables sudah menyingkirkan meja yang terpakai, tetapi antara
    // pengecekan itu dan insert bisa ada transaksi lain yang lebih dulu commit.
    const reserved = await reservationRepo.findReservedTables(
      input.branchId,
      reservedFor,
      endsAt,
      null,
      tx,
    );
    const bookedTableIds = new Set(reserved.map((row) => str(row.tableId)));
    if (chosen.some((table) => bookedTableIds.has(str(table.id)))) {
      throw conflict('Meja sudah dibooking untuk jam tersebut');
    }

    const reservationNumber = await generateUniqueReservationNumber();
    const inserted = await reservationRepo.insertReservation(
      {
        reservationNumber,
        userId,
        branchId: input.branchId,
        areaId: input.areaId ?? null,
        reservedFor,
        durationMinutes,
        guestCount: input.guestCount,
        seatingPreference: input.seatingPreference ?? null,
        specialRequests: input.specialRequests ?? null,
      },
      tx,
    );
    if (!inserted) throw conflict('Reservasi gagal disimpan, silakan coba lagi');

    const reservationId = str(inserted.id);
    await reservationRepo.insertReservationTables(
      reservationId,
      chosen.map((table) => str(table.id)),
      tx,
    );

    const reservation = await reservationRepo.findReservationById(reservationId, tx);
    const tables = await reservationRepo.listReservationTables(reservationId, tx);

    return {
      reservation: shapeReservation(reservation ?? { id: reservationId, reservationNumber }),
      tables: tables.map(shapeTable),
    };
  });

  const contact = await loadContact(userId);
  return { ...created, contact };
}

// --------------------------------------------------------------------------
// GET /me/reservations
// --------------------------------------------------------------------------
export async function listMyReservations(
  userId: string,
  query: ListMyReservationQuery,
): Promise<Paginated<unknown>> {
  const paging = parsePagination(query);
  const filters: reservationRepo.ListReservationFilters = {
    status: query.status,
    upcomingOnly: query.upcomingOnly,
  };

  const rows = await reservationRepo.listReservationsForUser(userId, filters, paging);
  const total = await reservationRepo.countReservationsForUser(userId, filters);

  const pagination: Pagination = { page: paging.page, limit: paging.limit, offset: paging.offset, total };
  return { items: rows.map(shapeReservation), meta: buildPaginationMeta(pagination) };
}

// --------------------------------------------------------------------------
// GET /reservations/:id
// --------------------------------------------------------------------------
export async function getReservation(reservationId: string, userId: string, isStaff: boolean) {
  // Staff boleh melihat reservasi siapa pun, customer hanya miliknya sendiri.
  const reservation = isStaff
    ? await reservationRepo.findReservationById(reservationId)
    : await reservationRepo.findReservationForUser(reservationId, userId);

  if (!reservation) {
    if (isStaff) throw notFound('Reservasi', reservationId);
    throw forbidden('Reservasi ini bukan milik Anda');
  }

  const tables = await reservationRepo.listReservationTables(reservationId);
  return {
    reservation: shapeReservation(reservation),
    tables: tables.map(shapeTable),
  };
}

// --------------------------------------------------------------------------
// POST /reservations/:id/cancel
// --------------------------------------------------------------------------
export async function cancelReservation(
  userId: string,
  reservationId: string,
  input: CancelReservationInput,
) {
  return withTransaction(async (tx) => {
    const reservation = await reservationRepo.lockReservationForUser(reservationId, userId, tx);
    if (!reservation) throw notFound('Reservasi', reservationId);

    const status = str(reservation.status) as ReservationStatus;
    if (!RESERVATION_STATUS.includes(status)) {
      throw unprocessable(`Status reservasi '${status}' tidak dikenali`);
    }
    if (!CANCELLABLE_STATUS.includes(status)) {
      throw unprocessable(
        `Reservasi tidak dapat dibatalkan karena sudah berstatus '${status}'`,
      );
    }

    // Alasan pembatalan diterima dari client, tetapi tabel reservations tidak
    // punya kolom khusus untuk itu sehingga tidak ditulis ke kolom lain milik
    // customer.
    void input.reason;

    const updated = await reservationRepo.updateReservation(
      reservationId,
      userId,
      { status: 'cancelled' },
      tx,
    );
    if (!updated) throw notFound('Reservasi', reservationId);

    // Lepas meja supaya bisa dipesan ulang pada jam yang sama.
    await reservationRepo.replaceReservationTables(reservationId, [], tx);

    return shapeReservation(updated);
  });
}

// --------------------------------------------------------------------------
// GET /reservations/availability (publik)
// --------------------------------------------------------------------------
export async function checkAvailability(query: CheckAvailabilityQuery) {
  const branch = await branchRepo.findBranchById(query.branchId);
  if (!branch) throw notFound('Cabang', query.branchId);

  const guestCount = query.guestCount ?? DEFAULT_GUEST_COUNT;
  const startDate = query.date ?? toWibDate(new Date());

  const dates: Array<Record<string, unknown>> = [];
  let currentDate = startDate;

  for (let day = 0; day < MAX_AVAILABILITY_DAYS; day += 1) {
    const result = await checkAvailabilityForDate(
      query.branchId,
      currentDate,
      guestCount,
      query.areaId,
      DEFAULT_DURATION_MINUTES,
    );
    if (result) dates.push(result);

    const next = nextWibDate(currentDate);
    if (next === startDate) break;
    currentDate = next;
  }

  return {
    branchId: str(query.branchId),
    branchName: strOrNull(branch.name),
    guestCount,
    durationMinutes: DEFAULT_DURATION_MINUTES,
    date: startDate,
    dates,
    availableDates: dates.filter((item) => item.isAvailable).length,
  };
}

/**
 * Ketersediaan satu tanggal: jam operasional cabang, jumlah reservasi yang
 * sudah ada (tanpa data pelanggan), dan daftar slot yang masih bisa dipesan.
 */
async function checkAvailabilityForDate(
  branchId: string,
  date: string,
  guestCount: number,
  areaId: string | undefined,
  durationMinutes: number,
) {
  const hours = await branchRepo.findHoursForDay(branchId, dayOfWeek(date), 'dine_in');
  if (hours.length === 0) {
    return {
      date,
      dayOfWeek: dayOfWeek(date),
      isOpen: false,
      isAvailable: false,
      openingTime: null,
      closingTime: null,
      busyReservationCount: 0,
      maxGuests: 0,
      freeSlots: [] as Array<Record<string, unknown>>,
    };
  }

  const dayStart = fromWibDate(date);
  const dayEnd = nextWibDate(date);
  // Generic repository masih ditulis snake_case, padahal baris runtime selalu
  // di-camelize oleh many(). Karena itu barisnya dibaca sebagai key camelCase.
  const booked = (await reservationRepo.findOverlappingReservations(
    branchId,
    dayStart,
    new Date(`${dayEnd}T00:00:00${WIB_OFFSET}`),
    null,
    db,
  )) as unknown as TableRow[];

  const freeSlots: Array<Record<string, unknown>> = [];
  let busySlotCount = 0;
  let maxGuests = 0;
  let slotCount = 0;

  for (const hour of hours) {
    const opensAt = slotDate(date, hour.opensAt);
    const closesAt = slotDate(date, hour.closesAt);

    for (
      let cursor = opensAt;
      cursor.getTime() + durationMinutes * 60_000 <= closesAt.getTime() && slotCount < MAX_SLOTS_PER_DAY;
      cursor = addMinutes(cursor, SLOT_MINUTES)
    ) {
      slotCount += 1;
      const slotEnd = addMinutes(cursor, durationMinutes);

      const tables = await reservationRepo.findAvailableTables(
        branchId,
        guestCount,
        cursor,
        slotEnd,
        db,
      );
      const suitable = selectTables(tables, { guestCount, areaId, seatingPreference: null });
      const remaining = suitable.reduce((total, table) => total + num(table.capacity), 0);

      if (remaining <= 0) continue;

      // Slot yang sudah diseruh ke reservasi lain dihitung sebagai terpakai
      // supaya daftar slot tersisa tidak berlebihan. Hanya jam mulai reservasi
      // yang dipakai karena repository tidak mengembalikan durasinya.
      if (booked.some((entry) => startsWithin(entry.reservedFor, cursor, slotEnd))) {
        busySlotCount += 1;
        continue;
      }

      maxGuests = Math.max(maxGuests, remaining);
      freeSlots.push({
        startTime: cursor.toISOString(),
        endTime: slotEnd.toISOString(),
        availableTableCount: suitable.length,
        maxGuests: remaining,
      });
    }
  }

  return {
    date,
    dayOfWeek: dayOfWeek(date),
    isOpen: true,
    isAvailable: freeSlots.length > 0,
    openingTime: strOrNull(hours[0].opensAt),
    closingTime: strOrNull(hours[hours.length - 1].closesAt),
    busyReservationCount: booked.length,
    busySlotCount,
    maxGuests,
    freeSlots,
  };
}

/** Jam mulai reservasi yang sudah ada berada di dalam jendela slot. */
function startsWithin(reservedFor: unknown, slotStart: Date, slotEnd: Date): boolean {
  const start = parseDate(reservedFor);
  if (!start) return false;
  const value = start.getTime();
  return value >= slotStart.getTime() && value < slotEnd.getTime();
}