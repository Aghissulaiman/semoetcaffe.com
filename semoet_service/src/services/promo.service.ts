import { withTransaction } from '../config/database.js';
import { VOUCHER_STATUS, type DiscountType, type VoucherStatus } from '../config/constants.js';
import { conflict, notFound, unprocessable } from '../errors/AppError.js';
import * as adminRepo from '../repositories/admin.repository.js';
import * as promoRepo from '../repositories/promo.repository.js';
import { generateVoucherCode } from '../utils/codeGenerator.js';
import { calculateDiscountAmount } from '../utils/money.js';
import { buildPaginationMeta, parsePagination, type Pagination } from '../utils/pagination.js';
import { bool, iso, json, num, str, strOrNull } from '../utils/serialize.js';
import type {
  ClaimVoucherInput,
  CreateAdminPromoInput,
  ListAdminPromoQuery,
  ListPromoQuery,
  ListVoucherQuery,
  UpdateAdminPromoInput,
  ValidateVoucherInput,
} from '../validators/promo.validator.js';

export interface Paginated<T> {
  items: T[];
  meta: ReturnType<typeof buildPaginationMeta>;
}

// --------------------------------------------------------------------------
// Helper shaping
// --------------------------------------------------------------------------
function shapePromo(row: Record<string, unknown>) {
  const code = strOrNull(row.code);
  return {
    id: str(row.id),
    code,
    /** voucher = pakai kode; direct = diskon menu otomatis tanpa kode. */
    mode: code ? 'voucher' : 'direct',
    name: str(row.name),
    description: strOrNull(row.description),
    discountType: str(row.discountType),
    discountValue: num(row.discountValue),
    minimumOrderIdr: num(row.minimumOrderIdr),
    maximumDiscountIdr: row.maximumDiscountIdr === null || row.maximumDiscountIdr === undefined
      ? null
      : num(row.maximumDiscountIdr),
    startsAt: iso(row.startsAt),
    endsAt: iso(row.endsAt),
    globalQuota: row.globalQuota === null || row.globalQuota === undefined ? null : num(row.globalQuota),
    perUserQuota: row.perUserQuota === null || row.perUserQuota === undefined ? null : num(row.perUserQuota),
    rules: json<Record<string, unknown>>(row.rules, {}),
    isActive: bool(row.isActive),
    totalRedeemed: num(row.totalRedeemed),
  };
}

/** Sub-bagian promo yang ikut disertakan di dalam objek voucher. */
function shapePromoBrief(row: Record<string, unknown>) {
  return {
    id: str(row.promoId ?? row.id),
    name: str(row.promoName ?? row.name),
    description: strOrNull(row.promoDescription ?? row.description),
    discountType: str(row.discountType),
    discountValue: num(row.discountValue),
    minimumOrderIdr: num(row.minimumOrderIdr),
    maximumDiscountIdr:
      row.maximumDiscountIdr === null || row.maximumDiscountIdr === undefined
        ? null
        : num(row.maximumDiscountIdr),
    startsAt: iso(row.promoStartsAt ?? row.startsAt),
    endsAt: iso(row.promoEndsAt ?? row.endsAt),
  };
}

function shapeVoucher(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    promoId: str(row.promoId),
    code: strOrNull(row.code),
    status: str(row.status),
    issuedAt: iso(row.issuedAt),
    expiresAt: iso(row.expiresAt),
    usedAt: iso(row.usedAt),
    promo: shapePromoBrief(row),
  };
}

