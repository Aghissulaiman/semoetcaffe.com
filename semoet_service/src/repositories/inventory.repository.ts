import { db, many, one, scalar, type Exec } from './base.js';
import { paginationSql, type Paging } from '../utils/pagination.js';

// --------------------------------------------------------------------------
// Ingredients
// --------------------------------------------------------------------------
export async function listIngredients(
  filters: { isActive?: boolean; q?: string; lowStockOnly?: boolean },
  pagination: Paging,
  executor: Exec = db,
) {
  return many(
    executor,
    `SELECT i.id, i.sku, i.name, i.base_unit, i.reorder_level, i.is_active,
            i.supplier_id, i.supplier_contact, i.purchase_link,
            i.last_purchase_price_idr, i.last_purchase_qty, i.last_purchase_uom,
            i.last_yield_amount, i.last_unit_cost_idr,
            i.created_at, i.updated_at, i.created_by, i.updated_by,
            stock.on_hand, stock.last_movement_at,
            s.name AS supplier_name,
            uc.display_name AS created_by_name, uu.display_name AS updated_by_name
       FROM ingredients i
       LEFT JOIN suppliers s ON s.id = i.supplier_id
       LEFT JOIN users uc ON uc.id = i.created_by
       LEFT JOIN users uu ON uu.id = i.updated_by
       LEFT JOIN LATERAL (
         SELECT
           COALESCE(SUM(im.quantity_delta), 0)::numeric AS on_hand,
           MAX(im.created_at) AS last_movement_at
           FROM inventory_movements im
          WHERE im.ingredient_id = i.id
       ) stock ON true
      WHERE ($1::boolean IS NULL OR i.is_active = $1)
        AND ($2::text IS NULL OR i.name ILIKE '%' || $2 || '%' OR i.sku ILIKE '%' || $2 || '%')
        AND ($3::boolean = false OR COALESCE(stock.on_hand, 0) <= i.reorder_level)
      ORDER BY i.name ASC
      ${paginationSql(pagination)}`,
    [filters.isActive ?? null, filters.q ?? null, filters.lowStockOnly ?? false],
  );
}

export async function countIngredients(
  filters: { isActive?: boolean; q?: string; lowStockOnly?: boolean },
  executor: Exec = db,
) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int
       FROM ingredients i
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(im.quantity_delta), 0)::numeric AS on_hand
           FROM inventory_movements im
          WHERE im.ingredient_id = i.id
       ) stock ON true
      WHERE ($1::boolean IS NULL OR i.is_active = $1)
        AND ($2::text IS NULL OR i.name ILIKE '%' || $2 || '%' OR i.sku ILIKE '%' || $2 || '%')
        AND ($3::boolean = false OR COALESCE(stock.on_hand, 0) <= i.reorder_level)`,
    [filters.isActive ?? null, filters.q ?? null, filters.lowStockOnly ?? false],
  );
  return Number(value ?? 0);
}

export async function findIngredientById(ingredientId: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT i.id, i.sku, i.name, i.base_unit, i.reorder_level, i.is_active,
            i.supplier_id, i.supplier_contact, i.purchase_link,
            i.last_purchase_price_idr, i.last_purchase_qty, i.last_purchase_uom,
            i.last_yield_amount, i.last_unit_cost_idr,
            i.created_at, i.updated_at, i.created_by, i.updated_by,
            s.name AS supplier_name,
            uc.display_name AS created_by_name, uu.display_name AS updated_by_name
       FROM ingredients i
       LEFT JOIN suppliers s ON s.id = i.supplier_id
       LEFT JOIN users uc ON uc.id = i.created_by
       LEFT JOIN users uu ON uu.id = i.updated_by
      WHERE i.id = $1`,
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
  input: {
    sku: string;
    name: string;
    baseUnit: string;
    reorderLevel: number;
    isActive: boolean;
    supplierId?: string | null;
    supplierContact?: string | null;
    purchaseLink?: string | null;
    lastPurchasePriceIdr?: number;
    lastPurchaseQty?: number;
    lastPurchaseUom?: string | null;
    lastYieldAmount?: number;
    lastUnitCostIdr?: number;
    createdBy?: string | null;
  },
  executor: Exec = db,
) {
  return one(
    executor,
    `INSERT INTO ingredients (sku, name, base_unit, reorder_level, is_active,
       supplier_id, supplier_contact, purchase_link, last_purchase_price_idr,
       last_purchase_qty, last_purchase_uom, last_yield_amount, last_unit_cost_idr,
       created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)
     RETURNING id, sku, name, base_unit, reorder_level, is_active,
       supplier_id, supplier_contact, purchase_link, last_purchase_price_idr,
       last_purchase_qty, last_purchase_uom, last_yield_amount, last_unit_cost_idr, created_at`,
    [
      input.sku,
      input.name,
      input.baseUnit,
      input.reorderLevel,
      input.isActive,
      input.supplierId ?? null,
      input.supplierContact ?? null,
      input.purchaseLink ?? null,
      input.lastPurchasePriceIdr ?? 0,
      input.lastPurchaseQty ?? 0,
      input.lastPurchaseUom ?? null,
      input.lastYieldAmount ?? 0,
      input.lastUnitCostIdr ?? 0,
      input.createdBy ?? null,
    ],
  );
}

