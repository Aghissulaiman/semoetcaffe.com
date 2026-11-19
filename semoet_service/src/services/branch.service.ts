import * as branchRepo from '../repositories/branch.repository.js';
import { notFound } from '../errors/AppError.js';
import { buildPaginationMeta, parsePagination, type Pagination } from '../utils/pagination.js';
import { num, strOrNull, toIsoOrNull } from '../utils/serialize.js';
import type {
  ListBranchQuery,
  ListTableQuery,
} from '../validators/catalog.validator.js';

export interface Paginated<T> {
  items: T[];
  meta: ReturnType<typeof buildPaginationMeta>;
}

function hasCoordinates(query: { latitude?: number; longitude?: number }): boolean {
  return typeof query.latitude === 'number' && typeof query.longitude === 'number';
}

function shapeBranch(row: Record<string, unknown>) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    phone: strOrNull(row.phone),
    address: row.address,
    timezone: row.timezone,
    latitude: num(row.latitude),
    longitude: num(row.longitude),
    isActive: Boolean(row.isActive),
    distanceKm: row.distanceKm === null || row.distanceKm === undefined ? null : num(row.distanceKm, 0),
  };
}

function shapeArea(row: Record<string, unknown>) {
  return {
    id: row.id,
    branchId: row.branchId,
    name: row.name,
    areaType: row.areaType,
    pricePerHourIdr: row.pricePerHourIdr == null ? null : num(row.pricePerHourIdr),
    imageUrl: strOrNull(row.imageUrl),
    isActive: Boolean(row.isActive),
    tableCount: num(row.tableCount),
    totalCapacity: num(row.totalCapacity),
  };
}

function shapeTable(row: Record<string, unknown>) {
  return {
    id: row.id,
    areaId: row.areaId,
    tableCode: row.tableCode,
    capacity: num(row.capacity),
    isActive: Boolean(row.isActive),
    areaName: strOrNull(row.areaName),
    areaType: strOrNull(row.areaType),
  };
}

// --------------------------------------------------------------------------
// GET /branches
// --------------------------------------------------------------------------
export async function listBranches(query: ListBranchQuery): Promise<Paginated<unknown>> {
  const paging = parsePagination(query);

  const filters: branchRepo.ListBranchFilters = {
    isActive: query.isActive,
    q: query.q,
    latitude: query.latitude,
    longitude: query.longitude,
    radiusKm: query.radiusKm,
    withDistance: hasCoordinates(query),
  };

  const rows = await branchRepo.listBranches(paging, filters);
  const total = await branchRepo.countBranches(filters);

  const pagination: Pagination = { page: paging.page, limit: paging.limit, offset: paging.offset, total };

  return {
    items: rows.map(shapeBranch),
    meta: buildPaginationMeta(pagination),
  };
}

// --------------------------------------------------------------------------
// GET /branches/:id
// --------------------------------------------------------------------------
export async function getBranchDetail(branchId: string) {
  const branch = await branchRepo.findBranchById(branchId);
  if (!branch || !branch.isActive) throw notFound('Cabang', branchId);

  const [businessHours, areas] = await Promise.all([
    branchRepo.listBusinessHours(branchId),
    branchRepo.listAreas(branchId, true),
  ]);

  return {
    branch: shapeBranch(branch),
    businessHours: businessHours.map((row) => ({
      dayOfWeek: num(row.dayOfWeek),
      opensAt: toIsoOrNull(row.opensAt),
      closesAt: toIsoOrNull(row.closesAt),
      serviceType: row.serviceType,
    })),
    areas: areas.map(shapeArea),
  };
}

// --------------------------------------------------------------------------
// GET /branches/:id/hours
// --------------------------------------------------------------------------
const DAY_MS = 24 * 60 * 60 * 1000;

function minutesInTimezone(date: Date, timezone: string): number {
  // Ambil jam-menit lokal pada timezone cabang tanpa library timezone.
  // Intl sudah tersedia di Node dan menangani DST.
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  const hours = Number(parts.hour) % 24;
  return hours * 60 + Number(parts.minute);
}

function dayOfWeekInTimezone(date: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' });
  const label = formatter.format(date);
  return DAY_NAMES.indexOf(label); // 0 = Minggu ... 6 = Sabtu
}