/** Sisa kuota global promo, atau null bila promo tidak dibatasi kuota. */
function remainingQuota(promo: Record<string, unknown>): number | null {
  if (promo.globalQuota === null || promo.globalQuota === undefined) return null;
  return Math.max(0, num(promo.globalQuota) - num(promo.totalRedeemed));
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Promo hanya bisa diklaim ketika aktif dan berada di dalam periodenya. */
function promoClaimable(promo: Record<string, unknown>, now: Date): string | null {
  if (!bool(promo.isActive)) return 'Promo ini sedang tidak aktif';

  const startsAt = parseDate(promo.startsAt);
  if (startsAt && startsAt.getTime() > now.getTime()) return 'Periode promo belum dimulai';

  const endsAt = parseDate(promo.endsAt);
  if (endsAt && endsAt.getTime() < now.getTime()) return 'Periode promo sudah berakhir';

  return null;
}

/**
 * Syarat promo yang bisa dipakai saat transaksi:
 * aktif, masih berjalan, kuota tidak habis.
 */
function promoUsable(promo: Record<string, unknown>, now: Date): string | null {
  const periodReason = promoClaimable(promo, now);
  if (periodReason) return periodReason;

  const remaining = remainingQuota(promo);
  if (remaining !== null && remaining <= 0) return 'Kuota promo sudah habis';

  return null;
}

/** Voucher expired ditolak walau status di database masih available. */
function voucherUsableReason(voucher: Record<string, unknown>, now: Date): string | null {
  const status = str(voucher.status) as VoucherStatus;
  if (!VOUCHER_STATUS.includes(status)) return 'Status voucher tidak dikenali';
  if (status === 'used') return 'Voucher sudah pernah dipakai';
  if (status === 'reserved') return 'Voucher sedang dipakai pada pesanan lain';
  if (status === 'revoked') return 'Voucher sudah dicabut';
  if (status === 'expired') return 'Voucher sudah kedaluwarsa';

  const expiresAt = parseDate(voucher.expiresAt);
  if (expiresAt && expiresAt.getTime() < now.getTime()) return 'Voucher sudah kedaluwarsa';

  return null;
}

/** Aturan cabang dari jsonb promo.rules (kosong berarti semua cabang boleh). */
function branchAllowed(rules: Record<string, unknown>, branchId: string | undefined): boolean {
  if (!branchId) return true;

  const raw = rules.branchIds ?? rules.allowedBranchIds ?? rules.branches;
  if (!Array.isArray(raw) || raw.length === 0) return true;

  return raw.some((item) => str(item) === branchId);
}

// --------------------------------------------------------------------------
// GET /promos
// --------------------------------------------------------------------------
export async function listPromos(query: ListPromoQuery): Promise<Paginated<unknown>> {
  const paging = parsePagination(query);
  const filters: promoRepo.ListPromoFilters = {
    // Endpoint publik hanya menampilkan promo aktif kecuali filter lain diminta.
    isActive: query.isActive ?? true,
    discountType: query.discountType,
    currentlyValid: query.currentlyValid,
    q: query.q,
  };

  const rows = await promoRepo.listPromos(filters, paging);
  const total = await promoRepo.countPromos(filters);

  const pagination: Pagination = {
    page: paging.page,
    limit: paging.limit,
    offset: paging.offset,
    total,
  };

  return {
    items: rows.map((row) => shapePromo(row as Record<string, unknown>)),
    meta: buildPaginationMeta(pagination),
  };
}

// --------------------------------------------------------------------------
// GET /promos/:code
// --------------------------------------------------------------------------
export async function getPromoByCode(code: string) {
  const row = await promoRepo.findPromoByCode(code);
  if (!row) throw notFound('Promo', code);

  const promo = row as Record<string, unknown>;
  const eligibility = await promoRepo.listEligibility(str(promo.id));

  return {
    promo: shapePromo(promo),
    eligibleProducts: eligibility
      .filter((item) => item.productId)
      .map((item) => ({
        id: str(item.productId),
        name: strOrNull(item.productName),
        slug: strOrNull(item.productSlug),
      })),
    eligibleCategories: eligibility
      .filter((item) => item.categoryId)
      .map((item) => ({
        id: str(item.categoryId),
        name: strOrNull(item.categoryName),
        slug: strOrNull(item.categorySlug),
      })),
    remainingQuota: remainingQuota(promo),
  };
}

// --------------------------------------------------------------------------
// GET /me/vouchers
// --------------------------------------------------------------------------
export async function listVouchers(
  userId: string,
  query: ListVoucherQuery,
): Promise<Paginated<unknown>> {
  const paging = parsePagination(query);
  const status = query.status;

  // Filter userId di dalam repository supaya user tidak bisa melihat voucher orang lain.
  const rows = await promoRepo.listUserVouchers(userId, paging, status);
  const total = await promoRepo.countUserVouchers(userId, status);

  const pagination: Pagination = {
    page: paging.page,
    limit: paging.limit,
    offset: paging.offset,
    total,
  };

  return {
    items: rows.map((row) => shapeVoucher(row as Record<string, unknown>)),
    meta: buildPaginationMeta(pagination),
  };
}

// --------------------------------------------------------------------------
// GET /me/vouchers/:id
// --------------------------------------------------------------------------
export async function getVoucher(userId: string, voucherId: string) {
  const row = await promoRepo.findUserVoucher(voucherId, userId);
  if (!row) throw notFound('Voucher', voucherId);

  const voucher = row as Record<string, unknown>;
  const unusableReason = voucherUsableReason(voucher, new Date());

  return {
    voucher: shapeVoucher(voucher),
    isUsable: unusableReason === null,
    unusableReason,
  };
}

// --------------------------------------------------------------------------
// POST /me/vouchers/claim
// --------------------------------------------------------------------------
export async function claimVoucher(userId: string, input: ClaimVoucherInput) {
  return withTransaction(async (tx) => {
    // Baris promo dikunci supaya dua klaim bersamaan tidak melewati kuota.
    const locked = await promoRepo.lockPromoByCode(input.code, tx);
    if (!locked) throw notFound('Promo', input.code);

    const promo = locked as Record<string, unknown>;
    await tx.advisoryLock(`promo-claim:${str(promo.id)}`);

    const now = new Date();
    const notClaimable = promoClaimable(promo, now);
    if (notClaimable) throw unprocessable(`Voucher tidak bisa diklaim: ${notClaimable.toLowerCase()}`);

    const promoId = str(promo.id);

    const perUserQuota = promo.perUserQuota === null || promo.perUserQuota === undefined
      ? null
      : num(promo.perUserQuota);
    if (perUserQuota !== null) {
      const claimed = await promoRepo.countUserVoucherRedemptions(promoId, userId, tx);
      if (claimed >= perUserQuota) {
        throw conflict('Voucher untuk promo ini sudah pernah diklaim oleh akun ini');
      }
    }

    const globalQuota = promo.globalQuota === null || promo.globalQuota === undefined
      ? null
      : num(promo.globalQuota);
    if (globalQuota !== null) {
      const redeemed = await promoRepo.countPromoRedemptions(promoId, tx);
      if (redeemed >= globalQuota) throw unprocessable('Voucher tidak bisa diklaim: kuota promo sudah habis');
    }

    // Masa berlaku voucher mengikuti akhir periode promo bila masih relevan.
    const endsAt = parseDate(promo.endsAt);
    const expiresAt = endsAt && endsAt.getTime() > now.getTime() ? endsAt : null;

    const created = (await promoRepo.insertUserVoucher(
      {
        userId,
        promoId,
        code: generateVoucherCode(),
        expiresAt,
        status: 'available',
      },
      tx,
    )) as unknown as Record<string, unknown> | null;

    if (!created) throw unprocessable('Voucher gagal diterbitkan, coba lagi nanti');

    return shapeVoucher({ ...promo, ...created });
  });
}

// --------------------------------------------------------------------------
// POST /me/vouchers/validate
// --------------------------------------------------------------------------
/**
 * Pratinjau penggunaan voucher saat checkout. Tidak mengubah data apa pun:
 * voucher tidak dibakar, kuota tidak berkurang.
 */
export async function validateVoucher(userId: string, input: ValidateVoucherInput) {
  const now = new Date();

  const voucherRow = input.voucherId
    ? await promoRepo.findUserVoucher(input.voucherId, userId)
    : await promoRepo.findUserVoucherByCode(String(input.code).toUpperCase(), userId);

  // Kepemilikan dicek lewat filter userId pada repository: voucher milik user
  // lain dianggap tidak ada supaya tidak bocor.
  if (!voucherRow) throw notFound('Voucher', input.voucherId ?? input.code);

  const voucher = voucherRow as Record<string, unknown>;
  const promoRow = await promoRepo.findPromoById(str(voucher.promoId));
  const promo = (promoRow ?? {}) as Record<string, unknown>;
  const rules = json<Record<string, unknown>>(promo.rules, {});

  const discountIdr = calculateDiscountAmount({
    discountType: str(promo.discountType) as DiscountType,
    discountValue: num(promo.discountValue),
    subtotalIdr: input.subtotalIdr,
    maximumDiscountIdr:
      promo.maximumDiscountIdr === null || promo.maximumDiscountIdr === undefined
        ? null
        : num(promo.maximumDiscountIdr),
  });

  const build = (reason: string | null) => ({
    isValid: reason === null,
    isUsable: reason === null,
    message: reason,
    reason,
    subtotalIdr: Math.max(0, num(input.subtotalIdr)),
    discountIdr: reason === null ? discountIdr : 0,
    freeProductId: strOrNull(rules.freeProductId ?? rules.productId),
    promoId: strOrNull(promo.id ?? voucher.promoId),
    promoName: strOrNull(promo.name),
    voucherId: strOrNull(voucher.id),
    voucherCode: strOrNull(voucher.code),
    voucherStatus: strOrNull(voucher.status),
    remainingQuota: remainingQuota(promo),
  });

  const voucherReason = voucherUsableReason(voucher, now);
  if (voucherReason) return build(voucherReason);

  const promoReason = promoUsable(promo, now);
  if (promoReason) return build(promoReason);

  const minimumOrderIdr = num(promo.minimumOrderIdr);
  if (minimumOrderIdr > 0 && input.subtotalIdr < minimumOrderIdr) {
    return build(`Minimum belanja untuk promo ini adalah Rp${minimumOrderIdr.toLocaleString('id-ID')}`);
  }

  if (!branchAllowed(rules, input.branchId)) {
    return build('Promo ini tidak berlaku untuk cabang yang dipilih');
  }

  const productIds = input.productIds ?? [];
  if (productIds.length > 0) {
    const eligible = await promoRepo.isProductEligible(str(voucher.promoId), productIds);
    if (!eligible) return build('Ada produk di keranjang yang tidak termasuk promo ini');
  }

  return build(null);
}
// --------------------------------------------------------------------------
// Admin: CRUD promo (voucher code & diskon langsung menu)
// --------------------------------------------------------------------------
export interface PromoAuditContext {
  requestId?: string | null;
  ipAddress?: string | null;
}

function writeAudit(
  entry: {
    actorUserId: string;
    action: string;
    promoId: string;
    oldData?: unknown;
    newData?: unknown;
  },
  audit: PromoAuditContext,
  executor: Parameters<typeof adminRepo.insertAuditLog>[1],
) {
  return adminRepo.insertAuditLog(
    {
      actorUserId: entry.actorUserId,
      action: entry.action,
      entityType: 'promo',
      entityId: entry.promoId,
      oldData: entry.oldData ?? null,
      newData: entry.newData ?? null,
      requestId: audit.requestId ?? null,
      ipAddress: audit.ipAddress ?? null,
    },
    executor,
  );
}

function parseRequiredDate(value: string, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw unprocessable(`Format ${field} tidak valid`);
  }
  return date;
}

