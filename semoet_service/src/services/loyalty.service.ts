import { withTransaction } from '../config/database.js';
import type { LoyaltyRewardType } from '../config/constants.js';
import { notFound, unprocessable } from '../errors/AppError.js';
import * as loyaltyRepo from '../repositories/loyalty.repository.js';
import * as promoRepo from '../repositories/promo.repository.js';
import * as userRepo from '../repositories/user.repository.js';
import { generateVoucherCode } from '../utils/codeGenerator.js';
import { idrValueOfPoint } from '../utils/money.js';
import { buildPaginationMeta, parsePagination, type Pagination } from '../utils/pagination.js';
import { bool, iso, json, num, str, strOrNull } from '../utils/serialize.js';
import type {
  ListRedemptionQuery,
  ListRewardQuery,
  PointsHistoryQuery,
  RedeemRewardInput,
} from '../validators/loyalty.validator.js';

export interface Paginated<T> {
  items: T[];
  meta: ReturnType<typeof buildPaginationMeta>;
}

// --------------------------------------------------------------------------
// Helper shaping
// --------------------------------------------------------------------------
function shapePointsSummary(row: Record<string, unknown> | null) {
  return {
    balance: num(row?.balance),
    lifetimeEarned: num(row?.lifetimeEarned ?? row?.lifetime_earned),
    lifetimeRedeemed: num(row?.lifetimeRedeemed ?? row?.lifetime_redeemed),
    lifetimeExpired: num(row?.lifetimeExpired ?? row?.lifetime_expired),
    expiringSoon: num(row?.expiringSoon ?? row?.expiring_soon),
    nextExpiryAt: iso(row?.nextExpiryAt ?? row?.next_expiry_at),
    pointsValueIdr: idrValueOfPoint(num(row?.balance)),
  };
}

function shapePointEntry(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    pointsDelta: num(row.pointsDelta),
    mutationType: str(row.mutationType),
    description: strOrNull(row.description),
    referenceType: strOrNull(row.referenceType),
    referenceId: strOrNull(row.referenceId),
    referenceLabel: strOrNull(row.referenceLabel),
    expiresAt: iso(row.expiresAt),
    createdAt: iso(row.createdAt),
  };
}

function shapeReward(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    code: strOrNull(row.code),
    name: str(row.name),
    description: strOrNull(row.description),
    pointsCost: num(row.pointsCost),
    rewardType: str(row.rewardType),
    rewardConfig: json<Record<string, unknown>>(row.rewardConfig, {}),
    isActive: bool(row.isActive),
  };
}

function shapeRedemption(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    rewardId: str(row.rewardId),
    pointsSpent: num(row.pointsSpent),
    voucherId: strOrNull(row.voucherId),
    status: str(row.status),
    createdAt: iso(row.createdAt),
    reward: {
      code: strOrNull(row.rewardCode),
      name: strOrNull(row.rewardName),
      rewardType: strOrNull(row.rewardType),
    },
    voucherCode: strOrNull(row.voucherCode),
    voucherStatus: strOrNull(row.voucherStatus),
    voucherExpiresAt: iso(row.voucherExpiresAt),
  };
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Konfigurasi hadiahloyalty (bisa memuat promoId / masa berlaku voucher). */
function rewardConfig(row: Record<string, unknown>): Record<string, unknown> {
  return json<Record<string, unknown>>(row.rewardConfig, {});
}

// --------------------------------------------------------------------------
// GET /me/points
// --------------------------------------------------------------------------
export async function getPoints(userId: string) {
  const [summaryRow, profile] = await Promise.all([
    loyaltyRepo.getPointsSummary(userId),
    userRepo.findProfile(userId),
  ]);

  const summary = shapePointsSummary(summaryRow as unknown as Record<string, unknown> | null);

  return {
    ...summary,
    tier: profile?.tierCode
      ? {
          code: str(profile.tierCode),
          name: str(profile.tierName),
          minimumLifetimePoints: num(profile.tierMinimumLifetimePoints),
        }
      : null,
  };
}