export async function updateIngredient(
  ingredientId: string,
  data: Record<string, unknown>,
  executor: Exec = db,
  updatedBy?: string | null,
) {
  const columns = Object.keys(data);
  if (columns.length === 0 && updatedBy === undefined) return null;
  const sets: string[] = [];
  const values: unknown[] = [ingredientId];
  let idx = 2;
  for (const [col, val] of Object.entries(data)) {
    sets.push(`${col} = $${idx}`);
    values.push(val);
    idx++;
  }
  if (updatedBy !== undefined) {
    sets.push(`updated_by = $${idx}`);
    values.push(updatedBy);
    idx++;
  }
  sets.push(`updated_at = now()`);
  return one(
    executor,
    `UPDATE ingredients SET ${sets.join(', ')} WHERE id = $1 RETURNING id, sku, name, base_unit, reorder_level, is_active, updated_at`,
    values,
  );
}

export async function deleteIngredient(ingredientId: string, executor: Exec = db) {
  return one(
    executor,
    `DELETE FROM ingredients WHERE id = $1 RETURNING id, sku, name, base_unit, reorder_level, is_active, created_at, updated_at`,
    [ingredientId],
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
export async function listStockLocations(pagination: Paging, executor: Exec = db) {
  return many(
    executor,
    `SELECT sl.id, sl.name,
            (SELECT COUNT(*)::int FROM inventory_movements im WHERE im.stock_location_id = sl.id) AS movement_count
       FROM stock_locations sl
      ORDER BY sl.name ASC
      ${paginationSql(pagination)}`,
    [],
  );
}

export async function countStockLocations(executor: Exec = db) {
  const value = await scalar<number>(executor, `SELECT COUNT(*)::int FROM stock_locations`, []);
  return Number(value ?? 0);
}

export async function findStockLocation(stockLocationId: string, executor: Exec = db) {
  return one(
    executor,
    `SELECT sl.id, sl.name
       FROM stock_locations sl
      WHERE sl.id = $1`,
    [stockLocationId],
  );
}

export async function insertStockLocation(name: string, executor: Exec = db) {
  return one(
    executor,
    `INSERT INTO stock_locations (name) VALUES ($1) RETURNING id, name`,
    [name],
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
    movementDate?: string | null;
    createdBy?: string | null;
  },
  executor: Exec,
) {
  return one(
    executor,
    `INSERT INTO inventory_movements (
        stock_location_id, ingredient_id, quantity_delta, movement_type,
        reference_type, reference_id, notes, movement_date, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8::date, CURRENT_DATE),$9)
     RETURNING id, stock_location_id, ingredient_id, quantity_delta, movement_type,
               reference_type, reference_id, notes, movement_date, created_at`,
    [
      input.stockLocationId,
      input.ingredientId,
      input.quantityDelta,
      input.movementType,
      input.referenceType ?? null,
      input.referenceId ?? null,
      input.notes ?? null,
      input.movementDate ?? null,
      input.createdBy ?? null,
    ],
  );
}

export async function listMovements(
  filters: { stockLocationId?: string; ingredientId?: string; movementType?: string; from?: string; to?: string },
  pagination: Paging,
  executor: Exec = db,
) {
  return many(
    executor,
    `SELECT im.id, im.stock_location_id, im.ingredient_id, im.quantity_delta, im.movement_type,
            im.reference_type, im.reference_id, im.notes, im.movement_date, im.created_at,
            i.name AS ingredient_name, i.sku AS ingredient_sku, i.base_unit,
            sl.name AS stock_location_name,
            u.display_name AS created_by_name,
            running_balance.balance_after
       FROM inventory_movements im
       JOIN ingredients i ON i.id = im.ingredient_id
       JOIN stock_locations sl ON sl.id = im.stock_location_id
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
        AND ($4::date IS NULL OR im.movement_date >= $4::date)
        AND ($5::date IS NULL OR im.movement_date <= $5::date)
      ORDER BY im.movement_date DESC, im.created_at DESC
      ${paginationSql(pagination)}`,
    [
      filters.stockLocationId ?? null,
      filters.ingredientId ?? null,
      filters.movementType ?? null,
      filters.from ?? null,
      filters.to ?? null,
    ],
  );
}

export async function countMovements(
  filters: { stockLocationId?: string; ingredientId?: string; movementType?: string; from?: string; to?: string },
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
        AND ($4::date IS NULL OR im.movement_date >= $4::date)
        AND ($5::date IS NULL OR im.movement_date <= $5::date)`,
    [
      filters.stockLocationId ?? null,
      filters.ingredientId ?? null,
      filters.movementType ?? null,
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

// --------------------------------------------------------------------------
// Stock out documents (transfer gudang → outlet)
// --------------------------------------------------------------------------
type InventoryDocumentSequence = 'stock_out_number_seq' | 'stock_opname_number_seq';

/** Nomor dokumen: prefix + YYMMDD + urutan 6 digit (mis. SK261102000001). */
export async function nextInventoryDocumentNumber(
  sequence: InventoryDocumentSequence,
  prefix: 'SK' | 'OP',
  executor: Exec = db,
) {
  return scalar<string>(
    executor,
    `SELECT $1 || to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYMMDD') ||
            lpad(nextval($2::regclass)::text, 6, '0')`,
    [prefix, sequence],
  );
}

const STOCK_OUT_SELECT = `
  SELECT d.id, d.number,
         d.from_stock_location_id, fl.name AS from_location_name,
         d.to_stock_location_id, tl.name AS to_location_name,
         d.status, d.transfer_date, d.notes, d.cancel_reason,
         d.posted_at, d.posted_by, pu.display_name AS posted_by_name,
         d.created_by, cu.display_name AS created_by_name,
         d.created_at, d.updated_at,
         COALESCE(items.item_count, 0) AS item_count,
         COALESCE(items.total_quantity, 0) AS total_quantity
    FROM stock_out_documents d
    JOIN stock_locations fl ON fl.id = d.from_stock_location_id
    JOIN stock_locations tl ON tl.id = d.to_stock_location_id
    LEFT JOIN users pu ON pu.id = d.posted_by
    LEFT JOIN users cu ON cu.id = d.created_by
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS item_count, COALESCE(SUM(soi.quantity), 0) AS total_quantity
        FROM stock_out_items soi
       WHERE soi.stock_out_id = d.id
    ) items ON true
`;

export async function listStockOutDocuments(
  filters: {
    q?: string;
    status?: string;
    fromStockLocationId?: string;
    toStockLocationId?: string;
    from?: string;
    to?: string;
  },
  pagination: Paging,
  executor: Exec = db,
) {
  return many(
    executor,
    `${STOCK_OUT_SELECT}
      WHERE ($1::text IS NULL OR d.number ILIKE '%' || $1 || '%'
             OR COALESCE(d.notes, '') ILIKE '%' || $1 || '%'
             OR fl.name ILIKE '%' || $1 || '%' OR tl.name ILIKE '%' || $1 || '%')
        AND ($2::text IS NULL OR d.status = $2)
        AND ($3::uuid IS NULL OR d.from_stock_location_id = $3)
        AND ($4::uuid IS NULL OR d.to_stock_location_id = $4)
        AND ($5::date IS NULL OR d.transfer_date >= $5::date)
        AND ($6::date IS NULL OR d.transfer_date <= $6::date)
      ORDER BY d.transfer_date DESC, d.created_at DESC
      ${paginationSql(pagination)}`,
    [
      filters.q ?? null,
      filters.status ?? null,
      filters.fromStockLocationId ?? null,
      filters.toStockLocationId ?? null,
      filters.from ?? null,
      filters.to ?? null,
    ],
  );
}

export async function countStockOutDocuments(
  filters: {
    q?: string;
    status?: string;
    fromStockLocationId?: string;
    toStockLocationId?: string;
    from?: string;
    to?: string;
  },
  executor: Exec = db,
) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int
       FROM stock_out_documents d
       JOIN stock_locations fl ON fl.id = d.from_stock_location_id
       JOIN stock_locations tl ON tl.id = d.to_stock_location_id
      WHERE ($1::text IS NULL OR d.number ILIKE '%' || $1 || '%'
             OR COALESCE(d.notes, '') ILIKE '%' || $1 || '%'
             OR fl.name ILIKE '%' || $1 || '%' OR tl.name ILIKE '%' || $1 || '%')
        AND ($2::text IS NULL OR d.status = $2)
        AND ($3::uuid IS NULL OR d.from_stock_location_id = $3)
        AND ($4::uuid IS NULL OR d.to_stock_location_id = $4)
        AND ($5::date IS NULL OR d.transfer_date >= $5::date)
        AND ($6::date IS NULL OR d.transfer_date <= $6::date)`,
    [
      filters.q ?? null,
      filters.status ?? null,
      filters.fromStockLocationId ?? null,
      filters.toStockLocationId ?? null,
      filters.from ?? null,
      filters.to ?? null,
    ],
  );
  return Number(value ?? 0);
}