function uniqueIds(ids: string[] | undefined): string[] {
  return [...new Set(ids ?? [])];
}

function assertPromoWrite(
  input: {
    code: string | null;
    discountType: string;
    discountValue: number;
    startsAt: Date;
    endsAt: Date;
    minimumOrderIdr: number;
    productIds: string[];
    categoryIds: string[];
  },
): void {
  if (input.endsAt.getTime() <= input.startsAt.getTime()) {
    throw unprocessable('Waktu selesai harus setelah waktu mulai', [
      { field: 'endsAt', message: 'Periode promo tidak valid' },
    ]);
  }
  if (input.discountType === 'percentage' && input.discountValue > 100) {
    throw unprocessable('Diskon persentase maksimal 100%', [
      { field: 'discountValue', message: 'Nilai persentase terlalu besar' },
    ]);
  }
  if (input.code === null) {
    if (input.productIds.length + input.categoryIds.length === 0) {
      throw unprocessable('Pilih minimal satu menu atau kategori untuk diskon langsung', [
        { field: 'productIds', message: 'Sasaran diskon menu wajib dipilih' },
      ]);
    }
    if (input.discountType === 'free_item') {
      throw unprocessable('Diskon menu langsung hanya mendukung persentase atau nominal', [
        { field: 'discountType', message: 'Jenis diskon tidak didukung' },
      ]);
    }
    if (input.minimumOrderIdr > 0) {
      throw unprocessable('Diskon menu langsung tidak memakai minimum belanja', [
        { field: 'minimumOrderIdr', message: 'Minimum belanja harus 0' },
      ]);
    }
  }
}

