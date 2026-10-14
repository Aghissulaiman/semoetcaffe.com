import { db, many, one, scalar, type Exec } from './base.js';
import { paginationSql, type Paging } from '../utils/pagination.js';

// --------------------------------------------------------------------------
// Categories (product_categories)
// --------------------------------------------------------------------------
export async function listCategories(
  options: { isActive?: boolean; parentId?: string | null },
  executor: Exec = db,
) {
  return many(
    executor,
    `WITH RECURSIVE category_tree AS (
       SELECT c.id, c.parent_id, c.name, c.slug, c.sort_order, c.is_active, 0 AS depth, ARRAY[c.id] AS path
         FROM product_categories c
        WHERE c.parent_id IS NULL
        UNION ALL
       SELECT c.id, c.parent_id, c.name, c.slug, c.sort_order, c.is_active, t.depth + 1, t.path || c.id
         FROM product_categories c
         JOIN category_tree t ON c.parent_id = t.id
        WHERE t.depth < 3
     )
     SELECT ct.id, ct.parent_id, ct.name, ct.slug, ct.sort_order, ct.is_active, ct.depth,
            (SELECT COUNT(*)::int FROM products p WHERE p.category_id = ct.id AND p.is_active AND p.deleted_at IS NULL) AS product_count
       FROM category_tree ct
      WHERE ($1::boolean IS NULL OR ct.is_active = $1)
        AND ($2::uuid IS NULL OR ct.parent_id = $2)
      ORDER BY ct.path`,
    [options.isActive ?? null, options.parentId ?? null],
  );
}

export async function findCategoryBySlug(slug: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT id, parent_id, name, slug, sort_order, is_active
       FROM product_categories
      WHERE slug = $1`,
    [slug],
  );
}

export async function findCategoryById(categoryId: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT id, parent_id, name, slug, sort_order, is_active
       FROM product_categories
      WHERE id = $1`,
    [categoryId],
  );
}

// --------------------------------------------------------------------------
// Products (products)
// --------------------------------------------------------------------------
export interface ProductFilters {
  categoryId?: string;
  parentCategoryId?: string;
  categorySlug?: string;
  productKind?: string;
  isFeatured?: boolean;
  branchId?: string;
  availableAt?: string;
  serviceType?: string;
  minPriceIdr?: number;
  maxPriceIdr?: number;
  q?: string;
  sort: string;
  includeModifiers: boolean;
  includeImages: boolean;
}

const PRODUCT_SORTS: Record<string, string> = {
  name: 'p.name ASC',
  price_asc: 'min_price_idr ASC NULLS LAST, p.name ASC',
  price_desc: 'min_price_idr DESC NULLS LAST, p.name ASC',
  newest: 'p.created_at DESC',
  featured: 'p.is_featured DESC, p.sort_order ASC, p.name ASC',
  popular: 'p.sort_order ASC, p.name ASC',
};