export async function findStockOutDocument(stockOutId: string, executor: Exec = db) {
  return one(executor, `${STOCK_OUT_SELECT} WHERE d.id = $1`, [stockOutId]);
}

export async function lockStockOutDocument(stockOutId: string, executor: Exec) {
  return one(
    executor,
    `SELECT id, number, from_stock_location_id, to_stock_location_id, status,
            transfer_date, notes, cancel_reason, posted_at, posted_by, created_by
       FROM stock_out_documents WHERE id = $1 FOR UPDATE`,
    [stockOutId],
  );
}

export async function insertStockOutDocument(
  input: {
    number: string;
    fromStockLocationId: string;
    toStockLocationId: string;
    transferDate?: string | null;
    notes?: string | null;
    status: string;
    createdBy: string | null;
  },
  executor: Exec,
) {
  return one(
    executor,
    `INSERT INTO stock_out_documents (
        number, from_stock_location_id, to_stock_location_id, status,
        transfer_date, notes, created_by
     ) VALUES ($1,$2,$3,$4,COALESCE($5::date, CURRENT_DATE),$6,$7)
     RETURNING id, number, from_stock_location_id, to_stock_location_id, status,
               transfer_date, notes, created_at, updated_at`,
    [
      input.number,
      input.fromStockLocationId,
      input.toStockLocationId,
      input.status,
      input.transferDate ?? null,
      input.notes ?? null,
      input.createdBy,
    ],
  );
}

