import { withTransaction } from '../config/database.js';
import { notFound, unprocessable } from '../errors/AppError.js';
import * as branchRepo from '../repositories/branch.repository.js';
import * as storeRepo from '../repositories/store.repository.js';
import { num, str, strOrNull, toIsoOrNull } from '../utils/serialize.js';
import type {
  UpdateStoreScheduleInput,
  UpdateStoreStatusInput,
} from '../validators/store.validator.js';

const DEFAULT_OPENS_AT = '09:00';
const DEFAULT_CLOSES_AT = '22:00';
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  dayOfWeek: number;
}

function zonedParts(date: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
    dayOfWeek: Math.max(0, DAY_NAMES.indexOf(parts.weekday)),
  };
}

/** Selisih zona waktu terhadap UTC pada tanggal tertentu, dalam menit. */
function timezoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = zonedParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const timestamp = Math.floor(date.getTime() / 1000) * 1000;
  return (asUtc - timestamp) / 60_000;
}

/** Bangun Date UTC dari jam dinding lokal pada timezone cabang. */
function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const firstOffset = timezoneOffsetMinutes(new Date(guess), timeZone);
  let timestamp = guess - firstOffset * 60_000;
  const secondOffset = timezoneOffsetMinutes(new Date(timestamp), timeZone);
  if (secondOffset !== firstOffset) {
    timestamp = guess - secondOffset * 60_000;
  }
  return new Date(timestamp);
}

function localDateAfterDays(base: ZonedParts, dayOffset: number) {
  const date = new Date(Date.UTC(base.year, base.month - 1, base.day + dayOffset));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function clockToMinutes(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  return (hour ?? 0) * 60 + (minute ?? 0);
}

function normalizeClock(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const match = /^(\d{2}):(\d{2})/.exec(String(value));
  if (!match) return null;
  return `${match[1]}:${match[2]}`;
}

function nextOccurrence(now: Date, timeZone: string, clock: string): string | null {
  const [hour, minute] = clock.split(':').map(Number);
  const base = zonedParts(now, timeZone);
  for (let dayOffset = 0; dayOffset <= 7; dayOffset += 1) {
    const date = localDateAfterDays(base, dayOffset);
    const candidate = zonedDateTimeToUtc(
      date.year,
      date.month,
      date.day,
      hour ?? 0,
      minute ?? 0,
      timeZone,
    );
    if (candidate.getTime() > now.getTime()) return candidate.toISOString();
  }
  return null;
}

function isOpenAt(
  now: Date,
  timeZone: string,
  opensAt: string,
  closesAt: string,
): boolean {
  const opens = clockToMinutes(opensAt);
  const closes = clockToMinutes(closesAt);
  const local = zonedParts(now, timeZone);
  const current = local.hour * 60 + local.minute;

  if (opens === closes) return false;
  // Jam tutup lebih kecil dari jam buka berarti melewati tengah malam.
  if (closes < opens) return current >= opens || current < closes;
  return current >= opens && current < closes;
}

function shapeSchedule(rows: storeRepo.StoreScheduleRow[]) {
  const first = rows[0];
  const opensAt = normalizeClock(first?.opensAt) ?? DEFAULT_OPENS_AT;
  const closesAt = normalizeClock(first?.closesAt) ?? DEFAULT_CLOSES_AT;
  const days = new Set(rows.map((row) => num(row.dayOfWeek))).size;
  return {
    opensAt,
    closesAt,
    isConfigured: rows.length > 0,
    dayCount: days,
  };
}

async function requireBranch(branchId: string) {
  const branch = await branchRepo.findBranchById(branchId);
  if (!branch || !branch.isActive) throw notFound('Cabang', branchId);
  return branch;
}

// --------------------------------------------------------------------------
// GET /admin/store?branchId=...
// --------------------------------------------------------------------------
export async function getStore(branchId: string) {
  const branch = await requireBranch(branchId);
  const [statusRow, scheduleRows] = await Promise.all([
    storeRepo.findStatus(branchId),
    storeRepo.listSchedule(branchId),
  ]);

  const timezone = strOrNull(branch.timezone) ?? 'Asia/Jakarta';
  const schedule = shapeSchedule(scheduleRows);
  const mode = statusRow?.mode ?? 'auto';
  const now = new Date();
  const isOpen =
    mode === 'open'
      ? true
      : mode === 'closed'
        ? false
        : isOpenAt(now, timezone, schedule.opensAt, schedule.closesAt);
  const today = zonedParts(now, timezone);

  return {
    branchId,
    branchName: str(branch.name),
    timezone,
    mode,
    isOpen,
    source: mode === 'auto' ? 'schedule' : 'manual',
    schedule,
    today: {
      dayOfWeek: today.dayOfWeek,
      opensAt: schedule.opensAt,
      closesAt: schedule.closesAt,
    },
    nextOpenAt: nextOccurrence(now, timezone, schedule.opensAt),
    nextCloseAt: nextOccurrence(now, timezone, schedule.closesAt),
    updatedAt: toIsoOrNull(statusRow?.updatedAt),
    updatedByName: strOrNull(statusRow?.updatedByName),
  };
}

// --------------------------------------------------------------------------
// GET /store/status?branchId=...
// Status publik untuk web pelanggan. Tanpa branchId, pakai cabang aktif
// pertama supaya popup/pemberitahuan bisa tampil sejak halaman awal dibuka.
// --------------------------------------------------------------------------
export async function getPublicStoreStatus(branchId?: string) {
  let targetBranchId = branchId;

  if (!targetBranchId) {
    const rows = await branchRepo.listBranches(
      { limit: 1, offset: 0 },
      { isActive: true },
    );
    const first = rows[0] as Record<string, unknown> | undefined;
    if (!first) throw notFound('Cabang aktif', 'default');
    targetBranchId = String(first.id);
  }

  const store = await getStore(targetBranchId);

  return {
    branchId: store.branchId,
    branchName: store.branchName,
    timezone: store.timezone,
    mode: store.mode,
    isOpen: store.isOpen,
    source: store.source,
    schedule: store.schedule,
    today: store.today,
    nextOpenAt: store.nextOpenAt,
    nextCloseAt: store.nextCloseAt,
    updatedAt: store.updatedAt,
  };
}

// --------------------------------------------------------------------------
// PATCH /admin/store/status
// --------------------------------------------------------------------------
export async function updateStoreStatus(
  actorUserId: string,
  input: UpdateStoreStatusInput,
) {
  await requireBranch(input.branchId);
  const updated = await storeRepo.upsertStatus(
    input.branchId,
    input.mode,
    actorUserId,
  );
  if (!updated) throw unprocessable('Status toko gagal disimpan');
  return getStore(input.branchId);
}

// --------------------------------------------------------------------------
// PUT /admin/store/schedule
// --------------------------------------------------------------------------
export async function updateStoreSchedule(
  actorUserId: string,
  input: UpdateStoreScheduleInput,
) {
  await requireBranch(input.branchId);

  await withTransaction(async (tx) => {
    const current = await storeRepo.findStatus(input.branchId, tx);
    await storeRepo.replaceDailySchedule(
      input.branchId,
      input.opensAt,
      input.closesAt,
      tx,
    );
    // Catat siapa yang terakhir mengubah pengaturan toko tanpa mengubah mode.
    await storeRepo.upsertStatus(
      input.branchId,
      current?.mode ?? 'auto',
      actorUserId,
      tx,
    );
  });

  return getStore(input.branchId);
}