// --------------------------------------------------------------------------
// GET /me/points/history
// --------------------------------------------------------------------------
export async function listPointsHistory(
  userId: string,
  query: PointsHistoryQuery,
): Promise<Paginated<unknown>> {
  const paging = parsePagination(query);
  const filters = {
    mutationType: query.mutationType,
    referenceType: query.referenceType,
    from: query.from,
    to: query.to,
  };

  const rows = await loyaltyRepo.listPointHistory(userId, filters, paging);
  const total = await loyaltyRepo.countPointHistory(userId, filters);

  const pagination: Pagination = {
    page: paging.page,
    limit: paging.limit,
    offset: paging.offset,
    total,
  };

  return {
    items: rows.map((row) => shapePointEntry(row as Record<string, unknown>)),
    meta: buildPaginationMeta(pagination),
  };
}

// --------------------------------------------------------------------------
// GET /loyalty/rewards
// --------------------------------------------------------------------------
export async function listRewards(query: ListRewardQuery): Promise<Paginated<unknown>> {
  const filters = {
    rewardType: query.rewardType,
    // isActive datang dari query string sebagai 'true'/'false'.
    isActive: query.isActive === undefined ? undefined : query.isActive === 'true',
    maxPoints: query.maxPoints,
  };

  const rows = await loyaltyRepo.listRewards(filters);
  const items = rows.map((row) => shapeReward(row as Record<string, unknown>));

  // Katalog hadiah tidak dipaginasi di repository, jadi seluruh isi dikirim
  // sekali dan meta paging dihitung dari jumlah data yang dikembalikan.
  const total = items.length;
  const pagination: Pagination = { page: 1, limit: Math.max(total, 1), offset: 0, total };

  return { items, meta: buildPaginationMeta(pagination) };
}