export async function updateStockOutDocument(
  stockOutId: string,
  data: Record<string, unknown>,
  executor: Exec,
) {
  const columns = Object.keys(data);
  if (columns.length === 0) return null;
  const assignments = columns.map((column, index) => `${column} = $${index + 2}`).join(', ');
  return one(
    executor,
    `UPDATE stock_out_documents SET ${assignments}, updated_at = now()
      WHERE id = $1
      RETURNING id, number, from_stock_location_id, to_stock_location_id, status,
                transfer_date, notes, cancel_reason, posted_at, posted_by, created_at, updated_at`,
    [stockOutId, ...Object.values(data)],
  );
}

export async function deleteStockOutDocument(stockOutId: string, executor: Exec) {
  return one(
    executor,
    `DELETE FROM stock_out_documents WHERE id = $1 RETURNING id, number, status`,
    [stockOutId],
  );
}

export async function listStockOutItems(stockOutId: string, executor: Exec = db) {
  return many(
    executor,
    `SELECT soi.id, soi.stock_out_id, soi.ingredient_id,
            i.sku AS ingredient_sku, i.name AS ingredient_name, i.base_unit,
            soi.quantity, soi.notes, soi.sort_order, soi.created_at
       FROM stock_out_items soi
       JOIN ingredients i ON i.id = soi.ingredient_id
      WHERE soi.stock_out_id = $1
      ORDER BY soi.sort_order ASC, soi.created_at ASC`,
    [stockOutId],
  );
}