/** "09:00" -> 540 menit, atau null bila format tidak dikenal. */
function toMinutes(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export async function getBranchHours(branchId: string) {
  const branch = await branchRepo.findBranchById(branchId);
  if (!branch || !branch.isActive) throw notFound('Cabang', branchId);

  const timezone = strOrNull(branch.timezone) ?? 'Asia/Jakarta';
  const rows = await branchRepo.listBusinessHours(branchId);
  const hours = rows.map((row) => ({
    id: row.id,
    dayOfWeek: num(row.dayOfWeek),
    opensAt: toIsoOrNull(row.opensAt),
    closesAt: toIsoOrNull(row.closesAt),
    serviceType: row.serviceType,
  }));

  const now = new Date();
  const currentDay = dayOfWeekInTimezone(now, timezone);
  const nowMinutes = minutesInTimezone(now, timezone);

  const todaysRows = rows.filter((row) => num(row.dayOfWeek) === currentDay);
  const todaysHours = todaysRows
    .map((row) => ({
      opens: toMinutes(row.opensAt),
      closes: toMinutes(row.closesAt),
    }))
    .filter((slot): slot is { opens: number; closes: number } => slot.opens !== null && slot.closes !== null);

  const isOpenNow = todaysHours.some(
    (slot) => slot.opens <= nowMinutes && nowMinutes < slot.closes,
  );

  // Jam buka berikutnya: cek hari ini dulu, lalu 7 hari ke depan.
  let nextOpenAt: string | null = null;
  if (!isOpenNow) {
    for (let dayOffset = 0; dayOffset <= 7 && !nextOpenAt; dayOffset += 1) {
      const targetDay = (currentDay + dayOffset) % 7;
      const candidate = rows.find(
        (row) => num(row.dayOfWeek) === targetDay && toMinutes(row.opensAt) !== null,
      );
      if (!candidate) continue;
      const opensMinutes = toMinutes(candidate.opensAt);
      if (opensMinutes === null) continue;
      // Perkiraan hari buka berikutnya; cukup untuk ditampilkan di aplikasi.
      const base = new Date(now.getTime() + dayOffset * DAY_MS);
      base.setHours(Math.floor(opensMinutes / 60), opensMinutes % 60, 0, 0);
      if (base.getTime() > now.getTime()) nextOpenAt = base.toISOString();
    }
  }

  const nextCloseAt = isOpenNow
    ? todaysHours
        .filter((slot) => slot.closes > nowMinutes)
        .sort((a, b) => a.closes - b.closes)[0]?.closes
    : undefined;

  return {
    branchId,
    timezone,
    hours,
    isOpenNow,
    nextOpenAt,
    nextCloseAt:
      nextCloseAt === undefined
        ? null
        : new Date(now.getTime() + (nextCloseAt - nowMinutes) * 60_000).toISOString(),
  };
}

// --------------------------------------------------------------------------
// GET /branches/:id/tables
// --------------------------------------------------------------------------
export async function listTables(branchId: string, query: ListTableQuery): Promise<Paginated<unknown>> {
  const exists = await branchRepo.branchExists(branchId);
  if (!exists) throw notFound('Cabang', branchId);

  const paging = parsePagination(query);
  const filters: branchRepo.ListTableFilters = {
    areaId: query.areaId,
    isActive: query.isActive,
    minCapacity: query.minCapacity,
  };

  const rows = await branchRepo.listTables(branchId, paging, filters);
  const total = await branchRepo.countTables(branchId, filters);

  const pagination: Pagination = { page: paging.page, limit: paging.limit, offset: paging.offset, total };

  return {
    items: rows.map(shapeTable),
    meta: buildPaginationMeta(pagination),
  };
}

// --------------------------------------------------------------------------
// GET /branches/:id/areas
// --------------------------------------------------------------------------
export async function listAreas(branchId: string, isActive?: boolean) {
  const exists = await branchRepo.branchExists(branchId);
  if (!exists) throw notFound('Cabang', branchId);

  const rows = await branchRepo.listAreas(branchId, isActive);
  return rows.map(shapeArea);
}

// --------------------------------------------------------------------------
// GET /tables/:id
// --------------------------------------------------------------------------
export async function getTable(tableId: string) {
  const table = await branchRepo.findTableById(tableId);
  if (!table) throw notFound('Meja', tableId);

  const [area, activeOrder] = await Promise.all([
    branchRepo.findAreaById(String(table.areaId)),
    branchRepo.findActiveOrderByTable(tableId),
  ]);

  return {
    table: shapeTable(table),
    area: area ? shapeArea(area) : null,
    activeOrder: activeOrder
      ? { id: activeOrder.id, orderNumber: activeOrder.orderNumber, orderStatus: activeOrder.orderStatus }
      : null,
  };
}

// --------------------------------------------------------------------------
// GET /tables/qr/:token (scan QR meja di kasir)
// --------------------------------------------------------------------------
export async function resolveTableByQr(token: string) {
  const table = await branchRepo.findTableByQrToken(token);
  if (!table) throw notFound('Meja dengan QR tersebut');

  return {
    table: shapeTable(table),
    branch: {
      id: table.branchId,
      code: table.branchCode,
      name: table.branchName,
      address: table.branchAddress,
    },
    areaName: strOrNull(table.areaName),
    areaType: strOrNull(table.areaType),
  };
}