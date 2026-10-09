import type { z } from 'zod';
import { withTransaction, type TransactionClient } from '../config/database.js';
import type { MovementType } from '../config/constants.js';
import { badRequest, conflict, notFound, unprocessable } from '../errors/AppError.js';
import * as branchRepo from '../repositories/branch.repository.js';
import * as catalogRepo from '../repositories/catalog.repository.js';
import * as inventoryRepo from '../repositories/inventory.repository.js';
import { roundIdr } from '../utils/money.js';
import {
  buildPaginationMeta,
  parsePagination,
  MAX_LIMIT,
  type Pagination,
} from '../utils/pagination.js';
import { bool, iso, num, str, strOrNull } from '../utils/serialize.js';
import {
  createStockLocationSchema,
  listStockLocationQuerySchema,
  stockSnapshotQuerySchema,
  type CreateIngredientInput,
  type CreateMovementInput,
  type ListIngredientQuery,
  type ListMovementQuery,
  type ListRecipeQuery,
  type UpdateIngredientInput,
  type UpsertRecipeInput,
} from '../validators/inventory.validator.js';

/** Tipe query yang belum diekspor sebagai alias di validator. */
export type ListStockLocationQuery = z.infer<typeof listStockLocationQuerySchema>;
export type CreateStockLocationInput = z.infer<typeof createStockLocationSchema>;
export type StockSnapshotQuery = z.infer<typeof stockSnapshotQuerySchema>;

export interface Paginated<T> {
  items: T[];
  meta: ReturnType<typeof buildPaginationMeta>;
}

/** Mutasi yang menambah stok. */
const STOCK_IN_TYPES: MovementType[] = ['purchase', 'transfer_in'];
/** Mutasi yang selalu mengurangi stok. */
const STOCK_OUT_TYPES: MovementType[] = ['order_consumption', 'waste', 'transfer_out'];
/** Jumlah bahan yang boleh dipakai satu recipe. */
const MAX_RECIPE_ITEMS = 50;

// --------------------------------------------------------------------------
// Helper shaping
// --------------------------------------------------------------------------
/** Rapi spasi ganda agar nama/SKU konsisten di database. */
function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function shapeIngredient(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    sku: str(row.sku),
    name: str(row.name),
    baseUnit: str(row.baseUnit),
    reorderLevel: num(row.reorderLevel),
    isActive: bool(row.isActive, true),
    onHand: row.onHand === undefined ? null : num(row.onHand),
    lastMovementAt: iso(row.lastMovementAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function shapeRecipe(row: Record<string, unknown>) {
  return {
    productVariantId: str(row.productVariantId),
    ingredientId: str(row.ingredientId),
    ingredientSku: str(row.ingredientSku),
    ingredientName: str(row.ingredientName),
    baseUnit: str(row.baseUnit),
    quantityInBaseUnit: num(row.quantityInBaseUnit),
    expectedWastePercent: num(row.expectedWastePercent),
    productId: str(row.productId),
    productName: str(row.productName),
    productSlug: str(row.productSlug),
    variantName: str(row.variantName),
    variantPriceIdr: num(row.priceIdr),
  };
}

function shapeStockLocation(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    branchId: str(row.branchId),
    branchName: strOrNull(row.branchName),
    name: str(row.name),
    movementCount: num(row.movementCount),
  };
}

function shapeMovement(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    stockLocationId: str(row.stockLocationId),
    stockLocationName: strOrNull(row.stockLocationName),
    branchId: strOrNull(row.branchId),
    branchName: strOrNull(row.branchName),
    ingredientId: str(row.ingredientId),
    ingredientSku: strOrNull(row.ingredientSku),
    ingredientName: strOrNull(row.ingredientName),
    baseUnit: strOrNull(row.baseUnit),
    quantityDelta: num(row.quantityDelta),
    movementType: str(row.movementType),
    referenceType: strOrNull(row.referenceType),
    referenceId: strOrNull(row.referenceId),
    notes: strOrNull(row.notes),
    createdByName: strOrNull(row.createdByName),
    balanceAfter: num(row.balanceAfter),
    createdAt: iso(row.createdAt),
  };
}