export async function replaceStockOutItems(
  stockOutId: string,
  items: Array<{ ingredientId: string; quantity: number; notes?: string | null }>,
  executor: Exec,
) {
  await executor.query(`DELETE FROM stock_out_items WHERE stock_out_id = $1`, [stockOutId]);
  for (const [index, item] of items.entries()) {
    await executor.query(
      `INSERT INTO stock_out_items (stock_out_id, ingredient_id, quantity, notes, sort_order)
       VALUES ($1,$2,$3,$4,$5)`,
      [stockOutId, item.ingredientId, item.quantity, item.notes ?? null, index],
    );
  }
}

export async function deleteStockOutItems(stockOutId: string, executor: Exec) {
  await executor.query(`DELETE FROM stock_out_items WHERE stock_out_id = $1`, [stockOutId]);
}

// --------------------------------------------------------------------------
// Stock opname documents
// --------------------------------------------------------------------------
const STOCK_OPNAME_SELECT = `
  SELECT d.id, d.number, d.stock_location_id,
         sl.name AS stock_location_name,
         d.status, d.opname_date, d.notes, d.cancel_reason,
         d.posted_at, d.posted_by, pu.display_name AS posted_by_name,
         d.created_by, cu.display_name AS created_by_name,
         d.created_at, d.updated_at,
         COALESCE(items.item_count, 0) AS item_count,
         COALESCE(items.surplus_count, 0) AS surplus_count,
         COALESCE(items.defect_count, 0) AS defect_count,
         COALESCE(items.total_difference, 0) AS total_difference
    FROM stock_opname_documents d
    JOIN stock_locations sl ON sl.id = d.stock_location_id
    LEFT JOIN users pu ON pu.id = d.posted_by
    LEFT JOIN users cu ON cu.id = d.created_by
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS item_count,
             COUNT(*) FILTER (WHERE soi.difference_quantity > 0)::int AS surplus_count,
             COUNT(*) FILTER (WHERE soi.difference_quantity < 0)::int AS defect_count,
             COALESCE(SUM(soi.difference_quantity), 0) AS total_difference
        FROM stock_opname_items soi
       WHERE soi.stock_opname_id = d.id
    ) items ON true
`;

export async function listStockOpnameDocuments(
  filters: {
    q?: string;
    status?: string;
    stockLocationId?: string;
    from?: string;
    to?: string;
  },
  pagination: Paging,
  executor: Exec = db,
) {
  return many(
    executor,
    `${STOCK_OPNAME_SELECT}
      WHERE ($1::text IS NULL OR d.number ILIKE '%' || $1 || '%'
             OR COALESCE(d.notes, '') ILIKE '%' || $1 || '%'
             OR sl.name ILIKE '%' || $1 || '%')
        AND ($2::text IS NULL OR d.status = $2)
        AND ($3::uuid IS NULL OR d.stock_location_id = $3)
        AND ($4::date IS NULL OR d.opname_date >= $4::date)
        AND ($5::date IS NULL OR d.opname_date <= $5::date)
      ORDER BY d.opname_date DESC, d.created_at DESC
      ${paginationSql(pagination)}`,
    [
      filters.q ?? null,
      filters.status ?? null,
      filters.stockLocationId ?? null,
      filters.from ?? null,
      filters.to ?? null,
    ],
  );
}

