import { withTransaction, type TransactionClient } from '../config/database.js';
import { type ActivityType, type GamificationRewardType } from '../config/constants.js';
import { notFound, unprocessable } from '../errors/AppError.js';
import * as gamificationRepo from '../repositories/gamification.repository.js';
import * as loyaltyRepo from '../repositories/loyalty.repository.js';
import * as promoRepo from '../repositories/promo.repository.js';
import { generateVoucherCode } from '../utils/codeGenerator.js';
import { buildPaginationMeta, parsePagination, type Pagination } from '../utils/pagination.js';
import { bool, iso, json, num, str, strOrNull } from '../utils/serialize.js';
import type {
  ListActivityQuery,
  ListPlayHistoryQuery,
  PlayActivityInput,
} from '../validators/gamification.validator.js';

export interface Paginated<T> {
  items: T[];
  meta: ReturnType<typeof buildPaginationMeta>;
}

/** reference_type untuk mutasi poin hasil permainan. */
const PLAY_REFERENCE_TYPE = 'gamification_play';

/** Prefix idempotensi poin, diturunkan dari id play agar unik dan bisa diulang. */
const POINTS_IDEMPOTENCY_PREFIX = 'gamification-play:';

/** Reward type yang berarti user benar-benar mendapat hadiah. */
const WINNING_REWARD: GamificationRewardType[] = ['points', 'voucher', 'free_product'];

/** Umur default voucher hadiah (hari) bila config reward tidak menyebutkannya. */
const DEFAULT_VOUCHER_DAYS = 30;

/** Voucher baru diterbitkan dalam status available supaya bisa langsung dipakai. */
const NEW_VOUCHER_STATUS = 'available';

// --------------------------------------------------------------------------
// Helper shaping
// --------------------------------------------------------------------------
function shapeActivity(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    code: str(row.code),
    name: str(row.name),
    activityType: str(row.activityType) as ActivityType,
    rules: json<Record<string, unknown>>(row.rules, {}),
    startsAt: iso(row.startsAt),
    endsAt: iso(row.endsAt),
    isActive: bool(row.isActive),
    rewardCount: num(row.rewardCount),
  };
}

function shapeReward(row: Record<string, unknown>) {
  const rewardType = str(row.rewardType) as GamificationRewardType;
  return {
    id: strOrNull(row.id),
    rewardType,
    rewardValue: num(row.rewardValue),
    weight: num(row.weight),
    isWin: WINNING_REWARD.includes(rewardType),
  };
}

function shapePlay(row: Record<string, unknown>) {
  const result = json<Record<string, unknown>>(row.result, {});
  const rewardType = strOrNull(row.rewardType) as GamificationRewardType | null;
  return {
    id: str(row.id),
    activityId: str(row.activityId),
    activityCode: str(row.activityCode),
    activityName: str(row.activityName),
    activityType: str(row.activityType) as ActivityType,
    reward: rewardType
      ? {
          id: strOrNull(row.rewardId),
          rewardType,
          rewardValue: num(row.rewardValue),
          isWin: WINNING_REWARD.includes(rewardType),
        }
      : null,
    playedAt: iso(row.playedAt),
    result,
  };
}

/**
 * Batas main harian dibaca dari kolom rules (jsonb) aktivitas. Null berarti
 * tidak dibatasi. Beberapa nama key diterima supaya data seed lama tetap jalan.
 */
