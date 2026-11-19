import { db, withTransaction, type TransactionClient } from '../config/database.js';
import { randomUUID } from 'node:crypto';
import {
  RESERVATION_STATUS,
  type ReservationStatus,
  type SeatingPreference,
} from '../config/constants.js';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../errors/AppError.js';
import * as authRepo from '../repositories/auth.repository.js';
import * as branchRepo from '../repositories/branch.repository.js';
import * as catalogRepo from '../repositories/catalog.repository.js';
import * as paymentRepo from '../repositories/payment.repository.js';
import * as reservationRepo from '../repositories/reservation.repository.js';
import type { Exec } from '../repositories/base.js';
import { getPaymentGateway } from './paymentGateway.provider.js';
import * as storageService from './storage.service.js';
import { generateReservationNumber } from '../utils/codeGenerator.js';
import { buildPaginationMeta, parsePagination, type Pagination } from '../utils/pagination.js';
import { num, str, strOrNull, iso, bool, toIsoOrNull } from '../utils/serialize.js';
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
const SLOT_MINUTES = 60;

/** Batas jumlah tanggal yang boleh dicek sekaligus pada endpoint publik. */
const MAX_AVAILABILITY_DAYS = 7;

/** Batas jumlah slot per tanggal supaya query publik tidak terlalu berat. */
const MAX_SLOTS_PER_DAY = 14;

/** Batas percobaan generate nomor reservasi sebelum menyerah. */
const MAX_NUMBER_ATTEMPTS = 5;

/**
 * Pengaturan pembagian DP reservasi. Disimpan di tabel
 * `reservation_deposit_settings` (satu baris) dan bisa diubah admin lewat
 * halaman "Ketentuan DP". Nilai bawaan = rumus lama.
 */
export interface DepositSettings {
  dp1Percent: number;
  dp1MinIdr: number;
  dp1MaxIdr: number;
  dp2Percent: number;
}

export const DEFAULT_DEPOSIT_SETTINGS: DepositSettings = {
  dp1Percent: 30,
  dp1MinIdr: 300_000,
  dp1MaxIdr: 500_000,
  dp2Percent: 30,
};

/** @deprecated Pakai DEFAULT_DEPOSIT_SETTINGS / getDepositSettings(). */
export const DEPOSIT1_PERCENT = DEFAULT_DEPOSIT_SETTINGS.dp1Percent;
export const DEPOSIT1_MIN_IDR = DEFAULT_DEPOSIT_SETTINGS.dp1MinIdr;
export const DEPOSIT1_MAX_IDR = DEFAULT_DEPOSIT_SETTINGS.dp1MaxIdr;

/** @deprecated Pakai DEFAULT_DEPOSIT_SETTINGS / getDepositSettings(). */
export const DEPOSIT2_PERCENT = DEFAULT_DEPOSIT_SETTINGS.dp2Percent;

/** Batas lama (per-ruangan) — dipertahankan untuk referensi/kompatibilitas. */
export const DEPOSIT1_PER_ROOM_IDR = DEPOSIT1_MIN_IDR;

/** @deprecated Pakai DEPOSIT2_PERCENT. Dibiarkan agar impor lama tidak pecah. */
export const DEFAULT_DEPOSIT2_PERCENT = DEPOSIT2_PERCENT;

/** Baca pengaturan DP aktif dari database (fallback ke nilai bawaan). */
export async function getDepositSettings(executor: Exec = db): Promise<DepositSettings> {
  const row = await reservationRepo.getDepositSettings(executor);
  if (!row) return DEFAULT_DEPOSIT_SETTINGS;
  return {
    dp1Percent: Number(row.dp1Percent ?? DEFAULT_DEPOSIT_SETTINGS.dp1Percent),
    dp1MinIdr: Number(row.dp1MinIdr ?? DEFAULT_DEPOSIT_SETTINGS.dp1MinIdr),
    dp1MaxIdr: Number(row.dp1MaxIdr ?? DEFAULT_DEPOSIT_SETTINGS.dp1MaxIdr),
    dp2Percent: Number(row.dp2Percent ?? DEFAULT_DEPOSIT_SETTINGS.dp2Percent),
  };
}

/**
 * Hitung nominal ketiga tahap DP dari total sewa. Satu sumber kebenaran agar
 * form pelanggan, panel admin, dan webhook tidak pernah berbeda.
 *
 *   DP1        = clamp(dp1Percent% × total, dp1MinIdr, dp1MaxIdr) — hanya boleh
 *                melebihi total bila total < batas minimum (reservasi murah).
 *   Sisa       = total − DP1
 *   DP2        = dp2Percent% × sisa (setelah DP1)
 *   Pelunasan  = sisa − DP2 = max(0, total − DP1 − DP2)
 *
 * Contoh bawaan total 1.000.000 → DP1 300.000, sisa 700.000, DP2 210.000,
 * pelunasan 490.000.
 */