/** Ambil semua baris dengan berpage karena repository membatasi limit per query. */
async function collectAll<T>(
  fetchPage: (paging: { limit: number; offset: number }) => Promise<T[]>,
  countTotal: () => Promise<number>,
): Promise<T[]> {
  const total = await countTotal();
  const rows: T[] = [];
  let page = 1;

  while (rows.length < total) {
    const paging = parsePagination({ page, limit: MAX_LIMIT });
    const batch = await fetchPage(paging);
    if (batch.length === 0) break;
    rows.push(...batch);
    page += 1;
  }

  return rows;
}

// --------------------------------------------------------------------------
// GET /admin/ingredients
// --------------------------------------------------------------------------
export async function listIngredients(query: ListIngredientQuery): Promise<Paginated<unknown>> {
  const paging = parsePagination(query);
  const filters = {
    isActive: query.isActive,
    q: query.q,
    // Repository memakai filter lowStockOnly sebagai boolean wajib, jadi
    // undefined harus dinormalkan supaya tidak menjadi NULL di SQL.
    lowStockOnly: query.lowStockOnly ?? false,
    branchId: query.branchId,
  };

  const rows = await inventoryRepo.listIngredients(filters, paging);
  const total = await inventoryRepo.countIngredients(filters);

  const pagination: Pagination = { page: paging.page, limit: paging.limit, offset: paging.offset, total };
  return { items: rows.map(shapeIngredient), meta: buildPaginationMeta(pagination) };
}

// --------------------------------------------------------------------------
// GET /admin/ingredients/:id
// --------------------------------------------------------------------------
export async function ingredientDetail(ingredientId: string) {
  const ingredient = await inventoryRepo.findIngredientById(ingredientId);
  if (!ingredient) throw notFound('Bahan baku', ingredientId);

  const [usageCount, usages] = await Promise.all([
    inventoryRepo.countRecipes({ ingredientId }),
    inventoryRepo.listRecipes({ ingredientId }, parsePagination({ limit: MAX_LIMIT })),
  ]);

  const detail = shapeIngredient(ingredient);
  const onHand = detail.onHand ?? 0;

  return {
    ingredient: detail,
    lowStock: onHand <= detail.reorderLevel,
    usageCount,
    usedByVariants: usages.map(shapeRecipe),
  };
}

// --------------------------------------------------------------------------
// POST /admin/ingredients
// --------------------------------------------------------------------------
export async function createIngredient(input: CreateIngredientInput) {
  const sku = input.sku.trim().toUpperCase();
  const name = normalizeText(input.name);

  return withTransaction(async (tx) => {
    // Pengecekan di dalam transaksi supaya dua request bersamaan tetap aman;
    // constraint UNIQUE di database tetap menjadi jaring pengaman terakhir.
    const duplicate = await inventoryRepo.findIngredientBySku(sku, tx);
    if (duplicate) throw conflict(`SKU '${sku}' sudah dipakai bahan lain`);

    const row = await inventoryRepo.insertIngredient(
      {
        sku,
        name,
        baseUnit: normalizeText(input.baseUnit),
        reorderLevel: num(input.reorderLevel),
        isActive: bool(input.isActive, true),
      },
      tx,
    );

    if (!row) throw unprocessable('Bahan baku gagal disimpan, coba lagi');
    return shapeIngredient(row);
  });
}

// --------------------------------------------------------------------------
// PATCH /admin/ingredients/:id
// --------------------------------------------------------------------------
export async function updateIngredient(ingredientId: string, input: UpdateIngredientInput) {
  // KolomRepository updateIngredient memakai nama kolom PostgreSQL langsung.
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = normalizeText(input.name);
  if (input.baseUnit !== undefined) data.base_unit = normalizeText(input.baseUnit);
  if (input.reorderLevel !== undefined) data.reorder_level = num(input.reorderLevel);
  if (input.isActive !== undefined) data.is_active = input.isActive;

  return withTransaction(async (tx) => {
    const current = await inventoryRepo.findIngredientById(ingredientId, tx);
    if (!current) throw notFound('Bahan baku', ingredientId);

    const updated = await inventoryRepo.updateIngredient(ingredientId, data, tx);
    if (!updated) throw notFound('Bahan baku', ingredientId);

    return shapeIngredient(updated);
  });
}

