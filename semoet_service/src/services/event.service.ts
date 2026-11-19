import { z } from 'zod';
import { db, withTransaction, type TransactionClient } from '../config/database.js';
import {
  EVENT_BOOKING_CANCELLABLE,
  EVENT_TYPE,
  type EventBookingStatus,
  type PaymentPurpose,
} from '../config/constants.js';
import { badRequest, conflict, notFound, unprocessable } from '../errors/AppError.js';
import * as adminRepo from '../repositories/admin.repository.js';
import * as branchRepo from '../repositories/branch.repository.js';
import * as eventRepo from '../repositories/event.repository.js';
import { generateEventBookingNumber } from '../utils/codeGenerator.js';
import { calculateOrderTotals, roundIdr } from '../utils/money.js';
import { buildPaginationMeta, parsePagination, type Pagination } from '../utils/pagination.js';
import { bool, iso, num, str, strOrNull } from '../utils/serialize.js';
import {
  cancelEventBookingSchema,
  eventAvailabilityQuerySchema,
  listCateringPackageQuerySchema,
  listEventPackageQuerySchema,
  type CancelEventBookingInput,
  type CreateEventAgendaInput,
  type CreateEventBookingInput,
  type ListEventAgendaQuery,
  type ListMyEventBookingQuery,
  type UpdateEventAgendaInput,
} from '../validators/event.validator.js';

/** Dipakai juga oleh controller lewat tipe yang diekspor di sini. */
export type EventPackageQuery = z.infer<typeof listEventPackageQuerySchema>;
export type CateringPackageQuery = z.infer<typeof listCateringPackageQuerySchema>;

/**
 * Query ketersediaan. Schema bawaan hanya memuat branchId dan date, sedangkan
 * endpoint ini juga menerima rentang tanggal (from/to) dan jumlah tamu, jadi
 * field tersebut ditambahkan di router lewat extend tanpa mengubah validator.
 */
export type EventAvailabilityQuery = z.infer<typeof eventAvailabilityQuerySchema> & {
  from?: string;
  to?: string;
  guestCount?: number;
};

export interface Paginated<T> {
  items: T[];
  meta: ReturnType<typeof buildPaginationMeta>;
}

/** Header Idempotency-Key tidak disimpan karena event_bookings tidak punya kolomnya. */
export interface CreateBookingOptions {
  idempotencyKey?: string | null;
}

/** Payment purpose untuk DP booking event, mengikuti CHECK payment_purpose. */
const DEPOSIT_PURPOSE: PaymentPurpose = 'event_deposit';

/** Jumlah percobaan generate nomor booking sebelum menyerah. */
const MAX_BOOKING_NUMBER_ATTEMPTS = 5;

/** Rentang maksimal yang boleh dicek pada endpoint ketersediaan. */
const MAX_AVAILABILITY_DAYS = 62;

/** WIB = UTC+7 tanpa DST, jadi konversi tanggal bisa dihitung langsung. */
const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// --------------------------------------------------------------------------
// Helper shaping
// --------------------------------------------------------------------------

function toIdr(value: unknown): number {
  return roundIdr(num(value));
}

/** Nominal selalu integer IDR. */
function optionalIdr(value: unknown): number | null {
  return value === null || value === undefined ? null : toIdr(value);
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Kolom jsonb bisa berupa array of string, dibersihkan jadi array of string. */
function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item !== null && item !== undefined).map((item) => String(item));
}

function shapeEventPackage(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    code: str(row.code),
    name: str(row.name),
    description: strOrNull(row.description),
    basePriceIdr: toIdr(row.basePriceIdr),
    minimumGuests: num(row.minimumGuests),
    maximumGuests: optionalIdr(row.maximumGuests),
    inclusions: stringList(row.inclusions),
    isActive: bool(row.isActive),
  };
}

function shapeCateringPackage(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    code: str(row.code),
    name: str(row.name),
    description: strOrNull(row.description),
    pricePerPersonIdr: toIdr(row.pricePerPersonIdr),
    minimumGuests: num(row.minimumGuests),
    maximumGuests: optionalIdr(row.maximumGuests),
    menuDetails: stringList(row.menuDetails),
    leadTimeHours: num(row.leadTimeHours),
    isActive: bool(row.isActive),
  };
}

function shapeCateringLine(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    cateringPackageId: strOrNull(row.cateringPackageId),
    packageCode: strOrNull(row.packageCode),
    packageName: str(row.packageNameSnapshot),
    pricePerPersonIdr: toIdr(row.pricePerPersonSnapshotIdr),
    guestCount: num(row.guestCount),
    lineTotalIdr: toIdr(row.lineTotalIdr),
  };
}

