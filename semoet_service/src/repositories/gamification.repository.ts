import { db, many, one, scalar, type Exec } from './base.js';
import { paginationSql, type Paging } from '../utils/pagination.js';

// --------------------------------------------------------------------------
// Activities (gamification_activities)
// --------------------------------------------------------------------------
export async function listActivities(
  filters: { isActive?: boolean; activityType?: string; at: Date },
  executor: Exec = db,
) {
  return many(
    executor,
    `SELECT a.id, a.code, a.name, a.activity_type, a.rules, a.starts_at, a.ends_at, a.is_active,
            (SELECT COUNT(*)::int FROM gamification_rewards r WHERE r.activity_id = a.id) AS reward_count
       FROM gamification_activities a
      WHERE ($1::boolean IS NULL OR a.is_active = $1)
        AND ($2::text IS NULL OR a.activity_type = $2)
        AND (a.starts_at IS NULL OR a.starts_at <= $3)
        AND (a.ends_at IS NULL OR a.ends_at >= $3)
      ORDER BY a.code`,
    [filters.isActive ?? null, filters.activityType ?? null, filters.at],
  );
}

export async function findActivityByCode(code: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT id, code, name, activity_type, rules, starts_at, ends_at, is_active
       FROM gamification_activities
      WHERE code = $1`,
    [code],
  );
}

export async function findActivityById(activityId: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT id, code, name, activity_type, rules, starts_at, ends_at, is_active
       FROM gamification_activities
      WHERE id = $1`,
    [activityId],
  );
}

/** Lock activity untuk memeriksa batas main harian sebelumRvidence. */
export async function lockActivityByCode(code: string, executor: Exec) {
  return one(
    executor,
    `SELECT id, code, name, activity_type, rules, starts_at, ends_at, is_active
       FROM gamification_activities
      WHERE code = $1
      FOR UPDATE`,
    [code],
  );
}

export async function findActivityByIdForUser(activityId: string, userId: string, executor: Exec) {
  return one<{ playCount: number; lastPlayedAt: string | null }>(
    executor,
    `SELECT COUNT(*)::int AS play_count, MAX(played_at) AS last_played_at
       FROM gamification_plays
      WHERE activity_id = $1 AND user_id = $2`,
    [activityId, userId],
  );
}

// --------------------------------------------------------------------------
// Rewards (gamification_rewards) - bobot untuk undian berweighted random
// --------------------------------------------------------------------------
export async function listRewards(activityId: string, executor: Exec = db) {
  return many(
    executor,
    `SELECT id, activity_id, reward_type, reward_value, weight, config
       FROM gamification_rewards
      WHERE activity_id = $1
      ORDER BY id`,
    [activityId],
  );
}

/**
 * Undian berweighted random murni di SQL supaya satu round-trip:
 * total bobot dihitung, lalu setiap reward dibandingkan dengan angka acak [0,total).
 */
export async function drawReward(activityId: string, executor: Exec) {
  return one(
    executor,
    `WITH weighted AS (
        SELECT id, reward_type, reward_value, weight, config,
               SUM(weight) OVER (ORDER BY id) AS cumulative_weight
          FROM gamification_rewards
         WHERE activity_id = $1 AND weight > 0
     ),
     total AS (SELECT COALESCE(SUM(weight), 0) AS total_weight FROM gamification_rewards WHERE activity_id = $1),
     picked AS (
        SELECT * FROM weighted, total
         WHERE total_weight > 0
           AND (floor(random() * total_weight) + 1) <= cumulative_weight
         LIMIT 1
     )
     SELECT id, reward_type, reward_value, config FROM picked
     UNION ALL
     SELECT NULL::uuid, 'none'::text, 0, '{}'::jsonb WHERE NOT EXISTS (SELECT 1 FROM picked)`,
    [activityId],
  );
}

// --------------------------------------------------------------------------
// Plays (gamification_plays)
// --------------------------------------------------------------------------
export async function insertPlay(
  input: {
    userId: string;
    activityId: string;
    rewardId?: string | null;
    idempotencyKey?: string | null;
    result: Record<string, unknown>;
  },
  executor: Exec,
) {
  return one(
    executor,
    `INSERT INTO gamification_plays (user_id, activity_id, reward_id, idempotency_key, result)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING id, user_id, activity_id, reward_id, played_at, result`,
    [
      input.userId,
      input.activityId,
      input.rewardId ?? null,
      input.idempotencyKey ?? null,
      JSON.stringify(input.result),
    ],
  );
}

export async function findPlayByIdempotencyKey(key: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT id, user_id, activity_id, reward_id, played_at, result
       FROM gamification_plays
      WHERE idempotency_key = $1`,
    [key],
  );
}

export async function countPlaysToday(activityId: string, userId: string, executor: Exec = db) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int
       FROM gamification_plays
      WHERE activity_id = $1
        AND user_id = $2
        AND played_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Jakarta') AT TIME ZONE 'Asia/Jakarta'`,
    [activityId, userId],
  );
  return Number(value ?? 0);
}

export async function listPlaysByUser(
  userId: string,
  filters: { activityId?: string },
  pagination: Paging,
  executor: Exec = db,
) {
  return many(
    executor,
    `SELECT gp.id, gp.activity_id, gp.reward_id, gp.played_at, gp.result,
            a.code AS activity_code, a.name AS activity_name, a.activity_type,
            gr.reward_type, gr.reward_value, gr.config AS reward_config
       FROM gamification_plays gp
       JOIN gamification_activities a ON a.id = gp.activity_id
       LEFT JOIN gamification_rewards gr ON gr.id = gp.reward_id
      WHERE gp.user_id = $1
        AND ($2::uuid IS NULL OR gp.activity_id = $2)
      ORDER BY gp.played_at DESC
      ${paginationSql(pagination)}`,
    [userId, filters.activityId ?? null],
  );
}

export async function countPlaysByUser(userId: string, activityId: string | undefined, executor: Exec = db) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int FROM gamification_plays WHERE user_id = $1 AND ($2::uuid IS NULL OR activity_id = $2)`,
    [userId, activityId ?? null],
  );
  return Number(value ?? 0);
}

export async function userTotalPointsFromGames(userId: string, executor: Exec = db) {
  const value = await scalar<number>(
    executor,
    `SELECT COALESCE(SUM(gr.reward_value), 0)::int
       FROM gamification_plays gp
       JOIN gamification_rewards gr ON gr.id = gp.reward_id
      WHERE gp.user_id = $1 AND gr.reward_type = 'points'`,
    [userId],
  );
  return Number(value ?? 0);
}