// --------------------------------------------------------------------------
// GET /admin/recipes
// --------------------------------------------------------------------------
export async function listRecipes(query: ListRecipeQuery): Promise<Paginated<unknown>> {
  const paging = parsePagination(query);
  const filters = {
    productVariantId: query.productVariantId,
    ingredientId: query.ingredientId,
    productId: query.productId,
  };

  const rows = await inventoryRepo.listRecipes(filters, paging);
  const total = await inventoryRepo.countRecipes(filters);

  const pagination: Pagination = { page: paging.page, limit: paging.limit, offset: paging.offset, total };
  return { items: rows.map(shapeRecipe), meta: buildPaginationMeta(pagination) };
}

// --------------------------------------------------------------------------
// PUT /admin/recipes
// --------------------------------------------------------------------------
export async function saveRecipe(input: UpsertRecipeInput) {
  if (input.ingredients.length > MAX_RECIPE_ITEMS) {
    throw unprocessable(`Resep maksimal berisi ${MAX_RECIPE_ITEMS} bahan`);
  }

  return withTransaction(async (tx) => {
    // Lock varian supaya dua simpan.recipe bersamaan tidak saling menimpa.
    const variant = (await catalogRepo.lockProductVariant(input.productVariantId, tx)) as unknown as
      | Record<string, unknown>
      | null;
    if (!variant) throw notFound('Varian produk', input.productVariantId);

    const items = await resolveRecipeItems(input, tx);

    // Delete-then-insert dalam satu transaksi: recipe jadi utuh atau tidak sama sekali.
    await inventoryRepo.replaceRecipeForVariant(input.productVariantId, items, tx);

    const saved = await inventoryRepo.listRecipes(
      { productVariantId: input.productVariantId },
      { limit: items.length, offset: 0 },
    );

    const cost = (await inventoryRepo.calculateVariantCost(input.productVariantId, tx)) as unknown as
      | Record<string, unknown>
      | null;

    return {
      productVariantId: input.productVariantId,
      productId: strOrNull(variant.productId ?? variant.product_id),
      productName: strOrNull(variant.productName ?? variant.product_name),
      variantName: strOrNull(variant.variantName ?? variant.variant_name),
      items: saved.map(shapeRecipe),
      ingredientCount: items.length,
      costPerUnitIdr: cost ? roundIdr(num(cost.totalCost ?? cost.total_cost)) : null,
    };
  });
}

/** Pastikan bahan ada, kuantitas positif, dan tidak ada bahan dobel. */
async function resolveRecipeItems(
  input: UpsertRecipeInput,
  tx: TransactionClient,
): Promise<Array<{ ingredientId: string; quantityInBaseUnit: number; expectedWastePercent: number }>> {
  const items: Array<{
    ingredientId: string;
    quantityInBaseUnit: number;
    expectedWastePercent: number;
  }> = [];
  const seen = new Set<string>();

  for (const item of input.ingredients) {
    const quantity = Number(item.quantityInBaseUnit);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw unprocessable(`Kuantitas bahan '${item.ingredientId}' harus lebih dari 0`);
    }
    if (seen.has(item.ingredientId)) {
      throw unprocessable('Resep tidak boleh memuat bahan yang sama lebih dari sekali');
    }
    seen.add(item.ingredientId);

    const ingredient = await inventoryRepo.findIngredientById(item.ingredientId, tx);
    if (!ingredient) throw notFound('Bahan baku', item.ingredientId);

    items.push({
      ingredientId: item.ingredientId,
      quantityInBaseUnit: quantity,
      expectedWastePercent: num(item.expectedWastePercent),
    });
  }

  return items;
}

// --------------------------------------------------------------------------
// GET /admin/stock-locations
// --------------------------------------------------------------------------
export async function listStockLocations(query: ListStockLocationQuery): Promise<Paginated<unknown>> {
  const paging = parsePagination(query);
  const filters = { branchId: query.branchId };

  const rows = await inventoryRepo.listStockLocations(filters, paging);
  const total = await inventoryRepo.countStockLocations(filters);

  const pagination: Pagination = { page: paging.page, limit: paging.limit, offset: paging.offset, total };
  return { items: rows.map(shapeStockLocation), meta: buildPaginationMeta(pagination) };
}