export function computeDepositStages(
  totalEstimateIdr: number,
  settings: DepositSettings = DEFAULT_DEPOSIT_SETTINGS,
): {
  deposit1: number;
  deposit2: number;
  settlement: number;
} {
  const total = Math.max(0, Math.round(Number(totalEstimateIdr) || 0));
  const dp1PercentOf = Math.round(total * (Number(settings.dp1Percent) / 100));
  // DP1 dijepit di rentang min–max yang bisa diatur admin.
  let deposit1 = Math.min(
    Number(settings.dp1MaxIdr),
    Math.max(Number(settings.dp1MinIdr), dp1PercentOf),
  );
  // Tidak pernah melebihi total sewa (reservasi dengan total sangat kecil).
  if (deposit1 > total) deposit1 = total;

  // DP2 dihitung dari SISA setelah DP1, bukan dari total penuh.
  const remainingAfterDp1 = Math.max(0, total - deposit1);
  const deposit2 = Math.round(remainingAfterDp1 * (Number(settings.dp2Percent) / 100));
  const settlement = Math.max(0, remainingAfterDp1 - deposit2);
  return { deposit1, deposit2, settlement };
}

/**
 * Penjelasan aturan DP1 untuk sebuah total sewa — dipakai panel admin & app
 * agar pelanggan tahu kenapa nominalnya mengikuti batas min/max.
 *
 *   basis 'min'  → DP1 memakai batas bawah
 *   basis 'rate' → DP1 = persen × total (di antara batas)
 *   basis 'max'  → DP1 memakai batas atas
 */
export function describeDeposit1Rule(
  totalEstimateIdr: number,
  settings: DepositSettings = DEFAULT_DEPOSIT_SETTINGS,
): {
  amountIdr: number;
  basis: 'min' | 'rate' | 'max';
  note: string;
} {
  const total = Math.max(0, Math.round(Number(totalEstimateIdr) || 0));
  const { deposit1 } = computeDepositStages(total, settings);
  const percent = Number(settings.dp1Percent);
  const percentOf = Math.round(total * (percent / 100));
  const min = `Rp${Number(settings.dp1MinIdr).toLocaleString('id-ID')}`;
  const max = `Rp${Number(settings.dp1MaxIdr).toLocaleString('id-ID')}`;

  if (total <= 0) {
    return {
      amountIdr: deposit1,
      basis: 'min',
      note: `Total sewa belum dihitung. DP1 akan dihitung otomatis: ${percent}% dari total, minimal ${min}, maksimal ${max}.`,
    };
  }
  if (percentOf >= Number(settings.dp1MaxIdr)) {
    return {
      amountIdr: deposit1,
      basis: 'max',
      note: `${percent}% dari total sewa (Rp${percentOf.toLocaleString('id-ID')}) melewati batas maximum, jadi DP1 dibatasi di ${max}.`,
    };
  }
  if (percentOf >= Number(settings.dp1MinIdr)) {
    return {
      amountIdr: deposit1,
      basis: 'rate',
      note: `DP1 = ${percent}% dari total sewa (masih di antara ${min} dan ${max}).`,
    };
  }
  return {
    amountIdr: deposit1,
    basis: 'min',
    note: `${percent}% dari total sewa (Rp${percentOf.toLocaleString('id-ID')}) di bawah ${min}, jadi DP1 memakai nilai minimum ${min}.`,
  };
}

/**
 * Nominal default untuk satu tahap DP. Bila data tahap sudah tersimpan di
 * reservasi, pakai itu; kalau belum, hitung dari total sewa memakai pengaturan
 * aktif. (Reservasi lama tidak ikut berubah saat admin mengubah persentase.)
 */
export function defaultDepositAmount(
  stage: 'deposit' | 'deposit2' | 'settlement',
  reservation: Record<string, unknown>,
  settings: DepositSettings = DEFAULT_DEPOSIT_SETTINGS,
): number {
  const total = Number(reservation.totalEstimateIdr ?? 0);
  const computed = computeDepositStages(total, settings);

  const stored =
    stage === 'deposit'
      ? Number(reservation.depositAmountIdr ?? 0)
      : stage === 'deposit2'
        ? Number(reservation.deposit2AmountIdr ?? 0)
        : Number(reservation.settlementAmountIdr ?? 0);
  if (stored > 0) return stored;

  if (stage === 'deposit') return computed.deposit1;
  if (stage === 'deposit2') return computed.deposit2;
  return computed.settlement;
}

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