async function assertNoOverlappingAutoPromo(
  promoId: string | null,
  input: { code: string | null; isActive: boolean; startsAt: Date; endsAt: Date },
  executor: Parameters<typeof promoRepo.findOverlappingAutoPromo>[3],
): Promise<void> {
  if (input.code !== null || !input.isActive) return;

  const overlapping = await promoRepo.findOverlappingAutoPromo(
    promoId,
    input.startsAt,
    input.endsAt,
    executor,
  );
  if (overlapping) {
    throw conflict(
      `Masih ada diskon menu aktif pada periode tersebut (${str(overlapping.name)}). Nonaktifkan atau ubah periodenya terlebih dahulu.`,
    );
  }
}

async function assertPromoCodeAvailable(code: string | null, excludeId: string | null): Promise<void> {
  if (!code) return;

  const existing = await promoRepo.findPromoByCode(code);
  if (existing && str(existing.id) !== excludeId) {
    throw conflict(`Kode promo '${code}' sudah dipakai promo lain`);
  }
}

function shapeAdminPromo(
  row: Record<string, unknown>,
  eligibility: Record<string, unknown>[],
) {
  const promo = shapePromo(row);

  return {
    ...promo,
    eligibleProducts: eligibility
      .filter((item) => item.productId)
      .map((item) => ({
        id: str(item.productId),
        name: strOrNull(item.productName),
        slug: strOrNull(item.productSlug),
      })),
    eligibleCategories: eligibility
      .filter((item) => item.categoryId)
      .map((item) => ({
        id: str(item.categoryId),
        name: strOrNull(item.categoryName),
        slug: strOrNull(item.categorySlug),
      })),
    remainingQuota: remainingQuota(row),
  };
}

