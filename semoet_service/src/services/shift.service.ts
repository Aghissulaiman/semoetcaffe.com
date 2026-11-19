import { withTransaction } from '../config/database.js';
import { conflict, notFound, unprocessable } from '../errors/AppError.js';
import * as branchRepo from '../repositories/branch.repository.js';
import * as shiftRepo from '../repositories/shift.repository.js';
import {
  buildPaginationMeta,
  parsePagination,
  type Pagination,
} from '../utils/pagination.js';
import { iso, num, str, strOrNull } from '../utils/serialize.js';
import type {
  ActiveShiftQuery,
  CloseShiftInput,
  HandoverShiftInput,
  ListShiftQuery,
  StartShiftInput,
  UpdateShiftPlanInput,
} from '../validators/shift.validator.js';

export interface Paginated<T> {
  items: T[];
  meta: ReturnType<typeof buildPaginationMeta>;
}

function shapeStaffAccount(row: Record<string, unknown>) {
  const roleCodes = Array.isArray(row.roleCodes)
    ? row.roleCodes.map((code) => str(code))
    : [];
  return {
    id: str(row.id),
    displayName: str(row.displayName),
    email: strOrNull(row.email),
    phoneE164: strOrNull(row.phoneE164),
    lastLoginAt: iso(row.lastLoginAt),
    roleCodes,
  };
}