/**
 * Normalisasi satu ruangan (area) reservasi. Sumbernya bisa dari json_agg
 * (`areaId…`) atau dari query `listReservationRooms` (snake_case), jadi kedua
 * bentuk diterima.
 */
function shapeRoom(row: TableRow) {
  return {
    areaId: str(row.areaId ?? row.area_id),
    name: str(row.name),
    areaType: strOrNull(row.areaType ?? row.area_type),
    pricePerHourIdr:
      row.pricePerHourIdr == null && row.price_per_hour_idr == null
        ? null
        : num(row.pricePerHourIdr ?? row.price_per_hour_idr),
    imageUrl: strOrNull(row.imageUrl ?? row.image_url),
  };
}

function shapeReservation(row: TableRow) {
  const tableCodes = Array.isArray(row.tableCodes)
    ? row.tableCodes.map((code) => String(code))
    : null;
  const rawRooms = Array.isArray(row.rooms)
    ? row.rooms.filter(Boolean)
    : row.rooms
      ? [row.rooms].filter(Boolean)
      : [];
  const rooms = rawRooms.map((room) => shapeRoom(room as TableRow));

  const reservedFor = toIsoOrNull(row.reservedFor);
  const durationMinutes = num(row.durationMinutes);
  const endsAt =
    reservedFor && durationMinutes > 0
      ? new Date(new Date(reservedFor).getTime() + durationMinutes * 60_000).toISOString()
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
    rooms,
    reservedFor,
    endsAt,
    durationMinutes,
    guestCount: num(row.guestCount),
    seatingPreference: strOrNull(row.seatingPreference),
    status: str(row.status),
    specialRequests: strOrNull(row.specialRequests),
    tableCodes,
    // Sewa ruangan + order menu (total = sewa + makanan/minuman)
    areaPricePerHourIdr:
      row.areaPricePerHourIdr == null ? null : num(row.areaPricePerHourIdr),
    totalEstimateIdr: row.totalEstimateIdr == null ? null : num(row.totalEstimateIdr),
    roomTotalIdr: row.roomTotalIdr == null ? null : num(row.roomTotalIdr),
    menuTotalIdr: row.menuTotalIdr == null ? null : num(row.menuTotalIdr),
    // DP1
    depositAmountIdr: row.depositAmountIdr == null ? null : num(row.depositAmountIdr),
    depositStatus: strOrNull(row.depositStatus) ?? 'unpaid',
    depositProofUrl: strOrNull(row.depositProofUrl),
    depositPaidAt: toIsoOrNull(row.depositPaidAt),
    depositNote: strOrNull(row.depositNote),
    // DP2
    deposit2AmountIdr: row.deposit2AmountIdr == null ? null : num(row.deposit2AmountIdr),
    deposit2Status: strOrNull(row.deposit2Status) ?? 'unpaid',
    deposit2ProofUrl: strOrNull(row.deposit2ProofUrl),
    deposit2PaidAt: toIsoOrNull(row.deposit2PaidAt),
    deposit2Note: strOrNull(row.deposit2Note),
    // Pelunasan
    settlementAmountIdr: row.settlementAmountIdr == null ? null : num(row.settlementAmountIdr),
    settlementStatus: strOrNull(row.settlementStatus) ?? 'unpaid',
    settlementProofUrl: strOrNull(row.settlementProofUrl),
    settlementPaidAt: toIsoOrNull(row.settlementPaidAt),
    settlementNote: strOrNull(row.settlementNote),
    createdAt: toIsoOrNull(row.createdAt),
    updatedAt: toIsoOrNull(row.updatedAt),
  };
}

/** Bentuk satu baris riwayat status untuk dikirim ke klien. */
function shapeStatusHistory(row: TableRow) {
  return {
    id: str(row.id),
    fromStatus: strOrNull(row.fromStatus),
    toStatus: str(row.toStatus),
    note: strOrNull(row.note),
    actorName: strOrNull(row.actorName),
    createdAt: toIsoOrNull(row.createdAt),
  };
}