export function buildProductQuery(
  filters: ProductFilters,
  pagination: { limit: number; offset: number },
  favoriteIds: Set<string>,
) {
  const favoriteList = [...favoriteIds];
  const orderBy = PRODUCT_SORTS[filters.sort] ?? PRODUCT_SORTS.featured;

  const params: unknown[] = [
    filters.categoryId ?? null,
    filters.parentCategoryId ?? null,
    filters.categorySlug ?? null,
    filters.productKind ?? null,
    filters.isFeatured ?? null,
    filters.branchId ?? null,
    filters.availableAt ?? null,
    // serviceType tidak difilter: kolom service_type hanya ada di jam buka cabang,
    // butuh konteks cabang — untuk sekarang param diabaikan supaya query tetap valid.
    filters.minPriceIdr ?? null,
    filters.maxPriceIdr ?? null,
    filters.q ?? null,
    favoriteList,
  ];

  return {
    text: `
      SELECT p.id, p.category_id, p.name, p.slug, p.description, p.product_kind,
             p.is_active, p.is_featured, p.available_from, p.available_until, p.sort_order,
             p.created_at, p.updated_at,
             c.name AS category_name, c.slug AS category_slug,
             min_price.price_idr AS min_price_idr,
             max_price.price_idr AS max_price_idr,
             primary_img.public_url AS image_url,
             primary_img.alt_text AS image_alt,
             COALESCE(rating.avg_rating, 0) AS average_rating,
             COALESCE(rating.review_count, 0) AS review_count,
             (p.id = ANY($11::uuid[])) AS is_favorite,
             ${filters.includeImages ? 'images.gallery' : `'[]'::jsonb AS gallery`},
             ${filters.includeModifiers ? 'mods.groups' : `'[]'::jsonb AS modifier_groups`}
        FROM products p
        JOIN product_categories c ON c.id = p.category_id
        LEFT JOIN LATERAL (
          SELECT MIN(price_idr)::bigint AS price_idr
            FROM product_variants
           WHERE product_id = p.id AND is_active = true
        ) min_price ON true
        LEFT JOIN LATERAL (
          SELECT MAX(price_idr)::bigint AS price_idr
            FROM product_variants
           WHERE product_id = p.id AND is_active = true
        ) max_price ON true
        LEFT JOIN LATERAL (
          SELECT public_url, alt_text
            FROM product_images
           WHERE product_id = p.id
           ORDER BY is_primary DESC, sort_order ASC
           LIMIT 1
        ) primary_img ON true
        LEFT JOIN LATERAL (
          SELECT jsonb_agg(jsonb_build_object(
                   'id', pi.id, 'publicUrl', pi.public_url, 'altText', pi.alt_text,
                   'widthPx', pi.width_px, 'heightPx', pi.height_px, 'sortOrder', pi.sort_order
                 ) ORDER BY pi.is_primary DESC, pi.sort_order ASC) AS gallery
            FROM product_images pi
           WHERE pi.product_id = p.id
        ) images ON true
        LEFT JOIN LATERAL (
          SELECT jsonb_agg(jsonb_build_object(
                   'groupId', mg.id, 'name', mg.name, 'minSelect', mg.min_select,
                   'maxSelect', mg.max_select, 'isRequired', mg.is_required, 'sortOrder', pmg.sort_order,
                   'options', COALESCE(options.list, '[]'::jsonb)
                 ) ORDER BY pmg.sort_order ASC, mg.name ASC) AS groups
            FROM product_modifier_groups pmg
            JOIN modifier_groups mg ON mg.id = pmg.group_id AND mg.is_active = true
            LEFT JOIN LATERAL (
              SELECT jsonb_agg(jsonb_build_object(
                       'id', mo.id, 'name', mo.name, 'priceDeltaIdr', mo.price_delta_idr,
                       'sortOrder', mo.sort_order, 'isActive', mo.is_active
                     ) ORDER BY mo.sort_order ASC) AS list
                FROM modifier_options mo
               WHERE mo.group_id = mg.id AND mo.is_active = true
            ) options ON true
           WHERE pmg.product_id = p.id
        ) mods ON true
        LEFT JOIN LATERAL (
          SELECT ROUND(AVG(r.food_rating)::numeric, 2) AS avg_rating, COUNT(*)::int AS review_count
            FROM reviews r
           WHERE r.product_id = p.id AND r.moderation_status = 'visible'
        ) rating ON true
       WHERE p.deleted_at IS NULL
         AND p.is_active = true
         AND ($1::uuid IS NULL OR p.category_id = $1)
         AND (
           $2::uuid IS NULL
           OR c.parent_id = $2
           OR c.id IN (WITH RECURSIVE subtree AS (
                SELECT id FROM product_categories WHERE id = $2
                UNION ALL
                SELECT c2.id FROM product_categories c2 JOIN subtree s ON c2.parent_id = s.id
              ) SELECT id FROM subtree)
         )
         AND ($3::text IS NULL OR c.slug = $3)
         AND ($4::text IS NULL OR p.product_kind = $4)
         AND ($5::boolean IS NULL OR p.is_featured = $5)
         AND ($7::timestamptz IS NULL OR (
              (p.available_from IS NULL OR p.available_from <= $7)
              AND (p.available_until IS NULL OR p.available_until >= $7)
         ))
         AND ($6::uuid IS NULL OR EXISTS (
              SELECT 1 FROM product_availability pa
               WHERE pa.product_id = p.id
                 AND (pa.branch_id = $6 OR pa.branch_id IS NULL)
                 AND pa.is_available = true
                 AND (pa.day_of_week IS NULL OR pa.day_of_week = EXTRACT(ISODOW FROM ($7::timestamptz AT TIME ZONE 'Asia/Jakarta'))::int % 7)
         ))
         AND ($8::bigint IS NULL OR max_price.price_idr >= $8)
         AND ($9::bigint IS NULL OR min_price.price_idr <= $9)
         AND ($10::text IS NULL OR p.name ILIKE '%' || $10 || '%' OR p.description ILIKE '%' || $10 || '%')
       ORDER BY ${orderBy}
       ${paginationSql(pagination)}`,
    params,
  };
}