export async function countStockOpnameDocuments(
  filters: {
    q?: string;
    status?: string;
    stockLocationId?: string;
    from?: string;
    to?: string;
  },
  executor: Exec = db,
) {
  const value = await scalar<number>(
    executor,
    `SELECT COUNT(*)::int
       FROM stock_opname_documents d
       JOIN stock_locations sl ON sl.id = d.stock_location_id
      WHERE ($1::text IS NULL OR d.number ILIKE '%' || $1 || '%'
             OR COALESCE(d.notes, '') ILIKE '%' || $1 || '%'
             OR sl.name ILIKE '%' || $1 || '%')
        AND ($2::text IS NULL OR d.status = $2)
        AND ($3::uuid IS NULL OR d.stock_location_id = $3)
        AND ($4::date IS NULL OR d.opname_date >= $4::date)
        AND ($5::date IS NULL OR d.opname_date <= $5::date)`,
    [
      filters.q ?? null,
      filters.status ?? null,
      filters.stockLocationId ?? null,
      filters.from ?? null,
      filters.to ?? null,
    ],
  );
  return Number(value ?? 0);
}

export async function findStockOpnameDocument(stockOpnameId: string, executor: Exec = db) {
  return one(executor, `${STOCK_OPNAME_SELECT} WHERE d.id = $1`, [stockOpnameId]);
}

export async function lockStockOpnameDocument(stockOpnameId: string, executor: Exec) {
  return one(
    executor,
    `SELECT id, number, stock_location_id, status, opname_date, notes,
            cancel_reason, posted_at, posted_by, created_by
       FROM stock_opname_documents WHERE id = $1 FOR UPDATE`,
    [stockOpnameId],
  );
}

export async function insertStockOpnameDocument(
  input: {
    number: string;
    stockLocationId: string;
    opnameDate?: string | null;
    notes?: string | null;
    status: string;
    createdBy: string | null;
  },
  executor: Exec,
) {
  return one(
    executor,
    `INSERT INTO stock_opname_documents (
        number, stock_location_id, status, opname_date, notes, created_by
     ) VALUES ($1,$2,$3,COALESCE($4::date, CURRENT_DATE),$5,$6)
     RETURNING id, number, stock_location_id, status, opname_date, notes, created_at, updated_at`,
    [
      input.number,
      input.stockLocationId,
      input.status,
      input.opnameDate ?? null,
      input.notes ?? null,
      input.createdBy,
    ],
  );
}

export async function updateStockOpnameDocument(
  stockOpnameId: string,
  data: Record<string, unknown>,
  executor: Exec,
) {
  const columns = Object.keys(data);
  if (columns.length === 0) return null;
  const assignments = columns.map((column, index) => `${column} = $${index + 2}`).join(', ');
  return one(
    executor,
    `UPDATE stock_opname_documents SET ${assignments}, updated_at = now()
      WHERE id = $1
      RETURNING id, number, stock_location_id, status, opname_date, notes,
                cancel_reason, posted_at, posted_by, created_at, updated_at`,
    [stockOpnameId, ...Object.values(data)],
  );
}

export async function deleteStockOpnameDocument(stockOpnameId: string, executor: Exec) {
  return one(
    executor,
    `DELETE FROM stock_opname_documents WHERE id = $1 RETURNING id, number, status`,
    [stockOpnameId],
  );
}

