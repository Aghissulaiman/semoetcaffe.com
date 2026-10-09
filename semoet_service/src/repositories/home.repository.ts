import { db, many, one, scalar, type Exec } from './base.js';

/** Banner yang sedang aktif pada waktu tertentu. */
export async function listActiveBanners(at: Date, limit: number, executor: Exec = db) {
  return many(
    executor,
    `SELECT id, title, image_storage_key, image_url, target_url, starts_at, ends_at, sort_order
       FROM home_banners
      WHERE is_active = true
        AND (starts_at IS NULL OR starts_at <= $1)
        AND (ends_at IS NULL OR ends_at >= $1)
      ORDER BY sort_order ASC, starts_at DESC NULLS LAST
      LIMIT $2`,
    [at, limit],
  );
}

export async function findBannerById(bannerId: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT id, title, image_storage_key, image_url, target_url, starts_at, ends_at, sort_order, is_active
       FROM home_banners
      WHERE id = $1`,
    [bannerId],
  );
}

export interface FeaturedFilters {
  placement?: string;
  at: Date;
  limit: number;
}

export async function listFeaturedProducts(filters: FeaturedFilters, executor: Exec = db) {
  return many(
    executor,
    `SELECT fp.placement, fp.sort_order, fp.starts_at, fp.ends_at,
            p.id, p.name, p.slug, p.description, p.product_kind, p.is_featured,
            c.name AS category_name, c.slug AS category_slug,
            min_price.price_idr AS min_price_idr,
            primary_img.public_url AS image_url
       FROM featured_products fp
       JOIN products p ON p.id = fp.product_id AND p.deleted_at IS NULL AND p.is_active = true
       JOIN product_categories c ON c.id = p.category_id
       LEFT JOIN LATERAL (
         SELECT MIN(price_idr)::bigint AS price_idr
           FROM product_variants
          WHERE product_id = p.id AND is_active = true
       ) min_price ON true
       LEFT JOIN LATERAL (
         SELECT public_url FROM product_images
          WHERE product_id = p.id
          ORDER BY is_primary DESC, sort_order ASC
          LIMIT 1
       ) primary_img ON true
      WHERE ($1::text IS NULL OR fp.placement = $1)
        AND (fp.starts_at IS NULL OR fp.starts_at <= $2)
        AND (fp.ends_at IS NULL OR fp.ends_at >= $2)
      ORDER BY fp.placement ASC, fp.sort_order ASC, p.name ASC
      LIMIT $3`,
    [filters.placement ?? null, filters.at, filters.limit],
  );
}

export async function listFeaturedPlacements(at: Date, executor: Exec = db) {
  return many<{ placement: string; productCount: number }>(
    executor,
    `SELECT fp.placement, COUNT(*)::int AS product_count
       FROM featured_products fp
       JOIN products p ON p.id = fp.product_id AND p.deleted_at IS NULL AND p.is_active = true
      WHERE (fp.starts_at IS NULL OR fp.starts_at <= $1)
        AND (fp.ends_at IS NULL OR fp.ends_at >= $1)
      GROUP BY fp.placement
      ORDER BY fp.placement`,
    [at],
  );
}

/** Produk baru untuk section "Baru" di home. */
export async function listNewArrivals(limit: number, executor: Exec = db) {
  return many(
    executor,
    `SELECT p.id, p.name, p.slug, p.description, p.product_kind,
            c.name AS category_name, c.slug AS category_slug,
            min_price.price_idr AS min_price_idr,
            primary_img.public_url AS image_url
       FROM products p
       JOIN product_categories c ON c.id = p.category_id
       LEFT JOIN LATERAL (
         SELECT MIN(price_idr)::bigint AS price_idr FROM product_variants
          WHERE product_id = p.id AND is_active = true
       ) min_price ON true
       LEFT JOIN LATERAL (
         SELECT public_url FROM product_images WHERE product_id = p.id
          ORDER BY is_primary DESC, sort_order ASC LIMIT 1
       ) primary_img ON true
      WHERE p.is_active = true AND p.deleted_at IS NULL
        AND (p.available_from IS NULL OR p.available_from <= now())
      ORDER BY p.created_at DESC
      LIMIT $1`,
    [limit],
  );
}

/** Produk terlaris (paling banyak di-favorite user). */
export async function listMostFavorited(limit: number, executor: Exec = db) {
  return many(
    executor,
    `SELECT p.id, p.name, p.slug, p.description, p.product_kind,
            c.name AS category_name,
            COUNT(f.product_id)::int AS favorite_count,
            min_price.price_idr AS min_price_idr,
            primary_img.public_url AS image_url
       FROM favorites f
       JOIN products p ON p.id = f.product_id AND p.deleted_at IS NULL AND p.is_active = true
       JOIN product_categories c ON c.id = p.category_id
       LEFT JOIN LATERAL (
         SELECT MIN(price_idr)::bigint AS price_idr FROM product_variants
          WHERE product_id = p.id AND is_active = true
       ) min_price ON true
       LEFT JOIN LATERAL (
         SELECT public_url FROM product_images WHERE product_id = p.id
          ORDER BY is_primary DESC, sort_order ASC LIMIT 1
       ) primary_img ON true
      GROUP BY p.id, c.name, min_price.price_idr, primary_img.public_url
      ORDER BY COUNT(f.product_id) DESC, p.name ASC
      LIMIT $1`,
    [limit],
  );
}

export async function countProductsByCategory(executor: Exec = db) {
  return many<{ categoryId: string; categoryName: string; productCount: number }>(
    executor,
    `SELECT c.id AS category_id, c.name AS category_name, COUNT(p.id)::int AS product_count
       FROM product_categories c
       LEFT JOIN products p ON p.category_id = c.id AND p.is_active = true AND p.deleted_at IS NULL
      WHERE c.is_active = true
      GROUP BY c.id, c.name, c.sort_order
      ORDER BY c.sort_order ASC, c.name ASC`,
  );
}

export async function countApprovedMoments(executor: Exec = db) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int FROM semoet_moments WHERE moderation_status = 'approved'`,
  );
  return Number(value ?? 0);
}