export async function listProducts(
  filters: ProductFilters,
  pagination: Paging,
  favoriteIds: Set<string> = new Set(),
  executor: Exec = db,
) {
  const query = buildProductQuery(filters, pagination, favoriteIds);
  return many(executor, query.text, query.params);
}

export async function countProducts(filters: ProductFilters, favoriteIds: Set<string> = new Set(), executor: Exec = db) {
  const query = buildProductQuery(filters, { limit: 0, offset: 0 }, favoriteIds);
  // Ubah select menjadi count dengan membungkus query.
  const countQuery = `SELECT COUNT(*)::int AS total FROM (${stripTrailingLimit(query.text)}) q`;
  const value = await scalar<number>(executor, countQuery, query.params);
  return Number(value ?? 0);
}

/** Buang clause LIMIT/OFFSET agar bisa dibungkus COUNT. */
function stripTrailingLimit(sql: string): string {
  return sql.replace(/\sLIMIT\s+\d+\s+OFFSET\s+\d+\s*$/i, '').trim();
}

export async function findProductBySlug(slug: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT p.id, p.category_id, p.name, p.slug, p.description, p.product_kind,
            p.is_active, p.is_featured, p.available_from, p.available_until, p.sort_order,
            p.created_at, p.updated_at,
            c.name AS category_name, c.slug AS category_slug, c.id AS category_id
       FROM products p
       JOIN product_categories c ON c.id = p.category_id
      WHERE p.slug = $1 AND p.deleted_at IS NULL`,
    [slug],
  );
}

export async function findProductById(productId: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT p.id, p.category_id, p.name, p.slug, p.description, p.product_kind,
            p.is_active, p.is_featured, p.available_from, p.available_until, p.sort_order,
            p.created_at, p.updated_at,
            c.name AS category_name, c.slug AS category_slug
       FROM products p
       JOIN product_categories c ON c.id = p.category_id
      WHERE p.id = $1 AND p.deleted_at IS NULL`,
    [productId],
  );
}

/** Lock produk/varian saat pembuatan order supaya harga tidak berubah di tengah kalkulasi. */
export async function lockProductVariant(variantId: string, executor: Exec) {
  return one<{
    variantId: string;
    productId: string;
    sku: string;
    variantName: string;
    priceIdr: number;
    productName: string;
    productIsActive: boolean;
    variantIsActive: boolean;
  }>(
    executor,
    `SELECT pv.id AS variant_id, pv.product_id, pv.sku, pv.name AS variant_name, pv.price_idr,
            p.name AS product_name, p.is_active AS product_is_active, pv.is_active AS variant_is_active,
            p.available_from, p.available_until, p.deleted_at
       FROM product_variants pv
       JOIN products p ON p.id = pv.product_id
      WHERE pv.id = $1
      FOR UPDATE OF pv`,
    [variantId],
  );
}

export async function findProductAvailability(productId: string, branchId?: string, executor: Exec = db) {
  return many(
    executor,
    `SELECT id, product_id, branch_id, day_of_week, starts_at, ends_at, starts_on, ends_on, is_available
       FROM product_availability
      WHERE product_id = $1
        AND ($2::uuid IS NULL OR branch_id = $2 OR branch_id IS NULL)
      ORDER BY day_of_week NULLS FIRST, starts_at NULLS FIRST`,
    [productId, branchId ?? null],
  );
}

/**
 * Cek ketersediaan produk pada tanggal/waktu tertentu.
 * Aturan: harus ada minimal satu baris applicable; jika tidak ada row sama sekali
 * produk dianggap tersedia (katalog tidak membatasi).
 */