function shapeAddonLine(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    name: str(row.name),
    quantity: num(row.quantity),
    unitPriceIdr: toIdr(row.unitPriceIdr),
    lineTotalIdr: toIdr(row.lineTotalIdr),
  };
}

function shapePayment(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    provider: str(row.provider),
    paymentMethod: str(row.paymentMethod),
    providerReference: strOrNull(row.providerReference),
    paymentPurpose: str(row.paymentPurpose),
    transactionType: str(row.transactionType),
    status: str(row.status),
    amountIdr: toIdr(row.amountIdr),
    paidAt: iso(row.paidAt),
    createdAt: iso(row.createdAt),
  };
}

/**
 * Ringkasan booking. Baris dari listBookingsForUser sudah memuat branch dan
 * total turunan (catering/addons), sedangkan baris booking tunggal tidak,
 * jadi keduanya dilewati lewat fallback null.
 */
function shapeBookingSummary(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    bookingNumber: str(row.bookingNumber),
    branchId: str(row.branchId),
    branchName: strOrNull(row.branchName),
    branchCode: strOrNull(row.branchCode),
    eventPackageId: strOrNull(row.eventPackageId),
    eventPackageCode: strOrNull(row.eventPackageCode),
    eventType: str(row.eventType),
    eventName: strOrNull(row.eventName),
    startsAt: iso(row.startsAt),
    endsAt: iso(row.endsAt),
    guestCount: num(row.guestCount),
    eventPackageName: strOrNull(row.eventPackageNameSnapshot),
    eventPackagePriceIdr: toIdr(row.eventPackagePriceSnapshotIdr),
    cateringTotalIdr: toIdr(row.cateringTotalIdr),
    addonsTotalIdr: toIdr(row.addonsTotalIdr),
    subtotalIdr: toIdr(row.subtotalIdr),
    depositIdr: toIdr(row.depositIdr),
    status: str(row.status),
    customRequests: strOrNull(row.customRequests),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function shapeBookingDetail(
  row: Record<string, unknown>,
  extras: {
    branch: { branchName: string | null; branchCode: string | null };
    catering: ReturnType<typeof shapeCateringLine>[];
    addons: ReturnType<typeof shapeAddonLine>[];
    paidIdr: number;
  },
) {
  const subtotalIdr = toIdr(row.subtotalIdr);
  return {
    ...shapeBookingSummary({
      ...row,
      branchName: extras.branch.branchName,
      branchCode: extras.branch.branchCode,
    }),
    catering: extras.catering,
    addons: extras.addons,
    paidIdr: extras.paidIdr,
    remainingDueIdr: Math.max(0, subtotalIdr - extras.paidIdr),
  };
}

async function loadBranchBrief(branchId: string): Promise<{
  branchId: string;
  branchName: string | null;
  branchCode: string | null;
}> {
  const branch = await branchRepo.findBranchById(branchId);
  if (!branch || !bool(branch.isActive)) throw notFound('Cabang', branchId);

  return {
    branchId,
    branchName: strOrNull(branch.name),
    branchCode: strOrNull(branch.code),
  };
}

/** Iris baris hasil di memory; repository katalog paket belum menyediakan paginasi. */
function sliceRows<T>(rows: T[], paging: { limit: number; offset: number }): T[] {
  return rows.slice(paging.offset, paging.offset + paging.limit);
}

// --------------------------------------------------------------------------
// GET /event-packages dan GET /event-packages/:code
// --------------------------------------------------------------------------

/**
 * Katalog paket event. Endpoint ini publik, jadi hanya paket aktif yang
 * dikembalikan. Repository event_packages tidak punya kolom branch, jadi
 * filter cabang tidak tersedia untuk katalog ini.
 */
export async function listEventPackages(
  query: EventPackageQuery,
): Promise<Paginated<ReturnType<typeof shapeEventPackage>>> {
  const paging = parsePagination(query);
  const rows = await eventRepo.listEventPackages({
    isActive: true,
    minGuests: query.minGuests,
    maxGuests: query.maxGuests,
  });

  const pagination: Pagination = {
    page: paging.page,
    limit: paging.limit,
    offset: paging.offset,
    total: rows.length,
  };

  return { items: sliceRows(rows, paging).map(shapeEventPackage), meta: buildPaginationMeta(pagination) };
}

export async function getEventPackage(code: string) {
  const row = await eventRepo.findEventPackageByCode(code);
  if (!row || !bool(row.isActive)) throw notFound('Paket event', code);

  return shapeEventPackage(row);
}

// --------------------------------------------------------------------------
// GET /catering-packages dan GET /catering-packages/:code
// --------------------------------------------------------------------------

/** Katalog paket katering publik; sama seperti paket event hanya paket aktif. */
export async function listCateringPackages(
  query: CateringPackageQuery,
): Promise<Paginated<ReturnType<typeof shapeCateringPackage>>> {
  const paging = parsePagination(query);
  const rows = await eventRepo.listCateringPackages({
    isActive: true,
    minGuests: query.minGuests,
    maxGuests: query.maxGuests,
  });

  const pagination: Pagination = {
    page: paging.page,
    limit: paging.limit,
    offset: paging.offset,
    total: rows.length,
  };

  return { items: sliceRows(rows, paging).map(shapeCateringPackage), meta: buildPaginationMeta(pagination) };
}

export async function getCateringPackage(code: string) {
  const row = await eventRepo.findCateringPackageByCode(code);
  if (!row || !bool(row.isActive)) throw notFound('Paket katering', code);

  return shapeCateringPackage(row);
}

// --------------------------------------------------------------------------
// POST /event-bookings
// --------------------------------------------------------------------------

/** Nomor booking unik; diulang bila kebetulan bentrok dengan nomor lama. */
async function generateUniqueBookingNumber(tx: TransactionClient): Promise<string> {
  for (let attempt = 0; attempt < MAX_BOOKING_NUMBER_ATTEMPTS; attempt += 1) {
    const candidate = generateEventBookingNumber();
    const exists = await eventRepo.bookingNumberExists(candidate, tx);
    if (!exists) return candidate;
  }

  throw conflict('Gagal membuat nomor booking yang unik, silakan coba lagi');
}

interface ResolvedCateringLine {
  cateringPackageId: string | null;
  packageName: string;
  pricePerPersonIdr: number;
  guestCount: number;
  lineTotalIdr: number;
}

/**
 * Pastikan setiap paket katering yang diminta ada, aktif, dan lead time-nya
 * masih terpenuhi pada tanggal acara.
 */
async function resolveCateringLines(
  input: CreateEventBookingInput,
  startsAt: Date,
  tx: TransactionClient,
): Promise<ResolvedCateringLine[]> {
  const requested = input.catering ?? [];
  const rows = await eventRepo.findCateringPackagesByIds(
    requested.map((line) => line.cateringPackageId),
    tx,
  );

  const byId = new Map(rows.map((row) => [str(row.id), row]));

  return requested.map((line) => {
    const packageRow = byId.get(line.cateringPackageId);
    if (!packageRow) throw notFound('Paket katering', line.cateringPackageId);
    if (!bool(packageRow.isActive)) {
      throw unprocessable(`Paket katering '${str(packageRow.code)}' sudah tidak aktif`);
    }

    const leadTimeHours = num(packageRow.leadTimeHours);
    if (leadTimeHours > 0) {
      const earliest = new Date(Date.now() + leadTimeHours * 60 * 60 * 1000);
      if (startsAt.getTime() < earliest.getTime()) {
        throw unprocessable(
          `Paket katering '${str(packageRow.code)}' harus dipesan minimal ${leadTimeHours} jam sebelum acara`,
        );
      }
    }

    const pricePerPersonIdr = toIdr(packageRow.pricePerPersonIdr);
    return {
      cateringPackageId: str(packageRow.id),
      packageName: str(packageRow.name),
      pricePerPersonIdr,
      guestCount: line.guestCount,
      lineTotalIdr: pricePerPersonIdr * line.guestCount,
    };
  });
}

/**
 * Buat booking event beserta rincian katering, addon, dan nomor booking unik.
 * Seluruh penulisan berada dalam satu transaksi supaya booking tidak pernah
 * tersimpan tanpa rinciannya.
 */
export async function createBooking(
  userId: string,
  input: CreateEventBookingInput,
  options: CreateBookingOptions = {},
) {
  const startsAt = parseDate(input.startsAt);
  if (!startsAt) throw badRequest('startsAt harus berisi tanggal waktu yang valid');
  if (startsAt.getTime() <= Date.now()) {
    throw unprocessable('Tanggal acara harus berada di masa depan');
  }

  const endsAt = input.endsAt ? parseDate(input.endsAt) : null;
  if (input.endsAt && !endsAt) throw badRequest('endsAt harus berisi tanggal waktu yang valid');

  if (!(EVENT_TYPE as readonly string[]).includes(input.eventType)) {
    throw unprocessable(`Jenis acara '${input.eventType}' tidak dikenali`);
  }

  const result = await withTransaction(async (tx) => {
    // 1. Cabang harus ada dan aktif sebelum apa pun dicek.
    const branch = await loadBranchBrief(input.branchId);

    // 2. Paket event: event_packages bersifat global (tanpa kolom branch), jadi
    //    validitasnya hanya berupa paket aktif dan kecocokan jumlah tamu.
    let eventPackageIdr = 0;
    let eventPackageName: string | null = null;
    let eventPackageId: string | null = null;

    if (input.eventPackageId) {
      const packageRow = await eventRepo.findEventPackageById(input.eventPackageId, tx);
      if (!packageRow) throw notFound('Paket event', input.eventPackageId);
      if (!bool(packageRow.isActive)) {
        throw unprocessable(`Paket event '${str(packageRow.code)}' sudah tidak aktif`);
      }

      const minimumGuests = num(packageRow.minimumGuests);
      const maximumGuests = optionalIdr(packageRow.maximumGuests);
      if (input.guestCount < minimumGuests || (maximumGuests !== null && input.guestCount > maximumGuests)) {
        throw unprocessable(
          `Jumlah tamu ${input.guestCount} di luar rentang paket event (${minimumGuests}` +
            `${maximumGuests === null ? '' : ` - ${maximumGuests}`} tamu)`,
        );
      }

      eventPackageId = str(packageRow.id);
      eventPackageName = str(packageRow.name);
      eventPackageIdr = toIdr(packageRow.basePriceIdr);
    }

    // 3. Rincian katering.
    const cateringLines = await resolveCateringLines(input, startsAt, tx);

    // 4. Slot cabang tidak boleh dipakai booking lain yang masih aktif.
    const conflicts = await eventRepo.findConflictingBookings(input.branchId, startsAt, endsAt, null, tx);
    if (conflicts.length > 0) {
      throw conflict('Cabang sudah memiliki booking pada tanggal tersebut');
    }

    // 5. Total dihitung server dari harga paket saat ini; nominal disimpan
    //    sebagai snapshot supaya perubahan harga tidak mengubah booking lama.
    const cateringIdr = roundIdr(
      cateringLines.reduce((total, line) => total + line.lineTotalIdr, 0),
    );
    const addonsIdr = roundIdr(
      (input.addons ?? []).reduce(
        (total, addon) => total + toIdr(addon.unitPriceIdr) * addon.quantity,
        0,
      ),
    );

    const subtotalIdr = eventPackageIdr + cateringIdr + addonsIdr;
    const totals = calculateOrderTotals({ subtotalIdr, discountIdr: 0, taxPercent: 0 });

    const depositPercent = input.depositPercent ?? 0;
    const depositIdr = depositPercent > 0 ? roundIdr((totals.subtotalIdr * depositPercent) / 100) : 0;
    const status = depositIdr > 0 ? 'awaiting_deposit' : 'requested';

    // 6. Nomor booking dibuat di dalam transaksi supaya pengecekan bentrok
    //    tidak raced dengan booking lain.
    const bookingNumber = await generateUniqueBookingNumber(tx);

    const inserted = await eventRepo.insertEventBooking(
      {
        bookingNumber,
        userId,
        branchId: input.branchId,
        eventPackageId,
        eventType: input.eventType,
        eventName: input.eventName ?? null,
        startsAt,
        endsAt,
        guestCount: input.guestCount,
        eventPackageNameSnapshot: eventPackageName,
        eventPackagePriceSnapshotIdr: eventPackageIdr,
        subtotalIdr: totals.subtotalIdr,
        depositIdr,
        status,
        customRequests: input.customRequests ?? null,
      },
      tx,
    );
    if (!inserted) throw conflict('Booking event gagal dibuat, silakan coba lagi');

    const bookingId = str(inserted.id);

    for (const line of cateringLines) {
      await eventRepo.insertBookingCatering(
        {
          eventBookingId: bookingId,
          cateringPackageId: line.cateringPackageId,
          packageNameSnapshot: line.packageName,
          pricePerPersonSnapshotIdr: line.pricePerPersonIdr,
          guestCount: line.guestCount,
        },
        tx,
      );
    }

    for (const addon of input.addons ?? []) {
      await eventRepo.insertBookingAddon(
        {
          eventBookingId: bookingId,
          name: addon.name,
          quantity: addon.quantity,
          unitPriceIdr: toIdr(addon.unitPriceIdr),
        },
        tx,
      );
    }

    const saved = await eventRepo.findBookingById(bookingId, tx);

    return {
      booking: shapeBookingSummary({
        ...(saved ?? {}),
        id: bookingId,
        bookingNumber,
        branchId: input.branchId,
        branchName: branch.branchName,
        branchCode: branch.branchCode,
      }),
      totals: {
        eventPackageIdr,
        cateringIdr,
        addonsIdr,
        subtotalIdr: totals.subtotalIdr,
        discountIdr: totals.discountIdr,
        taxIdr: totals.taxIdr,
        totalIdr: totals.totalIdr,
        depositPercent,
        depositIdr,
      },
      deposit: {
        isRequired: depositIdr > 0,
        dueIdr: depositIdr,
        paymentPurpose: depositIdr > 0 ? DEPOSIT_PURPOSE : null,
      },
      idempotencyKey: options.idempotencyKey ?? null,
    };
  });

  return result;
}

// --------------------------------------------------------------------------
// GET /me/event-bookings
// --------------------------------------------------------------------------

export async function listMineBookings(
  userId: string,
  query: ListMyEventBookingQuery,
): Promise<Paginated<ReturnType<typeof shapeBookingSummary>>> {
  const paging = parsePagination(query);
  const rows = await eventRepo.listBookingsForUser(userId, { status: query.status }, paging);
  const total = await eventRepo.countBookingsForUser(userId, query.status);

  const pagination: Pagination = {
    page: paging.page,
    limit: paging.limit,
    offset: paging.offset,
    total,
  };

  return { items: rows.map(shapeBookingSummary), meta: buildPaginationMeta(pagination) };
}

// --------------------------------------------------------------------------
// GET /event-bookings/:id
// --------------------------------------------------------------------------

/**
 * Detail booking. Booking milik orang lain disamakan dengan 404 untuk user
 * biasa supaya keberadaan booking tidak bocor; staff boleh membuka semua.
 */
export async function detail(bookingId: string, userId: string, isStaff: boolean) {
  const booking = isStaff
    ? await eventRepo.findBookingById(bookingId)
    : await eventRepo.findBookingForUser(bookingId, userId);
  if (!booking) throw notFound('Booking event', bookingId);

  const branchId = str(booking.branchId);
  const [branch, catering, addons, payments, paidIdr] = await Promise.all([
    branchRepo.findBranchById(branchId),
    eventRepo.listBookingCatering(bookingId),
    eventRepo.listBookingAddons(bookingId),
    eventRepo.listEventBookingsPayments(bookingId),
    eventRepo.sumEventBookingPaid(bookingId),
  ]);

  const subtotalIdr = toIdr(booking.subtotalIdr);

  return {
    booking: shapeBookingDetail(booking, {
      branch: { branchName: strOrNull(branch?.name), branchCode: strOrNull(branch?.code) },
      catering: catering.map(shapeCateringLine),
      addons: addons.map(shapeAddonLine),
      paidIdr,
    }),
    payments: payments.map(shapePayment),
    paidIdr,
    remainingDueIdr: Math.max(0, subtotalIdr - paidIdr),
  };
}

// --------------------------------------------------------------------------
// POST /event-bookings/:id/cancel
// --------------------------------------------------------------------------

/** Body cancel boleh kosong; schema sudah menyediakan nilai default. */
function normalizeCancelInput(body: unknown): CancelEventBookingInput {
  return cancelEventBookingSchema.parse(body ?? {});
}

/**
 * Pembatalan hanya oleh pemilik booking dan hanya pada status yang masih
 * boleh dibatalkan (EVENT_BOOKING_CANCELLABLE).
 */
export async function cancel(
  bookingId: string,
  userId: string,
  body: unknown,
): Promise<{
  booking: ReturnType<typeof shapeBookingDetail>;
  cancelledFromStatus: EventBookingStatus;
  refund: {
    requested: boolean;
    refundableIdr: number;
    status: 'none' | 'requested';
  };
}> {
  const input = normalizeCancelInput(body);

  return withTransaction(async (tx) => {
    const locked = await eventRepo.lockBookingForUser(bookingId, userId, tx);
    if (!locked) throw notFound('Booking event', bookingId);

    const current = str(locked.status) as EventBookingStatus;
    if (!EVENT_BOOKING_CANCELLABLE.includes(current)) {
      throw unprocessable(
        `Booking dengan status '${current}' sudah tidak bisa dibatalkan. ` +
          'Hubungi admin apabila acara tetap ingin dibatalkan.',
      );
    }

    const paidIdr = await eventRepo.sumEventBookingPaid(bookingId, tx);
    // Nominal refund tidak boleh melebihi DP yang sudah dibayar.
    const refundableIdr = Math.min(paidIdr, toIdr(locked.depositIdr));

    const updated = await eventRepo.updateBookingStatus(bookingId, { status: 'cancelled' }, userId, tx);
    const finalRow = updated ?? { ...locked, status: 'cancelled' };

    const [branch, catering, addons] = await Promise.all([
      branchRepo.findBranchById(str(locked.branchId)),
      eventRepo.listBookingCatering(bookingId, tx),
      eventRepo.listBookingAddons(bookingId, tx),
    ]);

    return {
      booking: shapeBookingDetail(finalRow, {
        branch: { branchName: strOrNull(branch?.name), branchCode: strOrNull(branch?.code) },
        catering: catering.map(shapeCateringLine),
        addons: addons.map(shapeAddonLine),
        paidIdr,
      }),
      cancelledFromStatus: current,
      refund: {
        requested: input.requestRefund && refundableIdr > 0,
        refundableIdr,
        status: input.requestRefund && refundableIdr > 0 ? ('requested' as const) : ('none' as const),
      },
    };
  });
}

// --------------------------------------------------------------------------
// GET /event-availability
// --------------------------------------------------------------------------

/** Ubah instant menjadi kunci tanggal WIB (YYYY-MM-DD). */
function jakartaDateKey(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() + JAKARTA_OFFSET_MS).toISOString().slice(0, 10);
}

