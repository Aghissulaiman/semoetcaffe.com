import { db, many, one, scalar, type Exec } from './base.js';
import { paginationSql, type Paging } from '../utils/pagination.js';

// --------------------------------------------------------------------------
// Ingredients
// --------------------------------------------------------------------------
export async function listIngredients(
  filters: { isActive?: boolean; q?: string; lowStockOnly?: boolean; branchId?: string },
  pagination: Paging,
  executor: Exec = db,
) {
  return many(
    executor,
    `SELECT i.id, i.sku, i.name, i.base_unit, i.reorder_level, i.is_active,
            i.created_at, i.updated_at,
            stock.on_hand, stock.last_movement_at
       FROM ingredients i
       LEFT JOIN LATERAL (
         SELECT
           COALESCE(SUM(im.quantity_delta), 0)::numeric AS on_hand,
           MAX(im.created_at) AS last_movement_at
           FROM inventory_movements im
           LEFT JOIN stock_locations sl ON sl.id = im.stock_location_id
          WHERE im.ingredient_id = i.id
            AND ($2::uuid IS NULL OR sl.branch_id = $2)
       ) stock ON true
      WHERE ($1::boolean IS NULL OR i.is_active = $1)
        AND ($3::text IS NULL OR i.name ILIKE '%' || $3 || '%' OR i.sku ILIKE '%' || $3 || '%')
        AND ($4::boolean = false OR COALESCE(stock.on_hand, 0) <= i.reorder_level)
      ORDER BY i.name ASC
      ${paginationSql(pagination)}`,
    [filters.isActive ?? null, filters.branchId ?? null, filters.q ?? null, filters.lowStockOnly],
  );
}

export async function countIngredients(
  filters: { isActive?: boolean; q?: string; lowStockOnly?: boolean; branchId?: string },
  executor: Exec = db,
) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int
       FROM ingredients i
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(im.quantity_delta), 0)::numeric AS on_hand
           FROM inventory_movements im
           LEFT JOIN stock_locations sl ON sl.id = im.stock_location_id
          WHERE im.ingredient_id = i.id AND ($2::uuid IS NULL OR sl.branch_id = $2)
       ) stock ON true
      WHERE ($1::boolean IS NULL OR i.is_active = $1)
        AND ($3::text IS NULL OR i.name ILIKE '%' || $3 || '%' OR i.sku ILIKE '%' || $3 || '%')
        AND ($4::boolean = false OR COALESCE(stock.on_hand, 0) <= i.reorder_level)`,
    [filters.isActive ?? null, filters.branchId ?? null, filters.q ?? null, filters.lowStockOnly],
  );
  return Number(value ?? 0);
}

export async function findIngredientById(ingredientId: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT id, sku, name, base_unit, reorder_level, is_active, created_at, updated_at
       FROM ingredients
      WHERE id = $1`,
    [ingredientId],
  );
}

export async function findIngredientBySku(sku: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT id, sku, name, base_unit FROM ingredients WHERE sku = $1`,
    [sku],
  );
}

export async function insertIngredient(
  input: { sku: string; name: string; baseUnit: string; reorderLevel: number; isActive: boolean },
  executor: Exec = db,
) {
  return one(
    executor,
    `INSERT INTO ingredients (sku, name, base_unit, reorder_level, is_active)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING id, sku, name, base_unit, reorder_level, is_active, created_at`,
    [input.sku, input.name, input.baseUnit, input.reorderLevel, input.isActive],
  );
}

export async function updateIngredient(
  ingredientId: string,
  data: Record<string, unknown>,
  executor: Exec = db,
) {
  const columns = Object.keys(data);
  if (columns.length === 0) return null;
  const assignments = columns.map((column, index) => `${column} = $${index + 2}`).join(', ');
  return one(
    executor,
    `UPDATE ingredients SET ${assignments}, updated_at = now() WHERE id = $1 RETURNING id, sku, name, base_unit, reorder_level, is_active, updated_at`,
    [ingredientId, ...Object.values(data)],
  );
}

// --------------------------------------------------------------------------
// Recipes (recipes)
// --------------------------------------------------------------------------
export async function listRecipes(
  filters: { productVariantId?: string; ingredientId?: string; productId?: string },
  pagination: Paging,
  executor: Exec = db,
) {
  return many(
    executor,
    `SELECT r.product_variant_id, r.ingredient_id, r.quantity_in_base_unit, r.expected_waste_percent,
            i.sku AS ingredient_sku, i.name AS ingredient_name, i.base_unit,
            pv.name AS variant_name, pv.price_idr,
            p.id AS product_id, p.name AS product_name, p.slug AS product_slug
       FROM recipes r
       JOIN ingredients i ON i.id = r.ingredient_id
       JOIN product_variants pv ON pv.id = r.product_variant_id
       JOIN products p ON p.id = pv.product_id
      WHERE ($1::uuid IS NULL OR r.product_variant_id = $1)
        AND ($2::uuid IS NULL OR r.ingredient_id = $2)
        AND ($3::uuid IS NULL OR p.id = $3)
      ORDER BY p.name ASC, pv.name ASC, i.name ASC
      ${paginationSql(pagination)}`,
    [filters.productVariantId ?? null, filters.ingredientId ?? null, filters.productId ?? null],
  );
}

export async function countRecipes(
  filters: { productVariantId?: string; ingredientId?: string; productId?: string },
  executor: Exec = db,
) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int
       FROM recipes r
       JOIN product_variants pv ON pv.id = r.product_variant_id
       JOIN products p ON p.id = pv.product_id
      WHERE ($1::uuid IS NULL OR r.product_variant_id = $1)
        AND ($2::uuid IS NULL OR r.ingredient_id = $2)
        AND ($3::uuid IS NULL OR p.id = $3)`,
    [filters.productVariantId ?? null, filters.ingredientId ?? null, filters.productId ?? null],
  );
  return Number(value ?? 0);
}