export async function checkProductAvailability(
  productId: string,
  branchId: string | null,
  at: Date,
  executor: Exec = db,
) {
  return one<{ isAvailable: boolean; reason: string | null }>(
    executor,
    `SELECT
        COALESCE(bool_or(rule.is_available), true) AS is_available,
        string_agg(DISTINCT rule.note, ', ') FILTER (WHERE NOT rule.is_available) AS reason
       FROM product_availability pa
       CROSS JOIN LATERAL (
         SELECT true AS is_available, NULL::text AS note
           WHERE pa.product_id = $1
             AND (pa.branch_id = $2 OR pa.branch_id IS NULL)
             AND (pa.day_of_week IS NULL OR pa.day_of_week = EXTRACT(ISODOW FROM ($3::timestamptz AT TIME ZONE 'Asia/Jakarta'))::int % 7)
             AND (pa.starts_at IS NULL OR (pa.starts_at, COALESCE(pa.ends_at, pa.starts_at)) OVERLAPS (($3::timestamptz AT TIME ZONE 'Asia/Jakarta')::time, ($3::timestamptz AT TIME ZONE 'Asia/Jakarta')::time))
             AND (pa.starts_on IS NULL OR pa.starts_on::date <= $3::timestamptz)
             AND (pa.ends_on IS NULL OR pa.ends_on::date >= $3::timestamptz)
       ) rule
      WHERE pa.product_id = $1`,
    [productId, branchId, at],
  );
}

// --------------------------------------------------------------------------
// Variants (product_variants)
// --------------------------------------------------------------------------
export async function listVariants(productId: string, executor: Exec = db) {
  return many(
    executor,
    `SELECT id, product_id, sku, name, price_idr, compare_at_price_idr, sort_order, is_default, is_active
       FROM product_variants
      WHERE product_id = $1
      ORDER BY sort_order ASC, price_idr ASC`,
    [productId],
  );
}

export async function findVariantById(variantId: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT id, product_id, sku, name, price_idr, compare_at_price_idr, sort_order, is_default, is_active
       FROM product_variants
      WHERE id = $1`,
    [variantId],
  );
}

/** Varian beserta harga modal (HPP) — khusus panel admin, tidak diekspos ke katalog publik. */
export async function listVariantsWithCost(productId: string, executor: Exec = db) {
  return many(
    executor,
    `SELECT id, product_id, sku, name, price_idr, cost_idr, compare_at_price_idr, sort_order, is_default, is_active
       FROM product_variants
      WHERE product_id = $1
      ORDER BY sort_order ASC, price_idr ASC`,
    [productId],
  );
}

/** Perbarui HPP beberapa varian sekaligus (dibatasi ke produk tertentu). */
export async function updateVariantCosts(
  productId: string,
  items: { variantId: string; costIdr: number }[],
  executor: Exec = db,
) {
  if (items.length === 0) return [];
  const variantIds = items.map((item) => item.variantId);
  const costs = items.map((item) => item.costIdr);
  return many(
    executor,
    `UPDATE product_variants pv
        SET cost_idr = v.cost_idr,
            updated_at = now()
       FROM unnest($1::uuid[], $2::bigint[]) AS v(variant_id, cost_idr)
      WHERE pv.id = v.variant_id
        AND pv.product_id = $3
      RETURNING pv.id, pv.product_id, pv.sku, pv.name, pv.price_idr, pv.cost_idr,
                pv.compare_at_price_idr, pv.sort_order, pv.is_default, pv.is_active`,
    [variantIds, costs, productId],
  );
}

// --------------------------------------------------------------------------
// Images (product_images)
// --------------------------------------------------------------------------
export async function listProductImages(productId: string, executor: Exec = db) {
  return many(
    executor,
    `SELECT id, product_id, storage_key, public_url, alt_text, sort_order, is_primary, width_px, height_px, created_at
       FROM product_images
      WHERE product_id = $1
      ORDER BY is_primary DESC, sort_order ASC`,
    [productId],
  );
}

export async function listProductImagesBulk(productIds: string[], executor: Exec = db) {
  if (productIds.length === 0) return [];
  return many(
    executor,
    `SELECT id, product_id, storage_key, public_url, alt_text, sort_order, is_primary, width_px, height_px
       FROM product_images
      WHERE product_id = ANY($1::uuid[])
      ORDER BY is_primary DESC, sort_order ASC`,
    [productIds],
  );
}

// --------------------------------------------------------------------------
// Modifiers (product_modifier_groups + modifier_groups + modifier_options)
// --------------------------------------------------------------------------
export async function listProductModifiers(productId: string, executor: Exec = db) {
  return many(
    executor,
    `SELECT pmg.group_id, mg.name AS group_name, pmg.sort_order,
            COALESCE(pmg.min_select_override, mg.min_select) AS min_select,
            COALESCE(pmg.max_select_override, mg.max_select) AS max_select,
            mg.is_required, mg.is_active,
            options.list AS options
       FROM product_modifier_groups pmg
       JOIN modifier_groups mg ON mg.id = pmg.group_id
       LEFT JOIN LATERAL (
         SELECT jsonb_agg(jsonb_build_object(
                  'id', mo.id, 'name', mo.name, 'priceDeltaIdr', mo.price_delta_idr,
                  'sortOrder', mo.sort_order, 'isActive', mo.is_active
                ) ORDER BY mo.sort_order ASC) AS list
           FROM modifier_options mo
          WHERE mo.group_id = mg.id AND mo.is_active = true
       ) options ON true
      WHERE pmg.product_id = $1 AND mg.is_active = true
      ORDER BY pmg.sort_order ASC, mg.name ASC`,
    [productId],
  );
}

export async function listModifierOptionsForGroups(groupIds: string[], executor: Exec = db) {
  if (groupIds.length === 0) return [];
  return many(
    executor,
    `SELECT id, group_id, name, price_delta_idr, sort_order, is_active
       FROM modifier_options
      WHERE group_id = ANY($1::uuid[]) AND is_active = true
      ORDER BY group_id, sort_order`,
    [groupIds],
  );
}

export async function findModifierOption(optionId: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT mo.id, mo.group_id, mo.name, mo.price_delta_idr, mo.is_active,
            mg.name AS group_name, mg.min_select, mg.max_select, mg.is_required,
            pmg.product_id
       FROM modifier_options mo
       JOIN modifier_groups mg ON mg.id = mo.group_id
       LEFT JOIN product_modifier_groups pmg ON pmg.group_id = mg.id
      WHERE mo.id = $1`,
    [optionId],
  );
}