function dailyLimitOf(activity: Record<string, unknown>): number | null {
  const rules = json<Record<string, unknown>>(activity.rules, {});
  const raw = rules.maxPlaysPerDay ?? rules.dailyLimit ?? rules.maxPlays;
  if (raw === null || raw === undefined) return null;
  const limit = Math.trunc(num(raw, 0));
  return limit > 0 ? limit : null;
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Aktivitas bisa dimainkan saat aktif dan berada di dalam periodenya. */
function withinPeriod(activity: Record<string, unknown>, now: Date): boolean {
  const startsAt = parseDate(activity.startsAt);
  if (startsAt && startsAt.getTime() > now.getTime()) return false;

  const endsAt = parseDate(activity.endsAt);
  if (endsAt && endsAt.getTime() < now.getTime()) return false;

  return true;
}

/** Pesan yang ditampilkan ke user, menyesuaikan jenis hadiahnya. */
function rewardMessage(
  rewardType: GamificationRewardType,
  rewardValue: number,
  activityName: string,
): string {
  if (rewardType === 'points') {
    return rewardValue > 0
      ? `Selamat, Anda mendapat ${rewardValue} poin dari ${activityName}.`
      : `Anda sudah ikut bermain ${activityName}. Mari kembali lagi besok.`;
  }
  if (rewardType === 'voucher') return `Selamat, Anda mendapat voucher dari ${activityName}.`;
  if (rewardType === 'free_product') {
    return `Selamat, Anda mendapat produk gratis dari ${activityName}.`;
  }
  return 'Belum beruntung kali ini, coba lagi lain waktu.';
}

// --------------------------------------------------------------------------
// GET /gamification/activities
// --------------------------------------------------------------------------
export async function listActivities(query: ListActivityQuery): Promise<Paginated<ReturnType<typeof shapeActivity>>> {
  const paging = parsePagination(query);

  // Endpoint publik selalu menampilkan aktivitas yang sedang aktif saja.
  const rows = await gamificationRepo.listActivities(
    {
      isActive: true,
      activityType: query.activityType,
      at: parseDate(query.at) ?? new Date(),
    },
  );

  const total = rows.length;
  const pageRows = rows.slice(paging.offset, paging.offset + paging.limit);

  const pagination: Pagination = { page: paging.page, limit: paging.limit, offset: paging.offset, total };
  return { items: pageRows.map(shapeActivity), meta: buildPaginationMeta(pagination) };
}

// --------------------------------------------------------------------------
// GET /gamification/activities/:code
// --------------------------------------------------------------------------
export async function getActivityDetail(code: string, userId: string | null) {
  const activity = await gamificationRepo.findActivityByCode(code);
  if (!activity || !bool(activity.isActive)) {
    throw notFound('Aktivitas gamifikasi', code);
  }

  const activityId = str(activity.id);
  const rewards = await gamificationRepo.listRewards(activityId);

  const maxPlaysPerDay = dailyLimitOf(activity);
  const within = withinPeriod(activity, new Date());

  let playsToday = 0;
  if (userId) {
    playsToday = await gamificationRepo.countPlaysToday(activityId, userId);
  }

  return {
    activity: shapeActivity(activity),
    rewards: rewards.map(shapeReward),
    canPlay: within && (maxPlaysPerDay === null || playsToday < maxPlaysPerDay),
    playsToday,
    maxPlaysPerDay,
  };
}

// --------------------------------------------------------------------------
// POST /gamification/play
// --------------------------------------------------------------------------
export interface PlayOptions {
  idempotencyKey?: string | null;
}

export async function playActivity(
  userId: string,
  input: PlayActivityInput,
  opts: PlayOptions = {},
) {
  const idempotencyKey = opts.idempotencyKey ?? input.idempotencyKey ?? null;

  const outcome = await withTransaction(async (tx) => {
    // Advisory lock per user: tap ganda dari aplikasi tidak bisa masuk dua kali
    // sehingga batas harian tidak bisa dilewati.
    await tx.advisoryLock(`gamification:${userId}`);

    const activity = await gamificationRepo.lockActivityByCode(input.activityCode, tx);
    if (!activity || !bool(activity.isActive)) {
      throw notFound('Aktivitas gamifikasi', input.activityCode);
    }

    const activityId = str(activity.id);
    const activityName = str(activity.name, input.activityCode);

    if (!withinPeriod(activity, new Date())) {
      throw unprocessable('Aktivitas ini sedang tidak bisa dimainkan');
    }

    // Idempotensi dicek sebelum batas harian supaya request ulang dengan
    // Idempotency-Key yang sama selalu mengembalikan hasil yang sama.
    if (idempotencyKey) {
      const previous = await gamificationRepo.findPlayByIdempotencyKey(idempotencyKey, tx);
      if (previous && str(previous.userId) === userId) {
        return { replayed: true as const, play: previous as unknown as Record<string, unknown>, activityId };
      }
    }

    const maxPlaysPerDay = dailyLimitOf(activity);
    const playsToday = await gamificationRepo.countPlaysToday(activityId, userId, tx);
    if (maxPlaysPerDay !== null && playsToday >= maxPlaysPerDay) {
      throw unprocessable('Batas main hari ini sudah tercapai');
    }

    // Undian berweighted random dijalankan di SQL oleh drawReward.
    const drawn = await gamificationRepo.drawReward(activityId, tx);
    const rewardType = (drawn ? str(drawn.rewardType, 'none') : 'none') as GamificationRewardType;
    const rewardValue = drawn ? num(drawn.rewardValue) : 0;
    const rewardConfig = json<Record<string, unknown>>(drawn?.config, {});
    const rewardId = drawn ? strOrNull(drawn.id) : null;

    // Kode voucher digenerate sebelum play disimpan supaya hasil retry
    // (yang dibaca dari result) tetap sama.
    const voucherCode = rewardType === 'voucher' ? generateVoucherCode() : null;
    const pointsEarned = rewardType === 'points' ? Math.max(0, Math.trunc(rewardValue)) : 0;
    const message = rewardMessage(rewardType, rewardValue, activityName);

    const play = await gamificationRepo.insertPlay(
      {
        userId,
        activityId,
        rewardId,
        idempotencyKey,
        result: {
          rewardType,
          rewardValue,
          rewardConfig,
          pointsEarned,
          voucherCode,
          message,
        },
      },
      tx,
    );
    if (!play) throw unprocessable('Hasil permainan gagal disimpan, silakan coba lagi');

    const playId = str(play.id);
    await grantReward(
      { userId, playId, activityName, rewardType, rewardValue, rewardConfig, pointsEarned, voucherCode },
      tx,
    );

    return {
      replayed: false as const,
      play: {
        ...(play as unknown as Record<string, unknown>),
        activityId,
        activityCode: str(activity.code),
        activityName,
        rewardId,
        rewardType,
        rewardValue,
        result: json<Record<string, unknown>>(play.result, {}),
      },
      activityId,
    };
  });

  if (outcome.replayed) {
    return buildResponse(await hydrateReplay(outcome.play), userId, true);
  }

  return buildResponse(outcome.play, userId, false);
}

interface RewardGrantInput {
  userId: string;
  playId: string;
  activityName: string;
  rewardType: GamificationRewardType;
  rewardValue: number;
  rewardConfig: Record<string, unknown>;
  pointsEarned: number;
  voucherCode: string | null;
}

/**
 * Memberikan hadiah hasil undian. `points` masuk ke point_ledger, `voucher`
 * menerbitkan user_voucher, `free_product` hanya dikembalikan sebagai referensi
 * produk, dan `none` tidak memberi apa pun.
 */
async function grantReward(input: RewardGrantInput, tx: TransactionClient): Promise<void> {
  if (input.rewardType === 'points') {
    if (input.pointsEarned <= 0) return;

    // Lock baris user supaya dua hadiah yang datang bersamaan tidak saling
    // menimpa saldo poin.
    await loyaltyRepo.lockUserForPoints(input.userId, tx);
    await loyaltyRepo.insertPointEntry(
      {
        userId: input.userId,
        pointsDelta: input.pointsEarned,
        mutationType: 'earn',
        description: `Poin dari ${input.activityName} (${input.pointsEarned} poin)`,
        referenceType: PLAY_REFERENCE_TYPE,
        referenceId: input.playId,
        idempotencyKey: `${POINTS_IDEMPOTENCY_PREFIX}${input.playId}`,
      },
      tx,
    );
    return;
  }

  if (input.rewardType === 'voucher') {
    await issueVoucher(input, tx);
  }
}

/** Voucher hadiah butuh promo asal; promo diambil dari config reward. */
async function issueVoucher(input: RewardGrantInput, tx: TransactionClient): Promise<void> {
  const promoId = strOrNull(input.rewardConfig.promoId);
  const promoCode = strOrNull(input.rewardConfig.promoCode);

  const promo = promoId
    ? await promoRepo.lockPromoById(promoId, tx)
    : promoCode
      ? await promoRepo.lockPromoByCode(promoCode, tx)
      : null;

  if (!promo) {
    throw unprocessable('Konfigurasi hadiah voucher belum lengkap');
  }

  const expiresInDays = Math.trunc(num(input.rewardConfig.expiresInDays, DEFAULT_VOUCHER_DAYS));
  const expiresAt = new Date(Date.now() + Math.max(1, expiresInDays) * 24 * 60 * 60 * 1000);

  await promoRepo.insertUserVoucher(
    {
      userId: input.userId,
      promoId: str(promo.id),
      code: input.voucherCode ?? generateVoucherCode(),
      expiresAt,
      status: NEW_VOUCHER_STATUS,
    },
    tx,
  );
}

/** Menyusun respons play yang konsisten untuk percobaan baru maupun replay. */
async function buildResponse(
  play: Record<string, unknown>,
  userId: string,
  replayed: boolean,
) {
  const result = json<Record<string, unknown>>(play.result, {});
  const rewardType = (strOrNull(result.rewardType) ?? 'none') as GamificationRewardType;
  const voucherCode = strOrNull(result.voucherCode);
  const voucher = voucherCode
    ? await promoRepo.findUserVoucherByCode(voucherCode, userId)
    : null;

  const summary = (await loyaltyRepo.getPointsSummary(userId)) as unknown as Record<string, unknown>;

  return {
    play: {
      id: str(play.id),
      activityId: strOrNull(play.activityId),
      activityCode: strOrNull(play.activityCode),
      activityName: strOrNull(play.activityName),
      rewardId: strOrNull(play.rewardId),
      reward: {
        rewardType,
        rewardValue: num(result.rewardValue),
        config: json<Record<string, unknown>>(result.rewardConfig, {}),
        isWin: WINNING_REWARD.includes(rewardType),
      },
      playedAt: iso(play.playedAt),
      result,
    },
    pointsEarned: num(result.pointsEarned),
    pointsBalance: num(summary?.balance ?? summary?.lifetimeEarned),
    voucher: voucher
      ? {
          id: str(voucher.id),
          promoId: str(voucher.promoId),
          code: strOrNull(voucher.code),
          status: str(voucher.status),
          issuedAt: iso(voucher.issuedAt),
          expiresAt: iso(voucher.expiresAt),
          usedAt: iso(voucher.usedAt),
        }
      : null,
    message: str(result.message, rewardMessage(rewardType, num(result.rewardValue), 'aktivitas')),
    replayed,
  };
}

/**
 * Replay idempoten hanya punya kolom hasil yang tersimpan di gamification_plays,
 * jadi nama aktivitas dan reward masih dilengkapi di sini supaya respons retry
 * identik dengan respons percobaan pertama.
 */
async function hydrateReplay(play: Record<string, unknown>) {
  const activityId = strOrNull(play.activityId);
  const activity = activityId ? await gamificationRepo.findActivityById(activityId) : null;

  const result = json<Record<string, unknown>>(play.result, {});
  const rewardType = (strOrNull(result.rewardType) ?? 'none') as GamificationRewardType;

  return {
    ...play,
    activityId,
    activityCode: activity ? str(activity.code) : null,
    activityName: activity ? str(activity.name) : null,
    rewardId: strOrNull(play.rewardId),
    rewardType,
    rewardValue: num(result.rewardValue),
    result,
  };
}

// --------------------------------------------------------------------------
// GET /me/gamification/history
// --------------------------------------------------------------------------
export async function listPlayHistory(
  userId: string,
  query: ListPlayHistoryQuery,
): Promise<Paginated<ReturnType<typeof shapePlay>> & { totalPointsFromGames: number }> {
  const paging = parsePagination(query);
  const filters = { activityId: query.activityId };

  const rows = await gamificationRepo.listPlaysByUser(userId, { activityId: filters.activityId }, paging);
  const [total, totalPointsFromGames] = await Promise.all([
    gamificationRepo.countPlaysByUser(userId, query.activityId as string | undefined),
    gamificationRepo.userTotalPointsFromGames(userId),
  ]);

  const pagination: Pagination = { page: paging.page, limit: paging.limit, offset: paging.offset, total };
  return {
    items: rows.map(shapePlay),
    meta: buildPaginationMeta(pagination),
    totalPointsFromGames,
  };
}