function shapeShift(row: Record<string, unknown>) {
  const openedAt = iso(row.openedAt);
  const closedAt = iso(row.closedAt);
  const plannedStartAt = iso(row.plannedStartAt);
  const plannedEndAt = iso(row.plannedEndAt);
  const openingCashIdr = num(row.openingCashIdr);
  const closingCashIdr =
    row.closingCashIdr === null || row.closingCashIdr === undefined
      ? null
      : num(row.closingCashIdr);
  const salesIdr = num(row.salesIdr);
  const cashSalesIdr = num(row.cashSalesIdr);
  const expectedCashIdr = openingCashIdr + cashSalesIdr;

  const start = openedAt ? new Date(openedAt).getTime() : Date.now();
  const end = closedAt ? new Date(closedAt).getTime() : Date.now();
  const durationMinutes = Number.isFinite(start)
    ? Math.max(0, Math.round((end - start) / 60_000))
    : 0;

  const plannedDurationMinutes =
    plannedStartAt && plannedEndAt
      ? Math.max(
          0,
          Math.round(
            (new Date(plannedEndAt).getTime() -
              new Date(plannedStartAt).getTime()) /
              60_000,
          ),
        )
      : null;

  return {
    id: str(row.id),
    branchId: str(row.branchId),
    branchName: strOrNull(row.branchName),
    staffUserId: str(row.staffUserId),
    staffName: str(row.staffName),
    staffEmail: strOrNull(row.staffEmail),
    status: str(row.status),
    openedAt,
    closedAt,
    plannedStartAt,
    plannedEndAt,
    plannedDurationMinutes,
    durationMinutes,
    openingCashIdr,
    closingCashIdr,
    expectedCashIdr,
    cashDifferenceIdr:
      closingCashIdr === null ? null : closingCashIdr - expectedCashIdr,
    notes: strOrNull(row.notes),
    closingNotes: strOrNull(row.closingNotes),
    openedByName: strOrNull(row.openedByName),
    closedByName: strOrNull(row.closedByName),
    orderCount: num(row.orderCount),
    salesIdr,
    cashSalesIdr,
    nonCashSalesIdr: Math.max(0, salesIdr - cashSalesIdr),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

async function requireBranch(branchId: string): Promise<void> {
  const exists = await branchRepo.branchExists(branchId);
  if (!exists) throw notFound('Cabang', branchId);
}

// --------------------------------------------------------------------------
// GET /admin/shifts/staff
// --------------------------------------------------------------------------
export async function listShiftStaff() {
  const rows = await shiftRepo.listStaffAccounts();
  return rows.map((row) => shapeStaffAccount(row as Record<string, unknown>));
}

// --------------------------------------------------------------------------
// GET /admin/shifts/active?branchId=...
// --------------------------------------------------------------------------
export async function activeShift(query: ActiveShiftQuery) {
  await requireBranch(query.branchId);
  const row = await shiftRepo.findActiveShift(query.branchId);
  return { shift: row ? shapeShift(row as Record<string, unknown>) : null };
}

// --------------------------------------------------------------------------
// GET /admin/shifts?branchId=...
// --------------------------------------------------------------------------
export async function listShifts(query: ListShiftQuery): Promise<Paginated<unknown>> {
  await requireBranch(query.branchId);
  const paging = parsePagination(query);
  const rows = await shiftRepo.listShifts(query.branchId, paging);
  const total = await shiftRepo.countShifts(query.branchId);

  const pagination: Pagination = {
    page: paging.page,
    limit: paging.limit,
    offset: paging.offset,
    total,
  };
  return {
    items: rows.map((row) => shapeShift(row as Record<string, unknown>)),
    meta: buildPaginationMeta(pagination),
  };
}

// --------------------------------------------------------------------------
// POST /admin/shifts/start
// --------------------------------------------------------------------------
export async function startShift(actorUserId: string, input: StartShiftInput) {
  await requireBranch(input.branchId);

  // Akun shift harus benar-benar terdaftar sebagai role staff, bukan nama bebas.
  const staff = await shiftRepo.findStaffAccount(input.staffUserId);
  if (!staff) {
    throw unprocessable(
      'Akun yang dipilih bukan akun staf aktif dengan role Staff',
      [{ field: 'staffUserId', message: 'Pilih akun yang memiliki role Staff' }],
    );
  }

  return withTransaction(async (tx) => {
    // Cegah dua terminal membuka shift untuk cabang/akun yang sama bersamaan.
    await tx.advisoryLock(`shift:branch:${input.branchId}`);
    await tx.advisoryLock(`shift:staff:${input.staffUserId}`);

    const branchShift = await shiftRepo.findActiveShift(input.branchId, tx);
    if (branchShift) {
      throw conflict(
        `Cabang ini masih memiliki shift aktif milik ${str(branchShift.staffName)}. Tutup shift tersebut terlebih dahulu.`,
      );
    }

    const staffShift = await shiftRepo.findActiveShiftForStaff(input.staffUserId, tx);
    if (staffShift) {
      throw conflict(
        `Akun ${str(staffShift.staffName)} masih memiliki shift aktif di ${str(staffShift.branchName)}.`,
      );
    }

    const inserted = await shiftRepo.insertShift(
      {
        branchId: input.branchId,
        staffUserId: input.staffUserId,
        openingCashIdr: input.openingCashIdr,
        plannedStartAt: input.plannedStartAt ?? null,
        plannedEndAt: input.plannedEndAt ?? null,
        notes: input.notes ?? null,
        openedBy: actorUserId,
      },
      tx,
    );
    if (!inserted) throw unprocessable('Shift gagal dibuka, coba lagi');

    const row = await shiftRepo.findShiftById(str(inserted.id), tx);
    if (!row) throw unprocessable('Shift gagal dimuat setelah dibuat');
    return shapeShift(row as Record<string, unknown>);
  });
}

// --------------------------------------------------------------------------
// POST /admin/shifts/:id/close
// --------------------------------------------------------------------------
export async function closeShift(
  actorUserId: string,
  shiftId: string,
  input: CloseShiftInput,
) {
  return withTransaction(async (tx) => {
    const locked = await shiftRepo.lockShiftRow(shiftId, tx);
    if (!locked) throw notFound('Shift', shiftId);
    if (str(locked.status) !== 'open') throw conflict('Shift ini sudah ditutup');

    await shiftRepo.closeShift(
      shiftId,
      input.closingCashIdr,
      input.notes ?? null,
      actorUserId,
      tx,
    );

    const row = await shiftRepo.findShiftById(shiftId, tx);
    if (!row) throw unprocessable('Shift gagal dimuat setelah ditutup');
    return shapeShift(row as Record<string, unknown>);
  });
}

// --------------------------------------------------------------------------
// PATCH /admin/shifts/:id/plan
// Ubah jam rencana pada shift yang masih terbuka.
// --------------------------------------------------------------------------
export async function updateShiftPlan(
  shiftId: string,
  input: UpdateShiftPlanInput,
) {
  return withTransaction(async (tx) => {
    const locked = await shiftRepo.lockShiftRow(shiftId, tx);
    if (!locked) throw notFound('Shift', shiftId);
    if (str(locked.status) !== 'open') throw conflict('Shift ini sudah ditutup');

    const updated = await shiftRepo.updateShiftPlan(
      shiftId,
      input.plannedStartAt,
      input.plannedEndAt,
      tx,
    );
    if (!updated) throw unprocessable('Shift gagal diperbarui');

    const row = await shiftRepo.findShiftById(shiftId, tx);
    if (!row) throw unprocessable('Shift gagal dimuat setelah diperbarui');
    return shapeShift(row as Record<string, unknown>);
  });
}

// --------------------------------------------------------------------------
// POST /admin/shifts/:id/handover
// Tutup shift lama lalu buka shift baru dalam satu transaksi supaya tidak ada
// celah waktu di mana cabang tidak punya shift aktif.
// --------------------------------------------------------------------------
export async function handoverShift(
  actorUserId: string,
  shiftId: string,
  input: HandoverShiftInput,
) {
  return withTransaction(async (tx) => {
    const locked = await shiftRepo.lockShiftRow(shiftId, tx);
    if (!locked) throw notFound('Shift', shiftId);
    if (str(locked.status) !== 'open') throw conflict('Shift ini sudah ditutup');

    const branchId = str(locked.branchId);
    const currentStaffUserId = str(locked.staffUserId);
    if (input.staffUserId === currentStaffUserId) {
      throw unprocessable(
        'Pilih akun staf lain untuk shift berikutnya',
        [{ field: 'staffUserId', message: 'Akun shift berikutnya harus berbeda' }],
      );
    }

    await requireBranch(branchId);

    // Akun shift berikutnya juga harus akun aktif dengan role Staff.
    const staff = await shiftRepo.findStaffAccount(input.staffUserId, tx);
    if (!staff) {
      throw unprocessable(
        'Akun yang dipilih bukan akun staf aktif dengan role Staff',
        [{ field: 'staffUserId', message: 'Pilih akun yang memiliki role Staff' }],
      );
    }

    await tx.advisoryLock(`shift:branch:${branchId}`);
    await tx.advisoryLock(`shift:staff:${input.staffUserId}`);

    const staffShift = await shiftRepo.findActiveShiftForStaff(input.staffUserId, tx);
    if (staffShift) {
      throw conflict(
        `Akun ${str(staffShift.staffName)} masih memiliki shift aktif di ${str(staffShift.branchName)}.`,
      );
    }

    await shiftRepo.closeShift(
      shiftId,
      input.closingCashIdr,
      input.closingNotes ?? null,
      actorUserId,
      tx,
    );

    const inserted = await shiftRepo.insertShift(
      {
        branchId,
        staffUserId: input.staffUserId,
        openingCashIdr: input.openingCashIdr,
        plannedStartAt: input.plannedStartAt ?? null,
        plannedEndAt: input.plannedEndAt ?? null,
        notes: input.notes ?? null,
        openedBy: actorUserId,
      },
      tx,
    );
    if (!inserted) throw unprocessable('Shift baru gagal dibuka, coba lagi');

    const [previousRow, activeRow] = await Promise.all([
      shiftRepo.findShiftById(shiftId, tx),
      shiftRepo.findShiftById(str(inserted.id), tx),
    ]);
    if (!previousRow || !activeRow) {
      throw unprocessable('Shift gagal dimuat setelah pergantian');
    }

    return {
      previous: shapeShift(previousRow as Record<string, unknown>),
      active: shapeShift(activeRow as Record<string, unknown>),
    };
  });
}