/** Opsi yang valid untuk sebuah varian (dibatasi product_modifier_groups). */
export async function validOptionsForVariant(variantId: string, executor: Exec = db) {
  return many<{ optionId: string; groupId: string; groupName: string; minSelect: number; maxSelect: number; isRequired: boolean; priceDeltaIdr: number }>(
    executor,
    `SELECT mo.id AS option_id, mg.id AS group_id, mg.name AS group_name,
            COALESCE(pmg.min_select_override, mg.min_select) AS min_select,
            COALESCE(pmg.max_select_override, mg.max_select) AS max_select,
            mg.is_required,
            mo.price_delta_idr
       FROM product_variants pv
       JOIN products p ON p.id = pv.product_id
       JOIN product_modifier_groups pmg ON pmg.product_id = p.id
       JOIN modifier_groups mg ON mg.id = pmg.group_id AND mg.is_active = true
       JOIN modifier_options mo ON mo.group_id = mg.id AND mo.is_active = true
      WHERE pv.id = $1`,
    [variantId],
  );
}

export async function findGroupDefinition(groupId: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT id, name, min_select, max_select, is_required, is_active FROM modifier_groups WHERE id = $1`,
    [groupId],
  );
}

export async function findOptionById(optionId: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT id, group_id, name, price_delta_idr, sort_order, is_active FROM modifier_options WHERE id = $1`,
    [optionId],
  );
}

/** Semua group + options milik produk, untuk validasi min/max saat create order. */
export async function loadVariantModifierGroups(variantId: string, executor: Exec = db) {
  const groups = await many<{
    groupId: string;
    name: string;
    minSelect: number;
    maxSelect: number;
    isRequired: boolean;
  }>(
    executor,
    `SELECT mg.id AS group_id, mg.name,
            COALESCE(pmg.min_select_override, mg.min_select) AS min_select,
            COALESCE(pmg.max_select_override, mg.max_select) AS max_select,
            mg.is_required
       FROM product_variants pv
       JOIN products p ON p.id = pv.product_id
       JOIN product_modifier_groups pmg ON pmg.product_id = p.id
       JOIN modifier_groups mg ON mg.id = pmg.group_id
      WHERE pv.id = $1 AND mg.is_active = true
      ORDER BY pmg.sort_order ASC`,
    [variantId],
  );

  const options = await many<{ id: string; groupId: string; name: string; priceDeltaIdr: number }>(
    executor,
    `SELECT mo.id, mo.group_id, mo.name, mo.price_delta_idr
       FROM product_variants pv
       JOIN products p ON p.id = pv.product_id
       JOIN product_modifier_groups pmg ON pmg.product_id = p.id
       JOIN modifier_options mo ON mo.group_id = pmg.group_id
      WHERE pv.id = $1 AND mo.is_active = true
      ORDER BY mo.sort_order ASC`,
    [variantId],
  );

  return { groups, options };
}