/** Replace seluruh bahan untuk satu varian (recipes PK = variant+ingredient). */
export async function replaceRecipeForVariant(
  variantId: string,
  ingredients: Array<{ ingredientId: string; quantityInBaseUnit: number; expectedWastePercent: number }>,
  executor: Exec,
) {
  await executor.query(`DELETE FROM recipes WHERE product_variant_id = $1`, [variantId]);
  for (const item of ingredients) {
    await executor.query(
      `INSERT INTO recipes (product_variant_id, ingredient_id, quantity_in_base_unit, expected_waste_percent)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (product_variant_id, ingredient_id)
       DO UPDATE SET quantity_in_base_unit = EXCLUDED.quantity_in_base_unit,
                     expected_waste_percent = EXCLUDED.expected_waste_percent`,
      [variantId, item.ingredientId, item.quantityInBaseUnit, item.expectedWastePercent],
    );
  }
}

export async function findRecipe(variantId: string, ingredientId: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT product_variant_id, ingredient_id, quantity_in_base_unit, expected_waste_percent
       FROM recipes
      WHERE product_variant_id = $1 AND ingredient_id = $2`,
    [variantId, ingredientId],
  );
}

/** Estimasi HPP satu varian untuk dashboard. */
export async function calculateVariantCost(variantId: string, executor: Exec = db) {
  return one<{ variantId: string; totalCost: number; ingredientCount: number }>(
    executor,
    `SELECT
        r.product_variant_id AS variant_id,
        COALESCE(SUM(r.quantity_in_base_unit * (1 + r.expected_waste_percent / 100)), 0)::numeric AS total_cost,
        COUNT(*)::int AS ingredient_count
       FROM recipes r
      WHERE r.product_variant_id = $1
      GROUP BY r.product_variant_id`,
    [variantId],
  );
}

// --------------------------------------------------------------------------
// Stock locations
// --------------------------------------------------------------------------
export async function listStockLocations(
  filters: { branchId?: string },
  pagination: Paging,
  executor: Exec = db,
) {
  return many(
    executor,
    `SELECT sl.id, sl.branch_id, sl.name,
            b.name AS branch_name, b.code AS branch_code,
            (SELECT COUNT(*)::int FROM inventory_movements im WHERE im.stock_location_id = sl.id) AS movement_count
       FROM stock_locations sl
       JOIN branches b ON b.id = sl.branch_id
      WHERE ($1::uuid IS NULL OR sl.branch_id = $1)
      ORDER BY b.name ASC, sl.name ASC
      ${paginationSql(pagination)}`,
    [filters.branchId ?? null],
  );
}

export async function countStockLocations(filters: { branchId?: string }, executor: Exec = db) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int FROM stock_locations WHERE ($1::uuid IS NULL OR branch_id = $1)`,
    [filters.branchId ?? null],
  );
  return Number(value ?? 0);
}