export async function listAdminPromos(query: ListAdminPromoQuery): Promise<Paginated<unknown>> {
  const paging = parsePagination(query);
  const filters: promoRepo.ListPromoFilters = {
    isActive: query.isActive,
    discountType: query.discountType,
    currentlyValid: false,
    q: query.q,
    hasCode: query.mode === 'voucher' ? true : query.mode === 'direct' ? false : undefined,
  };

  const rows = await promoRepo.listPromos(filters, paging);
  const total = await promoRepo.countPromos(filters);

  const pagination: Pagination = {
    page: paging.page,
    limit: paging.limit,
    offset: paging.offset,
    total,
  };

  return {
    items: rows.map((row) => shapePromo(row as Record<string, unknown>)),
    meta: buildPaginationMeta(pagination),
  };
}

export async function getAdminPromo(promoId: string) {
  const row = await promoRepo.findPromoById(promoId);
  if (!row) throw notFound('Promo', promoId);

  const eligibility = await promoRepo.listEligibility(promoId);
  return shapeAdminPromo(row as Record<string, unknown>, eligibility);
}

export async function createAdminPromo(
  input: CreateAdminPromoInput,
  actorUserId: string,
  audit: PromoAuditContext = {},
) {
  const code = input.code ?? null;
  const productIds = uniqueIds(input.productIds);
  const categoryIds = uniqueIds(input.categoryIds);
  const startsAt = parseRequiredDate(input.startsAt, 'waktu mulai');
  const endsAt = parseRequiredDate(input.endsAt, 'waktu selesai');

  const writeInput: promoRepo.PromoWriteInput = {
    code,
    name: input.name,
    description: input.description ?? null,
    discountType: input.discountType,
    discountValue: input.discountValue,
    minimumOrderIdr: input.minimumOrderIdr,
    maximumDiscountIdr: input.maximumDiscountIdr ?? null,
    startsAt,
    endsAt,
    globalQuota: input.globalQuota ?? null,
    perUserQuota: input.perUserQuota ?? null,
    rules: {},
    isActive: input.isActive,
  };

  assertPromoWrite({ ...writeInput, productIds, categoryIds });

  return withTransaction(async (tx) => {
    await assertPromoCodeAvailable(code, null);
    await assertNoOverlappingAutoPromo(null, writeInput, tx);

    const created = await promoRepo.insertPromo(writeInput, tx);
    if (!created) throw unprocessable('Promo gagal disimpan, coba lagi');

    const promoId = str(created.id);
    await promoRepo.replaceEligibility(promoId, { productIds, categoryIds }, tx);

    await writeAudit(
      {
        actorUserId,
        action: 'admin.promo.create',
        promoId,
        newData: {
          name: writeInput.name,
          code,
          mode: code ? 'voucher' : 'direct',
          isActive: writeInput.isActive,
          productIds,
          categoryIds,
        },
      },
      audit,
      tx,
    );

    const eligibility = await promoRepo.listEligibility(promoId, tx);
    return shapeAdminPromo(created as Record<string, unknown>, eligibility);
  });
}