// --------------------------------------------------------------------------
// POST /admin/stock-locations
// --------------------------------------------------------------------------
export async function createStockLocation(input: CreateStockLocationInput) {
  const name = normalizeText(input.name);

  return withTransaction(async (tx) => {
    const branchExists = await branchRepo.branchExists(input.branchId, tx);
    if (!branchExists) throw notFound('Cabang', input.branchId);

    const existing = await inventoryRepo.listStockLocations(
      { branchId: input.branchId },
      parsePagination({ limit: MAX_LIMIT }),
    );
    const duplikat = existing.find(
      (row) => normalizeText(str(row.name)).toLowerCase() === name.toLowerCase(),
    );
    if (duplikat) throw conflict(`Lokasi stok '${name}' sudah ada di cabang ini`);

    const row = await inventoryRepo.insertStockLocation(input.branchId, name, tx);
    if (!row) throw unprocessable('Lokasi stok gagal disimpan, coba lagi');

    return shapeStockLocation(row);
  });
}

// --------------------------------------------------------------------------
// GET /admin/stock/movements
// --------------------------------------------------------------------------
export async function listMovements(query: ListMovementQuery): Promise<Paginated<unknown>> {
  const paging = parsePagination(query);
  const filters = {
    stockLocationId: query.stockLocationId,
    ingredientId: query.ingredientId,
    movementType: query.movementType,
    branchId: query.branchId,
    from: query.from,
    to: query.to,
  };

  const rows = await inventoryRepo.listMovements(filters, paging);
  const total = await inventoryRepo.countMovements(filters);

  const pagination: Pagination = { page: paging.page, limit: paging.limit, offset: paging.offset, total };
  return { items: rows.map(shapeMovement), meta: buildPaginationMeta(pagination) };
}

// --------------------------------------------------------------------------
// POST /admin/stock/movements
// --------------------------------------------------------------------------
export async function createMovement(actorUserId: string, input: CreateMovementInput) {
  const stockLocation = await inventoryRepo.findStockLocation(input.stockLocationId);
  if (!stockLocation) throw notFound('Lokasi stok', input.stockLocationId);

  return withTransaction(async (tx) => {
    // Advisory lock per bahan mencegah dua mutasi paralel kehilangan perubahan,
    // lock baris ingredient membuat stok tidak berubah di tengah perhitungan.
    await tx.advisoryLock(`inventory:movement:${input.ingredientId}`);
    const ingredient = await inventoryRepo.lockIngredient(input.ingredientId, tx);
    if (!ingredient) throw notFound('Bahan baku', input.ingredientId);

    const quantityDelta = resolveQuantityDelta(
      input.movementType as MovementType,
      Number(input.quantityDelta),
    );

    const current = await currentBalance(input.stockLocationId, input.ingredientId, tx);
    const nextBalance = Math.round((current + quantityDelta) * 1000) / 1000;

    if (nextBalance < 0) {
      throw unprocessable('Stok tidak cukup', [
        {
          field: 'quantityDelta',
          message: `Stok ${str(ingredient.name)} tersedia ${current}, permintaan ${Math.abs(quantityDelta)}`,
        },
      ]);
    }

    const row = await inventoryRepo.insertMovement(
      {
        stockLocationId: input.stockLocationId,
        ingredientId: input.ingredientId,
        quantityDelta,
        movementType: input.movementType,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
        notes: input.notes ?? null,
        createdBy: actorUserId,
      },
      tx,
    );

    return {
      movement: shapeMovement({
        ...(row ?? {}),
        stockLocationName: str(stockLocation.name),
        branchId: strOrNull(stockLocation.branchId),
        branchName: strOrNull(stockLocation.branchName),
        ingredientName: str(ingredient.name),
        baseUnit: str(ingredient.baseUnit),
        balanceAfter: nextBalance,
      }),
      stockOnHand: nextBalance,
      stockLocation: shapeStockLocation(stockLocation),
    };
  });
}