export async function findStockLocation(stockLocationId: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT sl.id, sl.branch_id, sl.name, b.name AS branch_name
       FROM stock_locations sl
       JOIN branches b ON b.id = sl.branch_id
      WHERE sl.id = $1`,
    [stockLocationId],
  );
}

export async function insertStockLocation(branchId: string, name: string, executor: Exec = db) {
  return one(
    executor,
    `INSERT INTO stock_locations (branch_id, name) VALUES ($1,$2) RETURNING id, branch_id, name`,
    [branchId, name],
  );
}

// --------------------------------------------------------------------------
// Movements
// --------------------------------------------------------------------------
export async function insertMovement(
  input: {
    stockLocationId: string;
    ingredientId: string;
    quantityDelta: number;
    movementType: string;
    referenceType?: string | null;
    referenceId?: string | null;
    notes?: string | null;
    createdBy?: string | null;
  },
  executor: Exec,
) {
  return one(
    executor,
    `INSERT INTO inventory_movements (
        stock_location_id, ingredient_id, quantity_delta, movement_type,
        reference_type, reference_id, notes, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id, stock_location_id, ingredient_id, quantity_delta, movement_type,
               reference_type, reference_id, notes, created_at`,
    [
      input.stockLocationId,
      input.ingredientId,
      input.quantityDelta,
      input.movementType,
      input.referenceType ?? null,
      input.referenceId ?? null,
      input.notes ?? null,
      input.createdBy ?? null,
    ],
  );
}

export async function listMovements(
  filters: { stockLocationId?: string; ingredientId?: string; movementType?: string; branchId?: string; from?: string; to?: string },
  pagination: Paging,
  executor: Exec = db,
) {
  return many(
    executor,
    `SELECT im.id, im.stock_location_id, im.ingredient_id, im.quantity_delta, im.movement_type,
            im.reference_type, im.reference_id, im.notes, im.created_at,
            i.name AS ingredient_name, i.sku AS ingredient_sku, i.base_unit,
            sl.name AS stock_location_name, sl.branch_id,
            b.name AS branch_name,
            u.display_name AS created_by_name,
            running_balance.balance_after
       FROM inventory_movements im
       JOIN ingredients i ON i.id = im.ingredient_id
       JOIN stock_locations sl ON sl.id = im.stock_location_id
       JOIN branches b ON b.id = sl.branch_id
       LEFT JOIN users u ON u.id = im.created_by
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(prev.quantity_delta), 0)::numeric AS balance_after
           FROM inventory_movements prev
          WHERE prev.stock_location_id = im.stock_location_id
            AND prev.ingredient_id = im.ingredient_id
            AND prev.created_at <= im.created_at
       ) running_balance ON true
      WHERE ($1::uuid IS NULL OR im.stock_location_id = $1)
        AND ($2::uuid IS NULL OR im.ingredient_id = $2)
        AND ($3::text IS NULL OR im.movement_type = $3)
        AND ($4::uuid IS NULL OR sl.branch_id = $4)
        AND ($5::timestamptz IS NULL OR im.created_at >= $5::timestamptz)
        AND ($6::timestamptz IS NULL OR im.created_at <= $6::timestamptz)
      ORDER BY im.created_at DESC
      ${paginationSql(pagination)}`,
    [
      filters.stockLocationId ?? null,
      filters.ingredientId ?? null,
      filters.movementType ?? null,
      filters.branchId ?? null,
      filters.from ?? null,
      filters.to ?? null,
    ],
  );
}

export async function countMovements(
  filters: { stockLocationId?: string; ingredientId?: string; movementType?: string; branchId?: string; from?: string; to?: string },
  executor: Exec = db,
) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int
       FROM inventory_movements im
       JOIN stock_locations sl ON sl.id = im.stock_location_id
      WHERE ($1::uuid IS NULL OR im.stock_location_id = $1)
        AND ($2::uuid IS NULL OR im.ingredient_id = $2)
        AND ($3::text IS NULL OR im.movement_type = $3)
        AND ($4::uuid IS NULL OR sl.branch_id = $4)
        AND ($5::timestamptz IS NULL OR im.created_at >= $5::timestamptz)
        AND ($6::timestamptz IS NULL OR im.created_at <= $6::timestamptz)`,
    [
      filters.stockLocationId ?? null,
      filters.ingredientId ?? null,
      filters.movementType ?? null,
      filters.branchId ?? null,
      filters.from ?? null,
      filters.to ?? null,
    ],
  );
  return Number(value ?? 0);
}

/** Saldo terkini per bahan pada satu lokasi (SUM delta, tidak disimpan terpisah). */
export async function getStockOnHand(
  stockLocationId: string,
  ingredientId?: string,
  executor: Exec = db,
) {
  return one<{ ingredientId: string; onHand: number }>(
    executor,
    `SELECT im.ingredient_id, COALESCE(SUM(im.quantity_delta), 0)::numeric AS on_hand
       FROM inventory_movements im
      WHERE im.stock_location_id = $1
        AND ($2::uuid IS NULL OR im.ingredient_id = $2)
      GROUP BY im.ingredient_id`,
    [stockLocationId, ingredientId ?? null],
  );
}

export async function lockIngredient(ingredientId: string, executor: Exec) {
  return one(executor, `SELECT id, name, base_unit, reorder_level FROM ingredients WHERE id = $1 FOR UPDATE`, [
    ingredientId,
  ]);
}