/** Bentuk satu baris order menu reservasi (makanan/minuman). */
function shapeMenuItem(row: TableRow) {
  return {
    id: str(row.id),
    productId: strOrNull(row.productId),
    variantId: strOrNull(row.variantId),
    productName: str(row.productName),
    variantName: strOrNull(row.variantName),
    quantity: num(row.quantity),
    unitPriceIdr: num(row.unitPriceIdr),
    modifiersTotalIdr: num(row.modifiersTotalIdr),
    lineTotalIdr: num(row.lineTotalIdr),
    note: strOrNull(row.note),
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

/**
 * Harga ulang order menu reservasi di server.
 *
 * Klien hanya mengirim produk + varian + pilihan modifier; nominalnya TIDAK
 * dipercaya. Server mengunci harga varian (FOR UPDATE), memvalidasi modifier
 * terhadap grup produk, lalu menghitung ulang harga satuan & total baris.
 * Hasilnya dipakai sebagai bagian dari total reservasi — sehingga uang muka
 * (DP) ikut menutup makanan & minuman yang dipesan, bukan sewa tempat saja.
 */
async function resolveReservationMenuItems(
  requested: NonNullable<CreateReservationInput['menuItems']>,
  tx: TransactionClient,
): Promise<reservationRepo.ReservationMenuItemInput[]> {
  const items: reservationRepo.ReservationMenuItemInput[] = [];

  for (const entry of requested) {
    const variantRow = await catalogRepo.lockProductVariant(entry.variantId, tx);
    if (!variantRow) throw notFound('Menu', entry.variantId);

    const variant = variantRow as unknown as Record<string, unknown>;
    const productId = str(variant.productId);
    const productName = str(variant.productName);

    if (productId !== entry.productId) {
      throw unprocessable(
        `Varian yang dipilih untuk '${productName}' bukan bagian dari produk pada item ini`,
      );
    }
    if (
      !bool(variant.productIsActive) ||
      !bool(variant.variantIsActive) ||
      variant.deletedAt
    ) {
      throw unprocessable(`Menu '${productName}' sudah tidak tersedia`);
    }

    // Modifier: harga & batas (min/max) dihitung ulang dari database.
    const groupsRow = (await catalogRepo.loadVariantModifierGroups(
      entry.variantId,
      tx,
    )) as unknown as Record<string, unknown>;
    const groups = (Array.isArray(groupsRow.groups) ? groupsRow.groups : []) as Record<
      string,
      unknown
    >[];
    const options = (Array.isArray(groupsRow.options) ? groupsRow.options : []) as Record<
      string,
      unknown
    >[];
    const optionById = new Map<string, Record<string, unknown>>();
    for (const option of options) optionById.set(str(option.id), option);

    let modifiersTotalIdr = 0;
    const pickedByGroup = new Map<string, number>();
    for (const choice of entry.modifiers ?? []) {
      const option = optionById.get(choice.optionId);
      if (!option) {
        throw unprocessable(
          `Pilihan tambahan '${choice.optionId}' tidak tersedia untuk menu '${productName}'`,
        );
      }
      const quantity = Math.max(1, Math.trunc(choice.quantity));
      modifiersTotalIdr += num(option.priceDeltaIdr) * quantity;
      const groupId = str(option.groupId);
      pickedByGroup.set(groupId, (pickedByGroup.get(groupId) ?? 0) + quantity);
    }
    for (const group of groups) {
      const picked = pickedByGroup.get(str(group.groupId)) ?? 0;
      const minSelect = num(group.minSelect);
      const maxSelect = num(group.maxSelect);
      if (picked < minSelect) {
        throw unprocessable(
          minSelect > 1
            ? `Pilihan '${str(group.name)}' wajib dipilih minimal ${minSelect} item`
            : `Pilihan '${str(group.name)}' wajib dipilih`,
        );
      }
      if (maxSelect > 0 && picked > maxSelect) {
        throw unprocessable(
          `Pilihan '${str(group.name)}' maksimal ${maxSelect} item per menu`,
        );
      }
    }

    const quantity = Math.max(1, Math.trunc(entry.quantity));
    const unitPriceIdr = num(variant.priceIdr);
    const lineTotalIdr = (unitPriceIdr + modifiersTotalIdr) * quantity;

    items.push({
      productId,
      variantId: entry.variantId,
      productName,
      variantName: strOrNull(variant.variantName),
      quantity,
      unitPriceIdr,
      modifiersTotalIdr,
      lineTotalIdr,
      note: entry.note ?? null,
    });
  }

  return items;
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

  const reservedUntil = parseDate(input.reservedUntil);
  if (!reservedUntil) throw badRequest('Jam selesai tidak valid');
  if (reservedUntil.getTime() <= reservedFor.getTime()) {
    throw unprocessable('Jam selesai harus setelah jam mulai');
  }

  const durationMinutes = Math.round((reservedUntil.getTime() - reservedFor.getTime()) / 60_000);
  if (durationMinutes < 15) {
    throw unprocessable('Durasi reservasi minimal 15 menit');
  }
  if (reservedFor.getTime() <= Date.now()) {
    throw unprocessable('Waktu reservasi harus berada di masa depan');
  }

  // Pengaturan DP aktif (bisa diubah admin). Hanya dipakai untuk reservasi
  // baru; nominal reservasi lama tidak dihitung ulang.
  const depositSettings = await getDepositSettings();

  const created = await withTransaction(async (tx) => {
    const branch = await branchRepo.findBranchById(input.branchId, tx);
    if (!branch) throw notFound('Cabang', input.branchId);
    if (branch.isActive === false) throw unprocessable('Cabang ini sedang tidak melayani reservasi');

    // Validasi setiap ruangan (area). Reservasi kini per-ruangan, bukan per-meja.
    const rooms = [];
    for (const roomId of input.roomIds) {
      const area = await branchRepo.findAreaById(roomId, tx);
      if (!area) throw notFound('Ruangan', roomId);
      if (str(area.branchId) !== input.branchId) {
        throw unprocessable('Ruangan yang dipilih bukan bagian dari cabang ini');
      }
      if (area.isActive === false) {
        throw unprocessable(`Ruangan '${str(area.name)}' sedang tidak tersedia`);
      }
      rooms.push(area);
    }

    // Ruangan tidak boleh tumpang tindih jadwal dengan reservasi aktif lain.
    const overlapping = await reservationRepo.findOverlappingReservations(
      input.branchId,
      reservedFor,
      reservedUntil,
      null,
      tx,
    );
    const busyRoomIds = new Set(
      overlapping.flatMap((row) => (Array.isArray(row.roomIds) ? row.roomIds : []).map((v) => str(v))),
    );
    const clash = rooms.find((area) => busyRoomIds.has(str(area.id)));
    if (clash) {
      throw conflict(`Ruangan '${str(clash.name)}' sudah dibooking pada jam tersebut`);
    }

    // Sewa ruangan = Σ(harga per jam × jumlah jam). Dipotret saat dibuat.
    const hours = durationMinutes / 60;
    const roomTotalIdr = Math.round(
      rooms.reduce((total, area) => total + num(area.pricePerHourIdr) * hours, 0),
    );

    // Order menu (makanan/minuman) — dihargai ulang di server.
    const menuItems = await resolveReservationMenuItems(input.menuItems ?? [], tx);
    const menuTotalIdr = menuItems.reduce((total, item) => total + item.lineTotalIdr, 0);

    // TOTAL yang dibayar pelanggan = sewa ruangan + order menu. DP (uang muka)
    // dihitung dari total ini, jadi DP ikut menutup makanan & minuman.
    const totalEstimateIdr = roomTotalIdr + menuTotalIdr;

    // DP otomatis dari total: DP1 (persen + batas min/max dari pengaturan
    // admin), DP2 (persen dari sisa), pelunasan. Nominal TIDAK bisa ditimpa
    // klien/admin.
    const stages = computeDepositStages(totalEstimateIdr, depositSettings);
    const deposit1 = stages.deposit1;
    const deposit1Status = input.depositProofUrl ? 'paid' : 'unpaid';

    const reservationNumber = await generateUniqueReservationNumber();
    const inserted = await reservationRepo.insertReservation(
      {
        reservationNumber,
        userId,
        branchId: input.branchId,
        // area_id dipertahankan = ruangan utama (ruangan pertama).
        areaId: str(rooms[0].id),
        reservedFor,
        durationMinutes,
        guestCount: input.guestCount,
        contactName: input.contactName ?? null,
        contactPhone: input.contactPhone ?? null,
        specialRequests: input.specialRequests ?? null,
        areaPricePerHourIdr: num(rooms[0].pricePerHourIdr),
        totalEstimateIdr,
        roomTotalIdr,
        menuTotalIdr,
        depositAmountIdr: deposit1,
        depositStatus: deposit1Status,
        depositProofUrl: input.depositProofUrl ?? null,
        depositProofStorageKey: input.depositProofStorageKey ?? null,
        deposit1Paid: deposit1Status === 'paid',
        // DP2 & pelunasan sudah ditetapkan sistem (bukan admin).
        deposit2AmountIdr: stages.deposit2,
        deposit2Status: 'unpaid',
        settlementAmountIdr: stages.settlement,
        settlementStatus: 'unpaid',
      },
      tx,
    );
    if (!inserted) throw conflict('Reservasi gagal disimpan, silakan coba lagi');

    const reservationId = str(inserted.id);
    // Simpan detail order menu supaya admin & pelanggan tahu apa saja yang dibayar.
    await reservationRepo.insertReservationMenuItems(reservationId, menuItems, tx);
    await reservationRepo.replaceReservationRooms(
      reservationId,
      rooms.map((area) => str(area.id)),
      tx,
    );

    const reservation = await reservationRepo.findReservationById(reservationId, tx);
    const savedRooms = await reservationRepo.listReservationRooms(reservationId, tx);
    const savedMenu = await reservationRepo.listReservationMenuItems(reservationId, tx);

    return {
      reservation: shapeReservation({
        ...(reservation ?? { id: reservationId, reservationNumber }),
        rooms: savedRooms,
      }),
      rooms: savedRooms,
      menuItems: savedMenu.map((row) => shapeMenuItem(row as TableRow)),
    };
  });

  const contact = await loadContact(userId);
  return { ...created, contact };
}

// --------------------------------------------------------------------------
// POST /reservations/:id/deposit-charge (user bayar DP sendiri lewat Midtrans)
// --------------------------------------------------------------------------

/**
 * Pelanggan membuat pembayaran DP untuk reservasinya sendiri lewat Midtrans.
 *
 * Tahap (`stage`):
 *   deposit    → DP1 (flat per ruangan, dibayar saat mengisi formulir)
 *   deposit2   → DP2 (% dari sisa total setelah DP1)
 *   settlement → Pelunasan (sisa total − DP1 − DP2)
 *
 * Hanya pemilik reservasi yang boleh memanggil. DP1 boleh dibayar walau status
 * masih `requested` (memang diminta saat form); DP2/pelunasan menunggu
 * konfirmasi staff. Begitu pelanggan membayar, webhook Midtrans menandai tahap
 * itu `paid` (lihat `markReservationDepositPaid`).
 */
export async function createMyDepositCharge(
  userId: string,
  reservationId: string,
  input: {
    stage?: 'deposit' | 'deposit2' | 'settlement';
    paymentMethod?: string;
    idempotencyKey?: string | null;
  },
) {
  const reservation = await reservationRepo.findReservationById(reservationId);
  if (!reservation) throw notFound('Reservasi', reservationId);
  if (str(reservation.userId) !== userId) {
    throw forbidden('Reservasi ini bukan milik Anda');
  }

  const stage = input.stage ?? 'deposit';
  const status = reservation.status ? String(reservation.status) : null;
  if (status === 'cancelled' || status === 'no_show') {
    throw unprocessable('Reservasi sudah dibatalkan/tidak hadir sehingga DP tidak perlu dibayar');
  }
  if (status === 'requested' && stage !== 'deposit') {
    throw badRequest('Tunggu konfirmasi staff dulu sebelum membayar DP lanjutan');
  }

  const totalEstimateIdr = Number(reservation.totalEstimateIdr ?? 0);

  // Nominal selalu dari hitungan sistem — tidak bisa ditimpa klien.
  if (stage !== 'settlement' && totalEstimateIdr <= 0) {
    throw badRequest('Total sewa ruangan belum diketahui. Hubungi staff cabang');
  }
  const amountIdr = defaultDepositAmount(stage, reservation);
  if (!Number.isFinite(amountIdr) || amountIdr <= 0) {
    throw badRequest(
      stage === 'settlement'
        ? 'Tidak ada sisa yang perlu dilunasi'
        : 'Nominal DP belum tersedia. Hubungi staff cabang',
    );
  }

  const stageStatusField =
    stage === 'deposit' ? 'depositStatus' : stage === 'deposit2' ? 'deposit2Status' : 'settlementStatus';
  const currentStageStatus = reservation[stageStatusField]
    ? String(reservation[stageStatusField])
    : 'unpaid';
  if (currentStageStatus === 'paid') {
    throw unprocessable('Tahap pembayaran ini sudah lunas');
  }

  const paymentMethod = input.paymentMethod ?? 'qris';
  const idempotencyKey = input.idempotencyKey ?? `resv-${stage}-${reservationId}-${randomUUID()}`;
  const provider = 'midtrans';

  const payment = await withTransaction(async (tx) => {
    const inserted = await paymentRepo.insertPayment(
      {
        reservationId,
        provider,
        paymentMethod,
        idempotencyKey,
        transactionType: 'charge',
        paymentPurpose: 'reservation_deposit',
        paymentStage: stage,
        amountIdr,
      },
      tx,
    );

    await reservationRepo.updateReservationDepositStage(
      reservationId,
      stage === 'deposit' ? '' : stage === 'deposit2' ? 'deposit2' : 'settlement',
      { amountIdr, status: 'pending' },
      tx,
    );

    const stageLabel = stage === 'deposit' ? 'DP1' : stage === 'deposit2' ? 'DP2' : 'Pelunasan';
    await reservationRepo.insertReservationStatusHistory(
      {
        reservationId,
        fromStatus: status,
        toStatus: status ?? 'requested',
        note: `Pelanggan membuka pembayaran ${stageLabel} (Rp${amountIdr.toLocaleString('id-ID')})`,
        actorUserId: null,
      },
      tx,
    );

    return inserted;
  });

  // Panggil gateway di luar transaksi (Midtrans Snap → redirect_url).
  let paymentUrl: string | null = null;
  let expiresAt: Date | null = null;
  try {
    const charge = await getPaymentGateway().createCharge({
      paymentId: String(payment!.id),
      provider,
      paymentMethod,
      amountIdr,
      currency: 'IDR',
      paymentPurpose: 'reservation_deposit',
      reservationId,
      idempotencyKey,
    });
    paymentUrl = charge.instructions?.paymentUrl ?? null;
    expiresAt = charge.expiresAt ?? null;
    await paymentRepo.updatePaymentStatus(
      String(payment!.id),
      { status: 'pending', paymentUrl, expiresAt },
      undefined,
    );
  } catch (error) {
    await paymentRepo.updatePaymentStatus(String(payment!.id), { status: 'failed' }, undefined);
    throw error;
  }

  return {
    payment: {
      id: String(payment!.id),
      stage,
      status: 'pending',
      amountIdr,
      paymentMethod,
      paymentUrl,
      expiresAt: iso(expiresAt),
    },
  };
}

// --------------------------------------------------------------------------
// POST /reservations/:id/deposit-proof (pelanggan unggah bukti transfer DP)
// --------------------------------------------------------------------------

/**
 * Pelanggan mengunggah bukti transfer untuk sebuah tahap DP **setelah tahap itu
 * lunas** (mis. pembayaran Midtrans berhasil). Bukti bersifat arsip/konfirmasi:
 * status tahap tidak diubah (tetap `paid`), hanya URL bukti yang disimpan dan
 * dicatat di riwayat agar staff bisa mencocokkan.
 *
 * Hanya pemilik reservasi yang boleh memanggil. DP2/pelunasan hanya bisa
 * diunggah setelah reservasi dikonfirmasi.
 */
export async function uploadMyDepositProof(
  userId: string,
  reservationId: string,
  input: {
    stage?: 'deposit' | 'deposit2' | 'settlement';
    data: string;
    contentType?: string;
    note?: string | null;
  },
) {
  const reservation = await reservationRepo.findReservationById(reservationId);
  if (!reservation) throw notFound('Reservasi', reservationId);
  if (str(reservation.userId) !== userId) {
    throw forbidden('Reservasi ini bukan milik Anda');
  }

  const status = reservation.status ? String(reservation.status) : null;
  if (status === 'cancelled' || status === 'no_show') {
    throw unprocessable('Reservasi sudah dibatalkan/tidak hadir sehingga bukti DP tidak diperlukan');
  }

  const stage = input.stage ?? 'deposit2';
  if (status === 'requested' && stage !== 'deposit') {
    throw badRequest('Tunggu konfirmasi staff dulu sebelum mengunggah bukti DP lanjutan');
  }

  const statusField =
    stage === 'deposit' ? 'depositStatus' : stage === 'deposit2' ? 'deposit2Status' : 'settlementStatus';
  const currentStageStatus = String(reservation[statusField] ?? 'unpaid');
  // Bukti transfer baru diminta setelah tahap ini lunas (pembayaran Midtrans
  // berhasil). Sebelum lunas, pelanggan cukup membayar lewat tombol bayar.
  if (currentStageStatus !== 'paid') {
    throw unprocessable(
      'Tahap ini belum lunas. Selesaikan pembayarannya dulu, lalu unggah bukti transfer sebagai konfirmasi.',
    );
  }

  const amountIdr = defaultDepositAmount(stage, reservation);
  if (!Number.isFinite(amountIdr) || amountIdr <= 0) {
    throw badRequest('Nominal DP belum tersedia. Hubungi staff cabang');
  }

  // Simpan berkas ke object storage lebih dulu (di luar transaksi DB).
  const uploaded = await storageService.uploadImage({
    data: input.data,
    contentType: input.contentType,
    folder: 'deposits',
  });

  const prefix: '' | 'deposit2' | 'settlement' =
    stage === 'deposit2' ? 'deposit2' : stage === 'settlement' ? 'settlement' : '';
  const stageLabel = stage === 'deposit' ? 'DP1' : stage === 'deposit2' ? 'DP2' : 'Pelunasan';

  await withTransaction(async (tx) => {
    // Status tidak diubah (tetap 'paid'); hanya bukti & catatan yang disimpan.
    await reservationRepo.updateReservationDepositStage(
      reservationId,
      prefix,
      {
        amountIdr,
        proofUrl: uploaded.publicUrl,
        proofStorageKey: uploaded.storageKey,
        note: input.note ?? null,
      },
      tx,
    );

    await reservationRepo.insertReservationStatusHistory(
      {
        reservationId,
        fromStatus: status,
        toStatus: status ?? 'confirmed',
        note: `Pelanggan mengunggah bukti transfer ${stageLabel} (Rp${amountIdr.toLocaleString('id-ID')})`,
        actorUserId: userId,
      },
      tx,
    );
  });

  return {
    stage,
    status: 'paid' as const,
    amountIdr,
    proofUrl: uploaded.publicUrl,
    proofStorageKey: uploaded.storageKey,
  };
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

  const [rooms, history, menuItems] = await Promise.all([
    reservationRepo.listReservationRooms(reservationId),
    reservationRepo.listReservationStatusHistory(reservationId),
    reservationRepo.listReservationMenuItems(reservationId),
  ]);
  return {
    reservation: shapeReservation({ ...reservation, rooms }),
    rooms,
    menuItems: menuItems.map((row) => shapeMenuItem(row as TableRow)),
    history: history.map(shapeStatusHistory),
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

    // Lepas ruangan supaya bisa dipesan ulang pada jam yang sama.
    await reservationRepo.replaceReservationRooms(reservationId, [], tx);

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
 * Ketersediaan satu tanggal: jam operasional cabang, daftar ruangan yang bebas,
 * dan slot jam (mulai) yang masih bisa dipesan. Reservasi kini per-ruangan.
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
  const booked = (await reservationRepo.findOverlappingReservations(
    branchId,
    dayStart,
    new Date(`${dayEnd}T00:00:00${WIB_OFFSET}`),
    null,
    db,
  )) as unknown as TableRow[];

  // Ruangan aktif cabang (opsional difilter ke satu area).
  const allAreas = (await branchRepo.listAreas(branchId, true, db)) as unknown as TableRow[];
  const areas = areaId ? allAreas.filter((area) => str(area.id) === areaId) : allAreas;
  const totalCapacity = areas.reduce((total, area) => total + num(area.totalCapacity), 0);

  const freeSlots: Array<Record<string, unknown>> = [];
  let busySlotCount = 0;
  let slotCount = 0;
  const openingTime = strOrNull(hours[0].opensAt);
  const closingTime = strOrNull(hours[hours.length - 1].closesAt);

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

      // Ruangan yang tidak tumpang tindih reservasi aktif pada slot ini.
      const busy = new Set(
        booked
          .filter((entry) => intervalsOverlap(entry, cursor, slotEnd))
          .flatMap((entry) => roomIdsOf(entry)),
      );
      const freeRooms = areas.filter((area) => !busy.has(str(area.id)));
      if (freeRooms.length === 0) {
        busySlotCount += 1;
        continue;
      }

      freeSlots.push({
        startTime: cursor.toISOString(),
        endTime: slotEnd.toISOString(),
        freeRoomCount: freeRooms.length,
        freeRoomIds: freeRooms.map((area) => str(area.id)),
        availableTableCount: freeRooms.length,
        maxGuests: freeRooms.reduce((total, area) => total + num(area.totalCapacity), 0),
      });
    }
  }

  return {
    date,
    dayOfWeek: dayOfWeek(date),
    isOpen: true,
    isAvailable: freeSlots.length > 0,
    openingTime,
    closingTime,
    busyReservationCount: booked.length,
    busySlotCount,
    maxGuests: totalCapacity,
    roomCount: areas.length,
    freeSlots,
  };
}

/** Daftar id ruangan pada satu baris reservasi (kolom array atau area utama). */
function roomIdsOf(row: TableRow): string[] {
  if (Array.isArray(row.roomIds)) return row.roomIds.map((value) => str(value));
  if (Array.isArray(row.room_ids)) return row.room_ids.map((value) => str(value));
  const single = row.areaId ?? row.area_id;
  return single ? [str(single)] : [];
}

/** Apakah rentang reservasi bertumpang tindih dengan jendela slot. */
function intervalsOverlap(entry: TableRow, slotStart: Date, slotEnd: Date): boolean {
  const start = parseDate(entry.reservedFor ?? entry.reserved_for);
  if (!start) return false;
  const minutes = num(entry.durationMinutes ?? entry.duration_minutes) || DEFAULT_DURATION_MINUTES;
  const end = new Date(start.getTime() + minutes * 60_000);
  return start.getTime() < slotEnd.getTime() && end.getTime() > slotStart.getTime();
}