/**
 * Tentukan arah delta dari jenis mutasi. Pembelian dan transfer masuk selalu
 * menambah, pemakaian/waste/transfer keluar selalu mengurangi, sedangkan
 * adjustment mengikuti arah yang diberikan (bisa menambah atau mengurangi).
 */
function resolveQuantityDelta(movementType: MovementType, quantityDelta: number): number {
  if (STOCK_IN_TYPES.includes(movementType)) {
    const amount = Math.abs(quantityDelta);
    if (amount === 0) {
      throw badRequest(`Jumlah untuk mutasi '${movementType}' harus lebih dari 0`);
    }
    return amount;
  }

  if (movementType === 'adjustment') {
    if (quantityDelta === 0) throw badRequest('Jumlah untuk mutasi penyesuaian tidak boleh 0');
    return quantityDelta;
  }

  if (STOCK_OUT_TYPES.includes(movementType)) return -Math.abs(quantityDelta);

  throw badRequest(`Jenis mutasi '${movementType}' tidak dikenal`);
}

/** Saldo terkini satu bahan pada satu lokasi (jumlahkan seluruh mutasi). */
async function currentBalance(
  stockLocationId: string,
  ingredientId: string,
  tx?: TransactionClient,
): Promise<number> {
  const row = (await inventoryRepo.getStockOnHand(stockLocationId, ingredientId, tx)) as unknown as
    | Record<string, unknown>
    | null;
  if (!row) return 0;
  return num(row.onHand ?? row.on_hand);
}

// --------------------------------------------------------------------------
// GET /admin/stock/snapshot
// --------------------------------------------------------------------------
export async function stockSnapshot(query: StockSnapshotQuery) {
  const locations = await collectAll(
    (paging) => inventoryRepo.listStockLocations({ branchId: query.branchId }, paging),
    () => inventoryRepo.countStockLocations({ branchId: query.branchId }),
  );

  const visibleLocations = query.stockLocationId
    ? locations.filter((row) => str(row.id) === query.stockLocationId)
    : locations;

  if (query.stockLocationId && visibleLocations.length === 0) {
    throw notFound('Lokasi stok', query.stockLocationId);
  }

  // Snapshot memakai seluruh bahan, bukan hanya yang stoknya menipis.
  const ingredients = await collectAll(
    (paging) => inventoryRepo.listIngredients({ lowStockOnly: false }, paging),
    () => inventoryRepo.countIngredients({ lowStockOnly: false }),
  );

  // getStockOnHand hanya menerima satu bahan per lokasi, jadi saldo dihitung
  // satu per pasangan (lokasi, bahan).
  const items = [];
  let lowStockCount = 0;

  for (const ingredientRow of ingredients) {
    const ingredient = ingredientRow as Record<string, unknown>;
    const ingredientId = str(ingredient.id);
    const reorderLevel = num(ingredient.reorderLevel);

    const byLocation = [];
    let onHand = 0;

    for (const locationRow of visibleLocations) {
      const location = locationRow as Record<string, unknown>;
      const stockLocationId = str(location.id);
      const balance = await currentBalance(stockLocationId, ingredientId);
      onHand += balance;
      byLocation.push({
        stockLocationId,
        stockLocationName: str(location.name),
        branchId: strOrNull(location.branchId),
        onHand: balance,
      });
    }

    onHand = Math.round(onHand * 1000) / 1000;
    const lowStock = onHand <= reorderLevel;
    if (lowStock) lowStockCount += 1;

    items.push({
      ingredientId,
      sku: str(ingredient.sku),
      name: str(ingredient.name),
      baseUnit: str(ingredient.baseUnit),
      reorderLevel,
      isActive: bool(ingredient.isActive, true),
      onHand,
      lowStock,
      lastMovementAt: iso(ingredient.lastMovementAt),
      byLocation,
    });
  }

  return {
    branchId: query.branchId,
    stockLocationId: query.stockLocationId ?? null,
    locations: visibleLocations.map((row) => shapeStockLocation(row as Record<string, unknown>)),
    summary: {
      ingredientCount: items.length,
      locationCount: visibleLocations.length,
      lowStockCount,
    },
    items,
  };
}