function startOfJakartaDay(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000+07:00`);
}

function endOfJakartaDay(dateKey: string): Date {
  return new Date(`${dateKey}T23:59:59.999+07:00`);
}

/** Selisih hari antar dua tanggal WIB, dipakai untuk membatasi rentang. */
function dayIndex(dateKey: string): number {
  return Math.round(startOfJakartaDay(dateKey).getTime() / (24 * 60 * 60 * 1000));
}

/** Terjemahkan input tanggal (YYYY-MM-DD atau ISO penuh) menjadi tanggal WIB. */
function resolveDateKey(value: string | undefined, label: string): string | null {
  if (!value) return null;
  if (!DATE_KEY_PATTERN.test(value)) {
    const parsed = parseDate(value);
    const key = parsed ? jakartaDateKey(parsed) : '';
    if (!key) throw badRequest(`Parameter ${label} harus format tanggal YYYY-MM-DD`);
    return key;
  }
  return value;
}

/**
 * Ketersediaan tanggal event (publik, tanpa data pelanggan).
 *
 * Kapasitas per tanggal diambil dari batas maksimum tamu paket event aktif,
 * dikurangi jumlah tamu yang sudah dibooking pada tanggal tersebut. Bila
 * cabang tidak disebutkan, angka kapasitas tidak bisa dihitung sehingga hanya
 * status ketersediaan tanggal yang dikembalikan.
 */
export async function checkAvailability(query: EventAvailabilityQuery) {
  if (query.branchId) {
    const exists = await branchRepo.branchExists(query.branchId);
    if (!exists) throw notFound('Cabang', query.branchId);
  }

  const todayKey = jakartaDateKey(new Date());
  const fromKey = resolveDateKey(query.from ?? query.date, 'from') ?? todayKey;
  const toKey = resolveDateKey(query.to, 'to') ?? fromKey;
  if (toKey < fromKey) throw badRequest('Parameter to harus lebih besar dari from');

  const spanDays = dayIndex(toKey) - dayIndex(fromKey);
  if (spanDays > MAX_AVAILABILITY_DAYS) {
    throw badRequest(`Rentang tanggal maksimal ${MAX_AVAILABILITY_DAYS} hari per permintaan`);
  }

  const from = startOfJakartaDay(fromKey);
  const to = endOfJakartaDay(toKey);

  const packages = await eventRepo.listEventPackages({ isActive: true });
  const maxGuestsPerEvent = packages.reduce(
    (max, row) => Math.max(max, optionalIdr(row.maximumGuests) ?? 0),
    0,
  );

  const [bookedRows, conflictingRows] = await Promise.all([
    eventRepo.listBookedDates(query.branchId, from, to),
    // findConflictingBookings selalu memfilter satu cabang, jadi tanpa branchId
    // aggregate hanya bisa memakai listBookedDates.
    query.branchId
      ? eventRepo.findConflictingBookings(query.branchId, from, to, null, db)
      : Promise.resolve([]),
  ]);

  const bookedCountByDate = new Map<string, number>();
  // Generic eksplisit di repository masih snake_case, sementara many() selalu
  // me-camelize baris, jadi kedua nama kolom dibaca lewat bentuk camelCase.
  for (const raw of bookedRows) {
    const row = raw as unknown as Record<string, unknown>;
    bookedCountByDate.set(str(row.date), num(row.totalBookings ?? row.total_bookings));
  }

  const bookedGuestsByDate = new Map<string, number>();
  for (const raw of conflictingRows) {
    const row = raw as unknown as Record<string, unknown>;
    const key = jakartaDateKey(str(row.startsAt ?? row.starts_at));
    bookedGuestsByDate.set(key, (bookedGuestsByDate.get(key) ?? 0) + num(row.guestCount ?? row.guest_count));
  }

  const guestCount = query.guestCount;
  const dates: {
    date: string;
    isAvailable: boolean;
    capacity: number | null;
    bookedCount: number;
    bookedGuestCount: number | null;
    remainingCapacity: number | null;
  }[] = [];

  for (let day = 0; day <= MAX_AVAILABILITY_DAYS; day += 1) {
    const cursor = new Date(from.getTime() + day * 24 * 60 * 60 * 1000);
    const dateKey = jakartaDateKey(cursor);
    if (dateKey > toKey) break;

    const bookedCount = bookedCountByDate.get(dateKey) ?? 0;
    const bookedGuestCount = query.branchId ? (bookedGuestsByDate.get(dateKey) ?? 0) : null;
    const capacity = query.branchId ? maxGuestsPerEvent : null;
    const remainingCapacity =
      capacity === null || bookedGuestCount === null ? null : Math.max(0, capacity - bookedGuestCount);

    const isPast = dateKey < todayKey;
    const fitsGuests = guestCount === undefined || (remainingCapacity !== null && remainingCapacity >= guestCount);
    const hasSlot = remainingCapacity === null ? bookedCount === 0 : remainingCapacity > 0;

    dates.push({
      date: dateKey,
      isAvailable: !isPast && hasSlot && fitsGuests,
      capacity,
      bookedCount,
      bookedGuestCount,
      remainingCapacity,
    });
  }

  return {
    branchId: query.branchId ?? null,
    from: fromKey,
    to: toKey,
    guestCount: guestCount ?? null,
    maxGuestsPerEvent: query.branchId ? maxGuestsPerEvent : null,
    availableDates: dates.filter((row) => row.isAvailable).map((row) => row.date),
    dates,
  };
}

// --------------------------------------------------------------------------
// Admin: list all event bookings with filters
// --------------------------------------------------------------------------
export async function listAdminEventBookings(
  filters: eventRepo.ListAdminEventBookingFilters,
  pagination: { page: number; limit: number; offset: number },
) {
  const rows = await eventRepo.listAdminEventBookings(filters, pagination);
  const total = await eventRepo.countAdminEventBookings(filters);
  return { items: rows.map(shapeAdminEventBooking), total };
}

export async function getAdminEventBooking(bookingId: string) {
  const booking = await eventRepo.findBookingById(bookingId);
  if (!booking) throw notFound('Booking Event', bookingId);

  const [catering, addons] = await Promise.all([
    eventRepo.listBookingCatering(bookingId),
    eventRepo.listBookingAddons(bookingId),
  ]);

  return shapeAdminEventBooking({ ...booking, catering, addons });
}

export async function updateAdminEventBookingStatus(
  bookingId: string,
  status: string,
  note: string | null,
  quoteIdr: number | null,
  depositPercent: number | null,
) {
  const updated = await eventRepo.updateEventBookingStatus(
    bookingId,
    status,
    note,
    quoteIdr,
    depositPercent,
  );
  if (!updated) throw notFound('Booking Event', bookingId);

  const [catering, addons] = await Promise.all([
    eventRepo.listBookingCatering(bookingId),
    eventRepo.listBookingAddons(bookingId),
  ]);

  return shapeAdminEventBooking({ ...updated, catering, addons });
}

function shapeAdminEventBooking(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    bookingNumber: str(row.bookingNumber ?? row.booking_number),
    branchId: str(row.branchId ?? row.branch_id),
    branchName: strOrNull(row.branchName ?? row.branch_name),
    eventType: str(row.eventType ?? row.event_type),
    eventName: strOrNull(row.eventName ?? row.event_name),
    startsAt: iso(row.startsAt ?? row.starts_at),
    endsAt: iso(row.endsAt ?? row.ends_at),
    guestCount: num(row.guestCount ?? row.guest_count),
    eventPackageName: strOrNull(row.eventPackageNameSnapshot ?? row.event_package_name_snapshot),
    eventPackagePriceIdr: roundIdr(num(row.eventPackagePriceSnapshotIdr ?? row.event_package_price_snapshot_idr)),
    subtotalIdr: roundIdr(num(row.subtotalIdr ?? row.subtotal_idr)),
    depositIdr: roundIdr(num(row.depositIdr ?? row.deposit_idr)),
    paidIdr: roundIdr(num(row.paidIdr ?? row.paid_idr)),
    status: str(row.status),
    userName: strOrNull(row.userName ?? row.user_name),
    userEmail: strOrNull(row.userEmail ?? row.user_email),
    userPhone: strOrNull(row.userPhone ?? row.user_phone),
    customRequests: strOrNull(row.customRequests ?? row.custom_requests),
    catering: row.catering ?? [],
    addons: row.addons ?? [],
    createdAt: iso(row.createdAt ?? row.created_at),
  };
}

// --------------------------------------------------------------------------
// Agenda event: penanda tanggal (Ramadan, Lebaran, promo musiman, dsb)
// --------------------------------------------------------------------------

/** Konteks audit untuk aksi CRUD agenda yang dilakukan staf. */
export interface EventAgendaAuditContext {
  requestId?: string | null;
  ipAddress?: string | null;
}

function shapeEventAgenda(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    title: str(row.title),
    description: strOrNull(row.description),
    startsOn: str(row.startsOn),
    endsOn: str(row.endsOn),
    isActive: bool(row.isActive),
    createdBy: strOrNull(row.createdBy),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

/**
 * Daftar agenda event. `activeOnly` dipakai endpoint publik supaya agenda
 * nonaktif tidak ikut tampil.
 */
export async function listEventAgenda(
  query: ListEventAgendaQuery,
  options: { activeOnly?: boolean } = {},
): Promise<Paginated<ReturnType<typeof shapeEventAgenda>>> {
  const paging = parsePagination(query);
  const filters: eventRepo.ListEventAgendaFilters = {
    isActive: options.activeOnly ? true : query.isActive === undefined ? undefined : query.isActive === 'true',
    from: query.from,
    to: query.to,
    q: query.q,
  };

  const rows = await eventRepo.listEventAgenda(filters, paging);
  const total = await eventRepo.countEventAgenda(filters);

  const pagination: Pagination = {
    page: paging.page,
    limit: paging.limit,
    offset: paging.offset,
    total,
  };

  return { items: rows.map(shapeEventAgenda), meta: buildPaginationMeta(pagination) };
}

export async function getEventAgenda(agendaId: string) {
  const row = await eventRepo.findEventAgendaById(agendaId);
  if (!row) throw notFound('Agenda event', agendaId);
  return shapeEventAgenda(row);
}

export async function createEventAgenda(
  input: CreateEventAgendaInput,
  actorUserId: string | null,
  audit: EventAgendaAuditContext = {},
) {
  const startsOn = input.startsOn;
  const endsOn = input.endsOn ?? startsOn;
  if (endsOn < startsOn) {
    throw unprocessable('Tanggal selesai tidak boleh sebelum tanggal mulai');
  }

  return withTransaction(async (tx) => {
    const inserted = await eventRepo.insertEventAgenda(
      {
        title: input.title,
        description: input.description ?? null,
        startsOn,
        endsOn,
        isActive: input.isActive,
        createdBy: actorUserId,
      },
      tx,
    );
    if (!inserted) throw conflict('Agenda event gagal disimpan, silakan coba lagi');

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'admin.event_agenda.create',
        entityType: 'event_agenda',
        entityId: str(inserted.id),
        oldData: null,
        newData: { title: input.title, startsOn, endsOn, isActive: input.isActive },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return shapeEventAgenda(inserted);
  });
}

export async function updateEventAgenda(
  agendaId: string,
  input: UpdateEventAgendaInput,
  actorUserId: string | null,
  audit: EventAgendaAuditContext = {},
) {
  return withTransaction(async (tx) => {
    const existing = await eventRepo.findEventAgendaById(agendaId, tx);
    if (!existing) throw notFound('Agenda event', agendaId);

    const startsOn = input.startsOn ?? str(existing.startsOn);
    const endsOn = input.endsOn ?? str(existing.endsOn);
    if (endsOn < startsOn) {
      throw unprocessable('Tanggal selesai tidak boleh sebelum tanggal mulai');
    }

    const updated = await eventRepo.updateEventAgenda(
      agendaId,
      {
        title: input.title,
        description: input.description === undefined ? undefined : input.description ?? null,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
        isActive: input.isActive,
      },
      tx,
    );
    if (!updated) throw notFound('Agenda event', agendaId);

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'admin.event_agenda.update',
        entityType: 'event_agenda',
        entityId: agendaId,
        oldData: shapeEventAgenda(existing),
        newData: shapeEventAgenda(updated),
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return shapeEventAgenda(updated);
  });
}

export async function deleteEventAgenda(
  agendaId: string,
  actorUserId: string | null,
  audit: EventAgendaAuditContext = {},
) {
  return withTransaction(async (tx) => {
    const existing = await eventRepo.findEventAgendaById(agendaId, tx);
    if (!existing) throw notFound('Agenda event', agendaId);

    await eventRepo.deleteEventAgenda(agendaId, tx);

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'admin.event_agenda.delete',
        entityType: 'event_agenda',
        entityId: agendaId,
        oldData: shapeEventAgenda(existing),
        newData: null,
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return { id: agendaId, deleted: true };
  });
}