export async function listStockOpnameItems(stockOpnameId: string, executor: Exec = db) {
  return many(
    executor,
    `SELECT soi.id, soi.stock_opname_id, soi.ingredient_id,
            i.sku AS ingredient_sku, i.name AS ingredient_name, i.base_unit,
            soi.system_quantity, soi.counted_quantity, soi.difference_quantity,
            soi.notes, soi.sort_order, soi.created_at
       FROM stock_opname_items soi
       JOIN ingredients i ON i.id = soi.ingredient_id
      WHERE soi.stock_opname_id = $1
      ORDER BY soi.sort_order ASC, soi.created_at ASC`,
    [stockOpnameId],
  );
}

export async function replaceStockOpnameItems(
  stockOpnameId: string,
  items: Array<{
    ingredientId: string;
    systemQuantity: number;
    countedQuantity: number;
    differenceQuantity: number;
    notes?: string | null;
  }>,
  executor: Exec,
) {
  await executor.query(`DELETE FROM stock_opname_items WHERE stock_opname_id = $1`, [stockOpnameId]);
  for (const [index, item] of items.entries()) {
    await executor.query(
      `INSERT INTO stock_opname_items (
          stock_opname_id, ingredient_id, system_quantity, counted_quantity,
          difference_quantity, notes, sort_order
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        stockOpnameId,
        item.ingredientId,
        item.systemQuantity,
        item.countedQuantity,
        item.differenceQuantity,
        item.notes ?? null,
        index,
      ],
    );
  }
}

export async function updateStockOpnameItemSnapshot(
  itemId: string,
  systemQuantity: number,
  differenceQuantity: number,
  executor: Exec,
) {
  await executor.query(
    `UPDATE stock_opname_items
        SET system_quantity = $2, difference_quantity = $3
      WHERE id = $1`,
    [itemId, systemQuantity, differenceQuantity],
  );
}

// --------------------------------------------------------------------------
// Stock summary (rekap masuk/keluar/penjualan per bahan)
// --------------------------------------------------------------------------
export async function stockSummary(
  filters: {
    stockLocationId?: string;
    from: string;
    to: string;
  },
  executor: Exec = db,
) {
  return many(
    executor,
    `SELECT i.id AS ingredient_id, i.sku, i.name, i.base_unit, i.reorder_level,
            COALESCE(SUM(im.quantity_delta) FILTER (WHERE im.movement_date < $2::date), 0) AS opening_stock,
            COALESCE(SUM(im.quantity_delta) FILTER (
              WHERE im.movement_date >= $2::date AND im.movement_date <= $3::date
                AND im.movement_type IN ('purchase','transfer_in')
            ), 0) AS total_in,
            COALESCE(SUM(-im.quantity_delta) FILTER (
              WHERE im.movement_date >= $2::date AND im.movement_date <= $3::date
                AND im.movement_type = 'transfer_out'
            ), 0) AS total_out,
            COALESCE(SUM(-im.quantity_delta) FILTER (
              WHERE im.movement_date >= $2::date AND im.movement_date <= $3::date
                AND im.movement_type = 'order_consumption'
            ), 0) AS total_sales,
            COALESCE(SUM(-im.quantity_delta) FILTER (
              WHERE im.movement_date >= $2::date AND im.movement_date <= $3::date
                AND im.movement_type = 'waste'
            ), 0) AS total_waste,
            COALESCE(SUM(im.quantity_delta) FILTER (
              WHERE im.movement_date >= $2::date AND im.movement_date <= $3::date
                AND im.movement_type = 'adjustment'
            ), 0) AS total_adjustment,
            COALESCE(SUM(im.quantity_delta) FILTER (WHERE im.movement_date <= $3::date), 0) AS closing_stock
       FROM ingredients i
       LEFT JOIN inventory_movements im ON im.ingredient_id = i.id
       LEFT JOIN stock_locations sl ON sl.id = im.stock_location_id
      WHERE ($1::uuid IS NULL OR im.stock_location_id = $1)
      GROUP BY i.id, i.sku, i.name, i.base_unit, i.reorder_level
      ORDER BY i.name ASC`,
    [filters.stockLocationId ?? null, filters.from, filters.to],
  );
}
