import { db, many, one, scalar, type Exec } from './base.js';
import { paginationSql, type Paging } from '../utils/pagination.js';

const USER_PROFILE_SELECT = `
  u.id, u.email, u.phone_e164, u.display_name, u.status,
  u.email_verified_at, u.phone_verified_at, u.last_login_at, u.created_at,
  cp.tier_id, cp.birth_date, cp.marketing_opt_in, cp.preferences,
  t.code AS tier_code, t.name AS tier_name,
  t.minimum_lifetime_points AS tier_minimum_lifetime_points,
  t.benefits AS tier_benefits
`;

export async function findProfile(userId: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT ${USER_PROFILE_SELECT}
       FROM users u
       LEFT JOIN customer_profiles cp ON cp.user_id = u.id
       LEFT JOIN customer_tiers t ON t.id = cp.tier_id
      WHERE u.id = $1 AND u.deleted_at IS NULL`,
    [userId],
  );
}

export async function updateUser(userId: string, data: Record<string, unknown>, executor: Exec = db) {
  const columns = Object.keys(data);
  const assignments = columns.map((column, index) => `${column} = $${index + 2}`).join(', ');
  await executor.query(`UPDATE users SET ${assignments}, updated_at = now() WHERE id = $1`, [
    userId,
    ...Object.values(data),
  ]);
}

export async function findTiers(executor: Exec = db) {
  return many(
    executor,
    `SELECT id, code, name, minimum_lifetime_points, benefits, is_active, created_at
       FROM customer_tiers
      WHERE is_active = true
      ORDER BY minimum_lifetime_points ASC`,
  );
}

export async function findTierById(tierId: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT id, code, name, minimum_lifetime_points, benefits, is_active
       FROM customer_tiers
      WHERE id = $1`,
    [tierId],
  );
}

/** Tier berikutnya di atas lifetime points user (untuk progress bar di app). */
export async function findNextTier(lifetimePoints: number, currentTierId: string | null, executor: Exec = db) {
  return one(
    executor,
    `SELECT id, code, name, minimum_lifetime_points, benefits
       FROM customer_tiers
      WHERE is_active = true
        AND minimum_lifetime_points > $1
        AND ($2::uuid IS NULL OR id <> $2::uuid)
      ORDER BY minimum_lifetime_points ASC
      LIMIT 1`,
    [lifetimePoints, currentTierId],
  );
}

export async function findPreferences(userId: string, executor: Exec = db) {
  const row = await one<{ preferences: Record<string, unknown> | null }>(
    executor,
    `SELECT preferences FROM customer_profiles WHERE user_id = $1`,
    [userId],
  );
  return row?.preferences ?? {};
}

export async function updatePreferences(
  userId: string,
  preferences: Record<string, unknown>,
  executor: Exec = db,
) {
  const { text, values } = buildInsert('customer_profiles', { user_id: userId, preferences });
  await executor.query(`${text} ON CONFLICT (user_id) DO UPDATE SET preferences = EXCLUDED.preferences, updated_at = now()`, values);
  return preferences;
}

// --------------------------------------------------------------------------
// Favorites (favorites)
// --------------------------------------------------------------------------
export async function listFavorites(userId: string, pagination: Paging, executor: Exec = db) {
  return many(
    executor,
    `SELECT p.id, p.name, p.slug, p.description, p.product_kind, p.is_featured, p.sort_order,
            p.available_from, p.available_until,
            f.created_at AS favorited_at,
            COALESCE((
              SELECT MIN(pv.price_idr)::bigint
                FROM product_variants pv
               WHERE pv.product_id = p.id AND pv.is_active = true
            ), 0) AS min_price_idr,
            COALESCE((
              SELECT MAX(pv.price_idr)::bigint
                FROM product_variants pv
               WHERE pv.product_id = p.id AND pv.is_active = true
            ), 0) AS max_price_idr,
            (SELECT pi.public_url FROM product_images pi
              WHERE pi.product_id = p.id ORDER BY pi.is_primary DESC, pi.sort_order ASC LIMIT 1) AS image_url,
            c.name AS category_name, c.slug AS category_slug
       FROM favorites f
       JOIN products p ON p.id = f.product_id AND p.deleted_at IS NULL
       LEFT JOIN product_categories c ON c.id = p.category_id
      WHERE f.user_id = $1
      ORDER BY f.created_at DESC
      ${paginationSql(pagination)}`,
    [userId],
  );
}

export async function countFavorites(userId: string, executor: Exec = db) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int FROM favorites WHERE user_id = $1`,
    [userId],
  );
  return Number(value ?? 0);
}

export async function addFavorite(userId: string, productId: string, executor: Exec = db) {
  const { text, values } = buildInsert('favorites', { user_id: userId, product_id: productId });
  await executor.query(`${text} ON CONFLICT (user_id, product_id) DO NOTHING`, values);
  return one(executor, `SELECT user_id, product_id, created_at FROM favorites WHERE user_id = $1 AND product_id = $2`, [
    userId,
    productId,
  ]);
}

export async function removeFavorite(userId: string, productId: string, executor: Exec = db) {
  const row = await one<{ userId: string }>(
    executor,
    `DELETE FROM favorites WHERE user_id = $1 AND product_id = $2 RETURNING user_id`,
    [userId, productId],
  );
  return Boolean(row);
}

export async function isFavorite(userId: string, productId: string, executor: Exec = db) {
  const value = await scalar<boolean>(
    executor,
    `SELECT EXISTS (SELECT 1 FROM favorites WHERE user_id = $1 AND product_id = $2)`,
    [userId, productId],
  );
  return Boolean(value);
}

export async function favoriteProductIds(userId: string, productIds: string[], executor: Exec = db) {
  if (productIds.length === 0 || !userId) return new Set<string>();
  const rows = await many<{ productId: string }>(
    executor,
    `SELECT product_id FROM favorites WHERE user_id = $1 AND product_id = ANY($2::uuid[])`,
    [userId, productIds],
  );
  return new Set(rows.map((row) => row.productId));
}

export async function productExists(productId: string, executor: Exec = db) {
  const value = await scalar<boolean>(
    executor,
    `SELECT EXISTS (
       SELECT 1 FROM products WHERE id = $1 AND is_active = true AND deleted_at IS NULL
     )`,
    [productId],
  );
  return Boolean(value);
}

// --------------------------------------------------------------------------
function buildInsert(table: string, data: Record<string, unknown>) {
  const columns = Object.keys(data);
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
  return {
    text: `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
    values: columns.map((column) => data[column]),
  };
}