// --------------------------------------------------------------------------
// POST /loyalty/redeem
// --------------------------------------------------------------------------
export async function redeemReward(
  userId: string,
  input: RedeemRewardInput,
  options: { idempotencyKey?: string | null } = {},
) {
  const idempotencyKey = input.idempotencyKey ?? options.idempotencyKey ?? null;

  return withTransaction(async (tx) => {
    // Idempotensi dicek lebih dulu: penukaran yang sama tidak boleh terpotong dua kali.
    if (idempotencyKey) {
      const existing = await loyaltyRepo.findPointEntryByIdempotencyKey(idempotencyKey, tx);
      if (existing) {
        const entry = existing as Record<string, unknown>;
        const summaryRow = await loyaltyRepo.getPointsSummary(userId, tx);
        const summary = shapePointsSummary(summaryRow as unknown as Record<string, unknown> | null);

        return {
          idempotent: true,
          redemption: null,
          voucher: null,
          pointsSpent: Math.abs(num(entry.pointsDelta)),
          remainingPoints: summary.balance,
        };
      }
    }

    // Advisory lock per user mencegah dua permintaan tukar bersamaan memakai saldo yang sama.
    await tx.advisoryLock(`loyalty-redeem:${userId}`);

    // Kunci baris user supaya semua mutasi poin user ini ter-serialisasi.
    const balanceRow = await loyaltyRepo.lockUserForPoints(userId, tx);
    const balance = num((balanceRow as unknown as Record<string, unknown> | null)?.balance);

    const rewardRow = await loyaltyRepo.lockRewardById(input.rewardId, tx);
    if (!rewardRow) throw notFound('Hadiah loyalty', input.rewardId);

    const reward = rewardRow as Record<string, unknown>;
    if (!bool(reward.isActive)) throw unprocessable('Hadiah ini sedang tidak tersedia');

    const pointsCost = num(reward.pointsCost);
    if (pointsCost <= 0) throw unprocessable('Hadiah ini tidak memiliki biaya poin yang valid');
    if (balance < pointsCost) {
      throw unprocessable(
        `Saldo poin tidak cukup: butuh ${pointsCost} poin, saldo saat ini ${balance} poin`,
      );
    }

    // Hadiah bertipe voucher perlu promo sebagai sumber penerbitan voucher.
    const config = rewardConfig(reward);
    const isVoucherReward = str(reward.rewardType) === ('voucher' as LoyaltyRewardType);
    let voucherRow: Record<string, unknown> | null = null;
    let grantedPromoId: string | null = null;

    if (isVoucherReward) {
      const promoId = strOrNull(config.promoId);
      const promoCode = strOrNull(config.promoCode ?? config.code);

      let promo: Record<string, unknown> | null = null;
      if (promoId) {
        promo = (await promoRepo.findPromoById(promoId, tx)) as Record<string, unknown> | null;
      } else if (promoCode) {
        promo = (await promoRepo.findPromoByCode(promoCode.toUpperCase(), tx)) as Record<
          string,
          unknown
        > | null;
      }

      if (!promo) {
        throw unprocessable('Promo untuk hadiah ini belum disiapkan, hubungi admin');
      }

      if (!bool(promo.isActive)) {
        throw unprocessable('Promo untuk hadiah ini sedang tidak aktif');
      }

      const endsAt = parseDate(promo.endsAt);
      const now = new Date();
      const expiresAt = config.expiresInDays
        ? new Date(now.getTime() + num(config.expiresInDays) * 24 * 60 * 60 * 1000)
        : endsAt && endsAt.getTime() > now.getTime()
          ? endsAt
          : null;

      grantedPromoId = str(promo.id);
      voucherRow = (await promoRepo.insertUserVoucher(
        {
          userId,
          promoId: grantedPromoId,
          code: generateVoucherCode(),
          expiresAt,
          status: 'available',
        },
        tx,
      )) as unknown as Record<string, unknown> | null;
    }

    // Penukaran berstatus pending bila hadiahnya perlu penyelesaian manual,
    // dan completed bila hadiah sudah langsung terbit (misalnya voucher).
    const isCompleted = isVoucherReward ? Boolean(voucherRow) : true;
    const redemptionRow = await loyaltyRepo.insertRedemption(
      {
        userId,
        rewardId: str(reward.id),
        pointsSpent: pointsCost,
        voucherId: voucherRow ? str(voucherRow.id) : null,
        status: isCompleted ? 'completed' : 'pending',
      },
      tx,
    );

    const redemption = redemptionRow as unknown as Record<string, unknown> | null;

    await loyaltyRepo.insertPointEntry(
      {
        userId,
        pointsDelta: -pointsCost,
        mutationType: 'redeem',
        description: `Penukaran hadiah: ${str(reward.name)}`,
        referenceType: 'loyalty_redemption',
        referenceId: redemption ? str(redemption.id) : null,
        idempotencyKey,
      },
      tx,
    );

    const summaryRow = await loyaltyRepo.getPointsSummary(userId, tx);
    const summary = shapePointsSummary(summaryRow as unknown as Record<string, unknown> | null);

    return {
      idempotent: false,
      redemption: redemption
        ? shapeRedemption({
            ...redemption,
            rewardId: str(reward.id),
            rewardCode: reward.code,
            rewardName: reward.name,
            rewardType: reward.rewardType,
            voucherCode: voucherRow?.code ?? null,
            voucherStatus: voucherRow?.status ?? null,
            voucherExpiresAt: voucherRow?.expiresAt ?? null,
          })
        : null,
      voucher: voucherRow
        ? {
            id: str(voucherRow.id),
            promoId: strOrNull(grantedPromoId ?? voucherRow.promoId),
            code: strOrNull(voucherRow.code),
            status: strOrNull(voucherRow.status),
            expiresAt: iso(voucherRow.expiresAt),
          }
        : null,
      pointsSpent: pointsCost,
      remainingPoints: summary.balance,
    };
  });
}



// --------------------------------------------------------------------------
// GET /me/redemptions
// --------------------------------------------------------------------------
export async function listRedemptions(
  userId: string,
  query: ListRedemptionQuery,
): Promise<Paginated<unknown>> {
  const paging = parsePagination(query);
  const status = query.status;

  const rows = await loyaltyRepo.listRedemptions(userId, paging, status);
  const total = await loyaltyRepo.countRedemptions(userId, status);

  const pagination: Pagination = {
    page: paging.page,
    limit: paging.limit,
    offset: paging.offset,
    total,
  };

  return {
    items: rows.map((row) => shapeRedemption(row as Record<string, unknown>)),
    meta: buildPaginationMeta(pagination),
  };
}