export async function updateAdminPromo(
  promoId: string,
  input: UpdateAdminPromoInput,
  actorUserId: string,
  audit: PromoAuditContext = {},
) {
  return withTransaction(async (tx) => {
    const existing = await promoRepo.findPromoById(promoId, tx);
    if (!existing) throw notFound('Promo', promoId);

    const current = existing as Record<string, unknown>;
    const existingEligibility = await promoRepo.listEligibility(promoId, tx);
    const existingProductIds = existingEligibility
      .filter((item) => item.productId)
      .map((item) => str(item.productId));
    const existingCategoryIds = existingEligibility
      .filter((item) => item.categoryId)
      .map((item) => str(item.categoryId));

    const code = input.code === undefined ? strOrNull(current.code) : input.code;
    const productIds = input.productIds === undefined
      ? existingProductIds
      : uniqueIds(input.productIds);
    const categoryIds = input.categoryIds === undefined
      ? existingCategoryIds
      : uniqueIds(input.categoryIds);

    const startsAt = input.startsAt
      ? parseRequiredDate(input.startsAt, 'waktu mulai')
      : parseDate(current.startsAt) ?? new Date();
    const endsAt = input.endsAt
      ? parseRequiredDate(input.endsAt, 'waktu selesai')
      : parseDate(current.endsAt) ?? new Date();

    const writeInput: promoRepo.PromoWriteInput = {
      code,
      name: input.name ?? str(current.name),
      description: input.description === undefined ? strOrNull(current.description) : input.description,
      discountType: input.discountType ?? str(current.discountType),
      discountValue: input.discountValue ?? num(current.discountValue),
      minimumOrderIdr: input.minimumOrderIdr ?? num(current.minimumOrderIdr),
      maximumDiscountIdr: input.maximumDiscountIdr === undefined
        ? (current.maximumDiscountIdr === null || current.maximumDiscountIdr === undefined
            ? null
            : num(current.maximumDiscountIdr))
        : input.maximumDiscountIdr,
      startsAt,
      endsAt,
      globalQuota: input.globalQuota === undefined
        ? (current.globalQuota === null || current.globalQuota === undefined
            ? null
            : num(current.globalQuota))
        : input.globalQuota,
      perUserQuota: input.perUserQuota === undefined
        ? (current.perUserQuota === null || current.perUserQuota === undefined
            ? null
            : num(current.perUserQuota))
        : input.perUserQuota,
      rules: json<Record<string, unknown>>(current.rules, {}),
      isActive: input.isActive ?? bool(current.isActive),
    };

    assertPromoWrite({ ...writeInput, productIds, categoryIds });
    await assertPromoCodeAvailable(code, promoId);
    await assertNoOverlappingAutoPromo(promoId, writeInput, tx);

    const updated = await promoRepo.updatePromo(promoId, writeInput, tx);
    if (!updated) throw notFound('Promo', promoId);

    if (input.productIds !== undefined || input.categoryIds !== undefined) {
      await promoRepo.replaceEligibility(promoId, { productIds, categoryIds }, tx);
    }

    await writeAudit(
      {
        actorUserId,
        action: 'admin.promo.update',
        promoId,
        oldData: {
          name: str(current.name),
          code: strOrNull(current.code),
          isActive: bool(current.isActive),
          startsAt: iso(current.startsAt),
          endsAt: iso(current.endsAt),
        },
        newData: {
          name: writeInput.name,
          code,
          mode: code ? 'voucher' : 'direct',
          isActive: writeInput.isActive,
          startsAt: iso(writeInput.startsAt),
          endsAt: iso(writeInput.endsAt),
          productIds,
          categoryIds,
        },
      },
      audit,
      tx,
    );

    const eligibility = await promoRepo.listEligibility(promoId, tx);
    return shapeAdminPromo(updated as Record<string, unknown>, eligibility);
  });
}

export async function deleteAdminPromo(
  promoId: string,
  actorUserId: string,
  audit: PromoAuditContext = {},
) {
  return withTransaction(async (tx) => {
    const existing = await promoRepo.findPromoById(promoId, tx);
    if (!existing) throw notFound('Promo', promoId);

    const redemptions = await promoRepo.countPromoRedemptions(promoId, tx);
    const vouchers = await promoRepo.countPromoVouchers(promoId, tx);
    if (redemptions > 0 || vouchers > 0) {
      throw conflict(
        'Promo sudah pernah dipakai atau memiliki voucher. Nonaktifkan promo ini alih-alih menghapusnya.',
      );
    }

    await promoRepo.deletePromo(promoId, tx);

    await writeAudit(
      {
        actorUserId,
        action: 'admin.promo.delete',
        promoId,
        oldData: {
          name: str(existing.name),
          code: strOrNull(existing.code),
        },
      },
      audit,
      tx,
    );

    return { id: promoId, deleted: true };
  });
}
