import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import { withTransaction, type TransactionClient } from '../config/database.js';
import type { MovementType } from '../config/constants.js';
import { badRequest, conflict, notFound, unprocessable } from '../errors/AppError.js';
import * as adminRepo from '../repositories/admin.repository.js';
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
  type CreateStockOpnameInput,
  type CreateStockOutInput,
  type ListIngredientQuery,
  type ListMovementQuery,
  type ListRecipeQuery,
  type ListStockOpnameQuery,
  type ListStockOutQuery,
  type StockSummaryQuery,
  type TransferStockInput,
  type UpdateIngredientInput,
  type UpdateStockOpnameInput,
  type UpdateStockOutInput,
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

/** Konteks audit dari request (request id + IP) untuk jejak aktivitas sistem. */
export interface InventoryAuditContext {
  requestId?: string | null;
  ipAddress?: string | null;
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
    name: str(row.name),
    movementCount: num(row.movementCount),
  };
}

function shapeMovement(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    stockLocationId: str(row.stockLocationId),
    stockLocationName: strOrNull(row.stockLocationName),
    ingredientId: str(row.ingredientId),
    ingredientSku: strOrNull(row.ingredientSku),
    ingredientName: strOrNull(row.ingredientName),
    baseUnit: strOrNull(row.baseUnit),
    quantityDelta: num(row.quantityDelta),
    movementType: str(row.movementType),
    referenceType: strOrNull(row.referenceType),
    referenceId: strOrNull(row.referenceId),
    notes: strOrNull(row.notes),
    movementDate: toDateInputValue(row.movementDate),
    createdByName: strOrNull(row.createdByName),
    balanceAfter: num(row.balanceAfter),
    createdAt: iso(row.createdAt),
  };
}

function shapeStockOut(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    number: str(row.number),
    fromStockLocationId: str(row.fromStockLocationId),
    fromLocationName: strOrNull(row.fromLocationName),
    toStockLocationId: str(row.toStockLocationId),
    toLocationName: strOrNull(row.toLocationName),
    status: str(row.status),
    transferDate: toDateInputValue(row.transferDate),
    notes: strOrNull(row.notes),
    cancelReason: strOrNull(row.cancelReason),
    postedAt: iso(row.postedAt),
    postedById: strOrNull(row.postedBy),
    postedByName: strOrNull(row.postedByName),
    createdById: strOrNull(row.createdBy),
    createdByName: strOrNull(row.createdByName),
    itemCount: num(row.itemCount),
    totalQuantity: num(row.totalQuantity),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function shapeStockOutItem(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    stockOutId: str(row.stockOutId),
    ingredientId: str(row.ingredientId),
    ingredientSku: strOrNull(row.ingredientSku),
    ingredientName: strOrNull(row.ingredientName),
    baseUnit: strOrNull(row.baseUnit),
    quantity: num(row.quantity),
    notes: strOrNull(row.notes),
    sortOrder: num(row.sortOrder),
    createdAt: iso(row.createdAt),
  };
}

function shapeStockOpname(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    number: str(row.number),
    stockLocationId: str(row.stockLocationId),
    stockLocationName: strOrNull(row.stockLocationName),
    status: str(row.status),
    opnameDate: toDateInputValue(row.opnameDate),
    notes: strOrNull(row.notes),
    cancelReason: strOrNull(row.cancelReason),
    postedAt: iso(row.postedAt),
    postedById: strOrNull(row.postedBy),
    postedByName: strOrNull(row.postedByName),
    createdById: strOrNull(row.createdBy),
    createdByName: strOrNull(row.createdByName),
    itemCount: num(row.itemCount),
    surplusCount: num(row.surplusCount),
    defectCount: num(row.defectCount),
    totalDifference: num(row.totalDifference),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function shapeStockOpnameItem(row: Record<string, unknown>) {
  return {
    id: str(row.id),
    stockOpnameId: str(row.stockOpnameId),
    ingredientId: str(row.ingredientId),
    ingredientSku: strOrNull(row.ingredientSku),
    ingredientName: strOrNull(row.ingredientName),
    baseUnit: strOrNull(row.baseUnit),
    systemQuantity: num(row.systemQuantity),
    countedQuantity: num(row.countedQuantity),
    differenceQuantity: num(row.differenceQuantity),
    notes: strOrNull(row.notes),
    sortOrder: num(row.sortOrder),
    createdAt: iso(row.createdAt),
  };
}

const roundQuantity = (value: number) => Math.round(value * 1000) / 1000;

/** Normalisasi nilai tanggal (date dari DB bisa `Date` atau string) ke `YYYY-MM-DD`. */
function toDateInputValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const text = String(value);
  const dateOnly = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  if (dateOnly) return dateOnly[1];
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
export async function createIngredient(
  actorUserId: string,
  input: CreateIngredientInput,
  audit: InventoryAuditContext = {},
) {
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

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'inventory.ingredient.create',
        entityType: 'ingredient',
        entityId: str(row.id),
        newData: { sku, name, baseUnit: input.baseUnit, reorderLevel: input.reorderLevel },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return shapeIngredient(row);
  });
}

// --------------------------------------------------------------------------
// PATCH /admin/ingredients/:id
// --------------------------------------------------------------------------
export async function updateIngredient(
  ingredientId: string,
  actorUserId: string,
  input: UpdateIngredientInput,
  audit: InventoryAuditContext = {},
) {
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

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'inventory.ingredient.update',
        entityType: 'ingredient',
        entityId: ingredientId,
        oldData: shapeIngredient(current),
        newData: shapeIngredient(updated),
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return shapeIngredient(updated);
  });
}

// --------------------------------------------------------------------------
// DELETE /admin/ingredients/:id - hapus bahan baku yang belum dipakai resep
// --------------------------------------------------------------------------
export async function deleteIngredient(
  ingredientId: string,
  actorUserId: string,
  audit: InventoryAuditContext = {},
) {
  const current = await inventoryRepo.findIngredientById(ingredientId);
  if (!current) throw notFound('Bahan baku', ingredientId);

  const usageCount = await inventoryRepo.countRecipes({ ingredientId });
  const movementCount = await inventoryRepo.countMovements({ ingredientId });
  if (usageCount > 0 || movementCount > 0) {
    throw conflict(
      `Bahan '${current.name}' masih punya data resep atau riwayat pergerakan stok. Tidak bisa dihapus.`,
    );
  }

  return withTransaction(async (tx) => {
    const deleted = await inventoryRepo.deleteIngredient(ingredientId, tx);
    if (!deleted) throw notFound('Bahan baku', ingredientId);

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'inventory.ingredient.delete',
        entityType: 'ingredient',
        entityId: ingredientId,
        oldData: shapeIngredient(current),
        newData: { deleted: true },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return { id: ingredientId, deleted: true };
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
export async function saveRecipe(
  actorUserId: string,
  input: UpsertRecipeInput,
  audit: InventoryAuditContext = {},
) {
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

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'inventory.recipe.update',
        entityType: 'recipe',
        entityId: input.productVariantId,
        newData: {
          productVariantId: input.productVariantId,
          productName: strOrNull(variant.productName ?? variant.product_name),
          variantName: strOrNull(variant.variantName ?? variant.variant_name),
          ingredients: items,
        },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

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

  const rows = await inventoryRepo.listStockLocations(paging);
  const total = await inventoryRepo.countStockLocations();

  const pagination: Pagination = { page: paging.page, limit: paging.limit, offset: paging.offset, total };
  return { items: rows.map(shapeStockLocation), meta: buildPaginationMeta(pagination) };
}

// --------------------------------------------------------------------------
// POST /admin/stock-locations
// --------------------------------------------------------------------------
export async function createStockLocation(
  actorUserId: string,
  input: CreateStockLocationInput,
  audit: InventoryAuditContext = {},
) {
  const name = normalizeText(input.name);

  return withTransaction(async (tx) => {
    const existing = await inventoryRepo.listStockLocations(parsePagination({ limit: MAX_LIMIT }), tx);
    const duplikat = existing.find(
      (row) => normalizeText(str(row.name)).toLowerCase() === name.toLowerCase(),
    );
    if (duplikat) throw conflict(`Lokasi stok '${name}' sudah ada`);

    const row = await inventoryRepo.insertStockLocation(name, tx);
    if (!row) throw unprocessable('Lokasi stok gagal disimpan, coba lagi');

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'inventory.location.create',
        entityType: 'stock_location',
        entityId: str(row.id),
        newData: { name },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

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
export async function createMovement(
  actorUserId: string,
  input: CreateMovementInput,
  audit: InventoryAuditContext = {},
) {
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
        movementDate: input.movementDate ?? null,
        createdBy: actorUserId,
      },
      tx,
    );

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'inventory.movement.create',
        entityType: 'inventory_movement',
        entityId: str(row?.id),
        newData: {
          stockLocationId: input.stockLocationId,
          stockLocationName: str(stockLocation.name),
          ingredientId: input.ingredientId,
          ingredientName: str(ingredient.name),
          quantityDelta,
          movementType: input.movementType,
          movementDate: input.movementDate ?? null,
          stockOnHand: nextBalance,
          notes: input.notes ?? null,
        },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return {
      movement: shapeMovement({
        ...(row ?? {}),
        stockLocationName: str(stockLocation.name),
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
 * Transfer stok antar lokasi (mis. Gudang → Outlet Semoet). Satu transfer
 * menghasilkan dua mutasi berpasangan (`transfer_out` + `transfer_in`) dengan
 * `reference_id` yang sama supaya riwayatnya bisa ditelusuri.
 */
export async function transferStock(
  actorUserId: string,
  input: TransferStockInput,
  audit: InventoryAuditContext = {},
) {
  const referenceId = randomUUID();
  const quantity = Math.round(Number(input.quantity) * 1000) / 1000;

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw unprocessable('Jumlah transfer harus lebih dari 0');
  }

  return withTransaction(async (tx) => {
    await tx.advisoryLock(`inventory:movement:${input.ingredientId}`);
    const ingredient = await inventoryRepo.lockIngredient(input.ingredientId, tx);
    if (!ingredient) throw notFound('Bahan baku', input.ingredientId);

    const [fromLocation, toLocation] = await Promise.all([
      inventoryRepo.findStockLocation(input.fromStockLocationId, tx),
      inventoryRepo.findStockLocation(input.toStockLocationId, tx),
    ]);
    if (!fromLocation) throw notFound('Lokasi asal', input.fromStockLocationId);
    if (!toLocation) throw notFound('Lokasi tujuan', input.toStockLocationId);

    const sourceBalance = await currentBalance(input.fromStockLocationId, input.ingredientId, tx);
    if (sourceBalance < quantity) {
      throw unprocessable('Stok asal tidak cukup', [
        {
          field: 'quantity',
          message: `Stok ${str(ingredient.name)} di ${str(fromLocation.name)} tersedia ${sourceBalance}`,
        },
      ]);
    }
    const destinationBalance = await currentBalance(
      input.toStockLocationId,
      input.ingredientId,
      tx,
    );

    const notes =
      input.notes?.trim() ||
      `Transfer ${str(fromLocation.name)} → ${str(toLocation.name)}`;

    const outRow = await inventoryRepo.insertMovement(
      {
        stockLocationId: input.fromStockLocationId,
        ingredientId: input.ingredientId,
        quantityDelta: -quantity,
        movementType: 'transfer_out',
        referenceType: 'stock_transfer',
        referenceId,
        notes,
        movementDate: input.movementDate ?? null,
        createdBy: actorUserId,
      },
      tx,
    );
    const inRow = await inventoryRepo.insertMovement(
      {
        stockLocationId: input.toStockLocationId,
        ingredientId: input.ingredientId,
        quantityDelta: quantity,
        movementType: 'transfer_in',
        referenceType: 'stock_transfer',
        referenceId,
        notes,
        movementDate: input.movementDate ?? null,
        createdBy: actorUserId,
      },
      tx,
    );

    const fromBalanceAfter = Math.round((sourceBalance - quantity) * 1000) / 1000;
    const toBalanceAfter = Math.round((destinationBalance + quantity) * 1000) / 1000;

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'inventory.transfer.create',
        entityType: 'inventory_movement',
        entityId: referenceId,
        newData: {
          referenceId,
          ingredientId: input.ingredientId,
          ingredientName: str(ingredient.name),
          quantity,
          movementDate: input.movementDate ?? null,
          from: {
            stockLocationId: input.fromStockLocationId,
            name: str(fromLocation.name),
            balanceAfter: fromBalanceAfter,
          },
          to: {
            stockLocationId: input.toStockLocationId,
            name: str(toLocation.name),
            balanceAfter: toBalanceAfter,
          },
          notes,
        },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return {
      referenceId,
      ingredient: {
        id: str(ingredient.id),
        name: str(ingredient.name),
        sku: strOrNull(ingredient.sku),
        baseUnit: str(ingredient.baseUnit),
      },
      quantity,
      from: {
        stockLocationId: input.fromStockLocationId,
        name: str(fromLocation.name),
        balanceAfter: fromBalanceAfter,
      },
      to: {
        stockLocationId: input.toStockLocationId,
        name: str(toLocation.name),
        balanceAfter: toBalanceAfter,
      },
      movements: [
        shapeMovement({
          ...(outRow ?? {}),
          stockLocationName: str(fromLocation.name),
          ingredientSku: strOrNull(ingredient.sku),
          ingredientName: str(ingredient.name),
          baseUnit: str(ingredient.baseUnit),
          balanceAfter: fromBalanceAfter,
        }),
        shapeMovement({
          ...(inRow ?? {}),
          stockLocationName: str(toLocation.name),
          ingredientSku: strOrNull(ingredient.sku),
          ingredientName: str(ingredient.name),
          baseUnit: str(ingredient.baseUnit),
          balanceAfter: toBalanceAfter,
        }),
      ],
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
    (paging) => inventoryRepo.listStockLocations(paging),
    () => inventoryRepo.countStockLocations(),
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

// --------------------------------------------------------------------------
// Stok keluar (dokumen transfer gudang → outlet)
// --------------------------------------------------------------------------
function shapeStockOutDetailRows(header: Record<string, unknown>, items: Record<string, unknown>[]) {
  return {
    document: shapeStockOut(header),
    items: items.map(shapeStockOutItem),
  };
}

async function loadStockOutDetail(stockOutId: string, executor?: TransactionClient) {
  const header = await inventoryRepo.findStockOutDocument(stockOutId, executor);
  if (!header) throw notFound('Dokumen stok keluar', stockOutId);
  const items = await inventoryRepo.listStockOutItems(stockOutId, executor);
  return shapeStockOutDetailRows(header as Record<string, unknown>, items as Record<string, unknown>[]);
}

async function normalizeStockOutItems(
  tx: TransactionClient,
  items: Array<{ ingredientId: string; quantity: number; notes?: string }>,
) {
  const normalized = [];
  for (const [index, item] of items.entries()) {
    const ingredient = await inventoryRepo.findIngredientById(item.ingredientId, tx);
    if (!ingredient) throw notFound('Bahan baku', item.ingredientId);
    const quantity = roundQuantity(Number(item.quantity));
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw unprocessable('Kuantitas bahan harus lebih dari 0', [
        { field: `items.${index}.quantity`, message: 'Kuantitas harus lebih dari 0' },
      ]);
    }
    normalized.push({
      ingredientId: item.ingredientId,
      quantity,
      notes: item.notes?.trim() || null,
    });
  }
  return normalized;
}

async function insertStockOutRecord(
  tx: TransactionClient,
  actorUserId: string,
  input: CreateStockOutInput,
) {
  const [fromLocation, toLocation] = await Promise.all([
    inventoryRepo.findStockLocation(input.fromStockLocationId, tx),
    inventoryRepo.findStockLocation(input.toStockLocationId, tx),
  ]);
  if (!fromLocation) throw notFound('Lokasi asal', input.fromStockLocationId);
  if (!toLocation) throw notFound('Lokasi tujuan', input.toStockLocationId);

  const items = await normalizeStockOutItems(tx, input.items);
  const number = await inventoryRepo.nextInventoryDocumentNumber('stock_out_number_seq', 'SK', tx);
  if (!number) throw unprocessable('Nomor dokumen stok keluar gagal dibuat');

  const header = await inventoryRepo.insertStockOutDocument(
    {
      number,
      fromStockLocationId: input.fromStockLocationId,
      toStockLocationId: input.toStockLocationId,
      transferDate: input.transferDate ?? null,
      notes: input.notes?.trim() || null,
      status: 'draft',
      createdBy: actorUserId,
    },
    tx,
  );
  if (!header) throw unprocessable('Dokumen stok keluar gagal disimpan');

  await inventoryRepo.replaceStockOutItems(str(header.id), items, tx);
  return header as Record<string, unknown>;
}

/**
 * Posting stok keluar: validasi saldo gudang lalu buat pasangan mutasi
 * `transfer_out` di gudang asal dan `transfer_in` di outlet tujuan.
 */
async function postStockOutTx(
  tx: TransactionClient,
  rawDocument: Record<string, unknown>,
  actorUserId: string,
  audit: InventoryAuditContext,
) {
  const documentId = str(rawDocument.id);
  const fromStockLocationId = str(rawDocument.fromStockLocationId);
  const toStockLocationId = str(rawDocument.toStockLocationId);
  const transferDate = toDateInputValue(rawDocument.transferDate);
  const documentNumber = str(rawDocument.number);

  const [fromLocation, toLocation] = await Promise.all([
    inventoryRepo.findStockLocation(fromStockLocationId, tx),
    inventoryRepo.findStockLocation(toStockLocationId, tx),
  ]);
  if (!fromLocation) throw notFound('Lokasi asal', fromStockLocationId);
  if (!toLocation) throw notFound('Lokasi tujuan', toStockLocationId);

  const rows = (await inventoryRepo.listStockOutItems(documentId, tx)) as unknown as Record<
    string,
    unknown
  >[];
  if (rows.length === 0) throw unprocessable('Dokumen stok keluar belum memiliki bahan');

  const sorted = [...rows].sort((a, b) => str(a.ingredientId).localeCompare(str(b.ingredientId)));
  const baseNotes = `Stok keluar ${documentNumber} · ${str(fromLocation.name)} → ${str(toLocation.name)}`;
  const headerNotes = strOrNull(rawDocument.notes);
  const postedItems = [];

  for (const [index, row] of sorted.entries()) {
    const ingredientId = str(row.ingredientId);
    const quantity = roundQuantity(num(row.quantity));

    await tx.advisoryLock(`inventory:movement:${ingredientId}`);
    const ingredient = await inventoryRepo.lockIngredient(ingredientId, tx);
    if (!ingredient) throw notFound('Bahan baku', ingredientId);

    const sourceBalance = await currentBalance(fromStockLocationId, ingredientId, tx);
    if (sourceBalance < quantity) {
      throw unprocessable('Stok gudang tidak cukup', [
        {
          field: `items.${index}.quantity`,
          message: `Stok ${str(ingredient.name)} di ${str(fromLocation.name)} tersedia ${sourceBalance}, diminta ${quantity}`,
        },
      ]);
    }
    const destinationBalance = await currentBalance(toStockLocationId, ingredientId, tx);

    const itemNotes = strOrNull(row.notes);
    const movementNotes = itemNotes
      ? `${baseNotes}${headerNotes ? ` · ${headerNotes}` : ''} · ${itemNotes}`
      : `${baseNotes}${headerNotes ? ` · ${headerNotes}` : ''}`;

    const outRow = await inventoryRepo.insertMovement(
      {
        stockLocationId: fromStockLocationId,
        ingredientId,
        quantityDelta: -quantity,
        movementType: 'transfer_out',
        referenceType: 'stock_out',
        referenceId: documentId,
        notes: movementNotes,
        movementDate: transferDate,
        createdBy: actorUserId,
      },
      tx,
    );
    const inRow = await inventoryRepo.insertMovement(
      {
        stockLocationId: toStockLocationId,
        ingredientId,
        quantityDelta: quantity,
        movementType: 'transfer_in',
        referenceType: 'stock_out',
        referenceId: documentId,
        notes: movementNotes,
        movementDate: transferDate,
        createdBy: actorUserId,
      },
      tx,
    );

    postedItems.push({
      ingredientId,
      ingredientName: str(ingredient.name),
      baseUnit: strOrNull(ingredient.baseUnit),
      quantity,
      fromBalanceAfter: roundQuantity(sourceBalance - quantity),
      toBalanceAfter: roundQuantity(destinationBalance + quantity),
      movementIds: [strOrNull(outRow?.id), strOrNull(inRow?.id)],
    });
  }

  await inventoryRepo.updateStockOutDocument(
    documentId,
    { status: 'posted', posted_at: new Date(), posted_by: actorUserId },
    tx,
  );

  await adminRepo.insertAuditLog(
    {
      actorUserId,
      action: 'inventory.stock_out.post',
      entityType: 'stock_out_document',
      entityId: documentId,
      oldData: { status: str(rawDocument.status) },
      newData: {
        number: documentNumber,
        from: { id: fromStockLocationId, name: str(fromLocation.name) },
        to: { id: toStockLocationId, name: str(toLocation.name) },
        transferDate,
        notes: headerNotes,
        items: postedItems,
      },
      requestId: audit.requestId ?? null,
      ipAddress: audit.ipAddress ?? null,
    },
    tx,
  );
}

export async function listStockOuts(query: ListStockOutQuery): Promise<Paginated<unknown>> {
  const paging = parsePagination(query);
  const filters = {
    q: query.q,
    status: query.status,
    fromStockLocationId: query.fromStockLocationId,
    toStockLocationId: query.toStockLocationId,
    from: query.from,
    to: query.to,
  };

  const rows = await inventoryRepo.listStockOutDocuments(filters, paging);
  const total = await inventoryRepo.countStockOutDocuments(filters);

  const pagination: Pagination = {
    page: paging.page,
    limit: paging.limit,
    offset: paging.offset,
    total,
  };
  return {
    items: rows.map((row) => shapeStockOut(row as Record<string, unknown>)),
    meta: buildPaginationMeta(pagination),
  };
}

export async function stockOutDetail(stockOutId: string) {
  return loadStockOutDetail(stockOutId);
}

export async function createStockOut(
  actorUserId: string,
  input: CreateStockOutInput,
  audit: InventoryAuditContext = {},
) {
  return withTransaction(async (tx) => {
    const header = await insertStockOutRecord(tx, actorUserId, input);
    if (input.postNow) await postStockOutTx(tx, header, actorUserId, audit);
    return loadStockOutDetail(str(header.id), tx);
  });
}

export async function updateStockOut(
  stockOutId: string,
  actorUserId: string,
  input: UpdateStockOutInput,
  audit: InventoryAuditContext = {},
) {
  return withTransaction(async (tx) => {
    const current = (await inventoryRepo.lockStockOutDocument(stockOutId, tx)) as unknown as
      | Record<string, unknown>
      | null;
    if (!current) throw notFound('Dokumen stok keluar', stockOutId);
    if (str(current.status) !== 'draft') {
      throw conflict('Hanya dokumen draft yang bisa diubah');
    }

    const fromStockLocationId =
      input.fromStockLocationId ?? str(current.fromStockLocationId);
    const toStockLocationId = input.toStockLocationId ?? str(current.toStockLocationId);
    if (fromStockLocationId === toStockLocationId) {
      throw unprocessable('Lokasi asal dan tujuan tidak boleh sama');
    }
    if (input.fromStockLocationId) {
      const fromLocation = await inventoryRepo.findStockLocation(fromStockLocationId, tx);
      if (!fromLocation) throw notFound('Lokasi asal', fromStockLocationId);
    }
    if (input.toStockLocationId) {
      const toLocation = await inventoryRepo.findStockLocation(toStockLocationId, tx);
      if (!toLocation) throw notFound('Lokasi tujuan', toStockLocationId);
    }

    const data: Record<string, unknown> = {};
    if (input.fromStockLocationId !== undefined) {
      data.from_stock_location_id = input.fromStockLocationId;
    }
    if (input.toStockLocationId !== undefined) {
      data.to_stock_location_id = input.toStockLocationId;
    }
    if (input.transferDate !== undefined) data.transfer_date = input.transferDate;
    if (input.notes !== undefined) data.notes = input.notes?.trim() || null;

    if (input.items) {
      const items = await normalizeStockOutItems(tx, input.items);
      await inventoryRepo.replaceStockOutItems(stockOutId, items, tx);
    }

    await inventoryRepo.updateStockOutDocument(stockOutId, data, tx);

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'inventory.stock_out.update',
        entityType: 'stock_out_document',
        entityId: stockOutId,
        oldData: {
          fromStockLocationId: str(current.fromStockLocationId),
          toStockLocationId: str(current.toStockLocationId),
          status: str(current.status),
        },
        newData: {
          fromStockLocationId,
          toStockLocationId,
          transferDate: input.transferDate ?? strOrNull(current.transferDate),
          notes: input.notes === undefined ? strOrNull(current.notes) : input.notes,
          itemCount: input.items?.length,
        },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return loadStockOutDetail(stockOutId, tx);
  });
}

export async function postStockOut(
  stockOutId: string,
  actorUserId: string,
  audit: InventoryAuditContext = {},
) {
  return withTransaction(async (tx) => {
    const current = (await inventoryRepo.lockStockOutDocument(stockOutId, tx)) as unknown as
      | Record<string, unknown>
      | null;
    if (!current) throw notFound('Dokumen stok keluar', stockOutId);
    if (str(current.status) === 'posted') throw conflict('Dokumen sudah diposting');
    if (str(current.status) === 'cancelled') throw conflict('Dokumen sudah dibatalkan');

    await postStockOutTx(tx, current, actorUserId, audit);
    return loadStockOutDetail(stockOutId, tx);
  });
}

export async function cancelStockOut(
  stockOutId: string,
  actorUserId: string,
  reason?: string,
  audit: InventoryAuditContext = {},
) {
  return withTransaction(async (tx) => {
    const current = (await inventoryRepo.lockStockOutDocument(stockOutId, tx)) as unknown as
      | Record<string, unknown>
      | null;
    if (!current) throw notFound('Dokumen stok keluar', stockOutId);
    if (str(current.status) !== 'draft') {
      throw conflict('Hanya dokumen draft yang bisa dibatalkan');
    }

    await inventoryRepo.updateStockOutDocument(
      stockOutId,
      { status: 'cancelled', cancel_reason: reason?.trim() || null },
      tx,
    );

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'inventory.stock_out.cancel',
        entityType: 'stock_out_document',
        entityId: stockOutId,
        oldData: { status: 'draft' },
        newData: { status: 'cancelled', reason: reason?.trim() || null },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return loadStockOutDetail(stockOutId, tx);
  });
}

export async function deleteStockOut(
  stockOutId: string,
  actorUserId: string,
  audit: InventoryAuditContext = {},
) {
  return withTransaction(async (tx) => {
    const current = (await inventoryRepo.lockStockOutDocument(stockOutId, tx)) as unknown as
      | Record<string, unknown>
      | null;
    if (!current) throw notFound('Dokumen stok keluar', stockOutId);
    if (str(current.status) !== 'draft') {
      throw conflict('Hanya dokumen draft yang bisa dihapus');
    }

    await inventoryRepo.deleteStockOutDocument(stockOutId, tx);
    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'inventory.stock_out.delete',
        entityType: 'stock_out_document',
        entityId: stockOutId,
        oldData: {
          number: str(current.number),
          fromStockLocationId: str(current.fromStockLocationId),
          toStockLocationId: str(current.toStockLocationId),
        },
        newData: { deleted: true },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return { id: stockOutId, deleted: true };
  });
}

// --------------------------------------------------------------------------
// Stok opname
// --------------------------------------------------------------------------
function shapeStockOpnameDetailRows(
  header: Record<string, unknown>,
  items: Record<string, unknown>[],
) {
  return {
    document: shapeStockOpname(header),
    items: items.map(shapeStockOpnameItem),
  };
}

async function loadStockOpnameDetail(stockOpnameId: string, executor?: TransactionClient) {
  const header = await inventoryRepo.findStockOpnameDocument(stockOpnameId, executor);
  if (!header) throw notFound('Dokumen stok opname', stockOpnameId);
  const items = await inventoryRepo.listStockOpnameItems(stockOpnameId, executor);
  return shapeStockOpnameDetailRows(
    header as Record<string, unknown>,
    items as Record<string, unknown>[],
  );
}

async function normalizeStockOpnameItems(
  tx: TransactionClient,
  stockLocationId: string,
  items: Array<{ ingredientId: string; countedQuantity: number; notes?: string }>,
) {
  const normalized = [];
  for (const [index, item] of items.entries()) {
    const ingredient = await inventoryRepo.findIngredientById(item.ingredientId, tx);
    if (!ingredient) throw notFound('Bahan baku', item.ingredientId);

    const countedQuantity = roundQuantity(Number(item.countedQuantity));
    if (!Number.isFinite(countedQuantity) || countedQuantity < 0) {
      throw unprocessable('Kuantitas fisik tidak boleh negatif', [
        { field: `items.${index}.countedQuantity`, message: 'Kuantitas fisik tidak boleh negatif' },
      ]);
    }

    const systemQuantity = await currentBalance(stockLocationId, item.ingredientId, tx);
    normalized.push({
      ingredientId: item.ingredientId,
      systemQuantity,
      countedQuantity,
      differenceQuantity: roundQuantity(countedQuantity - systemQuantity),
      notes: item.notes?.trim() || null,
    });
  }
  return normalized;
}

async function insertStockOpnameRecord(
  tx: TransactionClient,
  actorUserId: string,
  input: CreateStockOpnameInput,
) {
  const location = await inventoryRepo.findStockLocation(input.stockLocationId, tx);
  if (!location) throw notFound('Lokasi stok', input.stockLocationId);

  const items = await normalizeStockOpnameItems(tx, input.stockLocationId, input.items);
  const number = await inventoryRepo.nextInventoryDocumentNumber('stock_opname_number_seq', 'OP', tx);
  if (!number) throw unprocessable('Nomor dokumen stok opname gagal dibuat');

  const header = await inventoryRepo.insertStockOpnameDocument(
    {
      number,
      stockLocationId: input.stockLocationId,
      opnameDate: input.opnameDate ?? null,
      notes: input.notes?.trim() || null,
      status: 'draft',
      createdBy: actorUserId,
    },
    tx,
  );
  if (!header) throw unprocessable('Dokumen stok opname gagal disimpan');

  await inventoryRepo.replaceStockOpnameItems(str(header.id), items, tx);
  return header as Record<string, unknown>;
}

/**
 * Posting stok opname: hitung ulang saldo sistem terbaru, lalu catat satu
 * mutasi penyesuaian untuk setiap selisih fisik. Bahan dengan selisih 0 tidak
 * menghasilkan mutasi.
 */
async function postStockOpnameTx(
  tx: TransactionClient,
  rawDocument: Record<string, unknown>,
  actorUserId: string,
  audit: InventoryAuditContext,
) {
  const documentId = str(rawDocument.id);
  const stockLocationId = str(rawDocument.stockLocationId);
  const opnameDate = toDateInputValue(rawDocument.opnameDate);
  const documentNumber = str(rawDocument.number);

  const location = await inventoryRepo.findStockLocation(stockLocationId, tx);
  if (!location) throw notFound('Lokasi stok', stockLocationId);

  const rows = (await inventoryRepo.listStockOpnameItems(documentId, tx)) as unknown as Record<
    string,
    unknown
  >[];
  if (rows.length === 0) throw unprocessable('Dokumen stok opname belum memiliki bahan');

  const sorted = [...rows].sort((a, b) => str(a.ingredientId).localeCompare(str(b.ingredientId)));
  const headerNotes = strOrNull(rawDocument.notes);
  const adjustments = [];

  for (const row of sorted) {
    const ingredientId = str(row.ingredientId);
    const countedQuantity = roundQuantity(num(row.countedQuantity));
    const itemNotes = strOrNull(row.notes);

    await tx.advisoryLock(`inventory:movement:${ingredientId}`);
    const ingredient = await inventoryRepo.lockIngredient(ingredientId, tx);
    if (!ingredient) throw notFound('Bahan baku', ingredientId);

    const systemQuantity = roundQuantity(await currentBalance(stockLocationId, ingredientId, tx));
    const differenceQuantity = roundQuantity(countedQuantity - systemQuantity);

    await inventoryRepo.updateStockOpnameItemSnapshot(
      str(row.id),
      systemQuantity,
      differenceQuantity,
      tx,
    );

    if (differenceQuantity !== 0) {
      const kind = differenceQuantity > 0 ? 'Surplus' : 'Defisit';
      const notes = [
        `Stok opname ${documentNumber} · ${kind}`,
        headerNotes,
        itemNotes,
      ]
        .filter(Boolean)
        .join(' · ');

      await inventoryRepo.insertMovement(
        {
          stockLocationId,
          ingredientId,
          quantityDelta: differenceQuantity,
          movementType: 'adjustment',
          referenceType: 'stock_opname',
          referenceId: documentId,
          notes,
          movementDate: opnameDate,
          createdBy: actorUserId,
        },
        tx,
      );
    }

    adjustments.push({
      ingredientId,
      ingredientName: str(ingredient.name),
      baseUnit: strOrNull(ingredient.baseUnit),
      systemQuantity,
      countedQuantity,
      differenceQuantity,
      notes: itemNotes,
    });
  }

  await inventoryRepo.updateStockOpnameDocument(
    documentId,
    { status: 'posted', posted_at: new Date(), posted_by: actorUserId },
    tx,
  );

  await adminRepo.insertAuditLog(
    {
      actorUserId,
      action: 'inventory.stock_opname.post',
      entityType: 'stock_opname_document',
      entityId: documentId,
      oldData: { status: str(rawDocument.status) },
      newData: {
        number: documentNumber,
        stockLocationId,
        stockLocationName: str(location.name),
        opnameDate,
        notes: headerNotes,
        items: adjustments,
      },
      requestId: audit.requestId ?? null,
      ipAddress: audit.ipAddress ?? null,
    },
    tx,
  );
}

export async function listStockOpnames(query: ListStockOpnameQuery): Promise<Paginated<unknown>> {
  const paging = parsePagination(query);
  const filters = {
    q: query.q,
    status: query.status,
    stockLocationId: query.stockLocationId,
    from: query.from,
    to: query.to,
  };

  const rows = await inventoryRepo.listStockOpnameDocuments(filters, paging);
  const total = await inventoryRepo.countStockOpnameDocuments(filters);

  const pagination: Pagination = {
    page: paging.page,
    limit: paging.limit,
    offset: paging.offset,
    total,
  };
  return {
    items: rows.map((row) => shapeStockOpname(row as Record<string, unknown>)),
    meta: buildPaginationMeta(pagination),
  };
}

export async function stockOpnameDetail(stockOpnameId: string) {
  return loadStockOpnameDetail(stockOpnameId);
}

export async function createStockOpname(
  actorUserId: string,
  input: CreateStockOpnameInput,
  audit: InventoryAuditContext = {},
) {
  return withTransaction(async (tx) => {
    const header = await insertStockOpnameRecord(tx, actorUserId, input);
    if (input.postNow) await postStockOpnameTx(tx, header, actorUserId, audit);
    return loadStockOpnameDetail(str(header.id), tx);
  });
}

export async function updateStockOpname(
  stockOpnameId: string,
  actorUserId: string,
  input: UpdateStockOpnameInput,
  audit: InventoryAuditContext = {},
) {
  return withTransaction(async (tx) => {
    const current = (await inventoryRepo.lockStockOpnameDocument(stockOpnameId, tx)) as unknown as
      | Record<string, unknown>
      | null;
    if (!current) throw notFound('Dokumen stok opname', stockOpnameId);
    if (str(current.status) !== 'draft') {
      throw conflict('Hanya dokumen draft yang bisa diubah');
    }

    const stockLocationId = input.stockLocationId ?? str(current.stockLocationId);
    if (input.stockLocationId) {
      const location = await inventoryRepo.findStockLocation(stockLocationId, tx);
      if (!location) throw notFound('Lokasi stok', stockLocationId);
    }

    const data: Record<string, unknown> = {};
    if (input.stockLocationId !== undefined) data.stock_location_id = input.stockLocationId;
    if (input.opnameDate !== undefined) data.opname_date = input.opnameDate;
    if (input.notes !== undefined) data.notes = input.notes?.trim() || null;

    if (input.items) {
      const items = await normalizeStockOpnameItems(tx, stockLocationId, input.items);
      await inventoryRepo.replaceStockOpnameItems(stockOpnameId, items, tx);
    } else if (input.stockLocationId && input.stockLocationId !== str(current.stockLocationId)) {
      // Lokasi berubah tanpa mengubah bahan: ambil ulang saldo sistem dari lokasi baru.
      const existing = (await inventoryRepo.listStockOpnameItems(stockOpnameId, tx)) as unknown as
        Record<string, unknown>[];
      const items = await normalizeStockOpnameItems(
        tx,
        stockLocationId,
        existing.map((row) => ({
          ingredientId: str(row.ingredientId),
          countedQuantity: num(row.countedQuantity),
          notes: strOrNull(row.notes) ?? undefined,
        })),
      );
      await inventoryRepo.replaceStockOpnameItems(stockOpnameId, items, tx);
    }

    await inventoryRepo.updateStockOpnameDocument(stockOpnameId, data, tx);

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'inventory.stock_opname.update',
        entityType: 'stock_opname_document',
        entityId: stockOpnameId,
        oldData: { stockLocationId: str(current.stockLocationId), status: str(current.status) },
        newData: {
          stockLocationId,
          opnameDate: input.opnameDate ?? strOrNull(current.opnameDate),
          notes: input.notes === undefined ? strOrNull(current.notes) : input.notes,
          itemCount: input.items?.length,
        },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return loadStockOpnameDetail(stockOpnameId, tx);
  });
}

export async function postStockOpname(
  stockOpnameId: string,
  actorUserId: string,
  audit: InventoryAuditContext = {},
) {
  return withTransaction(async (tx) => {
    const current = (await inventoryRepo.lockStockOpnameDocument(stockOpnameId, tx)) as unknown as
      | Record<string, unknown>
      | null;
    if (!current) throw notFound('Dokumen stok opname', stockOpnameId);
    if (str(current.status) === 'posted') throw conflict('Dokumen sudah diposting');
    if (str(current.status) === 'cancelled') throw conflict('Dokumen sudah dibatalkan');

    await postStockOpnameTx(tx, current, actorUserId, audit);
    return loadStockOpnameDetail(stockOpnameId, tx);
  });
}

export async function cancelStockOpname(
  stockOpnameId: string,
  actorUserId: string,
  reason?: string,
  audit: InventoryAuditContext = {},
) {
  return withTransaction(async (tx) => {
    const current = (await inventoryRepo.lockStockOpnameDocument(stockOpnameId, tx)) as unknown as
      | Record<string, unknown>
      | null;
    if (!current) throw notFound('Dokumen stok opname', stockOpnameId);
    if (str(current.status) !== 'draft') {
      throw conflict('Hanya dokumen draft yang bisa dibatalkan');
    }

    await inventoryRepo.updateStockOpnameDocument(
      stockOpnameId,
      { status: 'cancelled', cancel_reason: reason?.trim() || null },
      tx,
    );

    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'inventory.stock_opname.cancel',
        entityType: 'stock_opname_document',
        entityId: stockOpnameId,
        oldData: { status: 'draft' },
        newData: { status: 'cancelled', reason: reason?.trim() || null },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return loadStockOpnameDetail(stockOpnameId, tx);
  });
}

export async function deleteStockOpname(
  stockOpnameId: string,
  actorUserId: string,
  audit: InventoryAuditContext = {},
) {
  return withTransaction(async (tx) => {
    const current = (await inventoryRepo.lockStockOpnameDocument(stockOpnameId, tx)) as unknown as
      | Record<string, unknown>
      | null;
    if (!current) throw notFound('Dokumen stok opname', stockOpnameId);
    if (str(current.status) !== 'draft') {
      throw conflict('Hanya dokumen draft yang bisa dihapus');
    }

    await inventoryRepo.deleteStockOpnameDocument(stockOpnameId, tx);
    await adminRepo.insertAuditLog(
      {
        actorUserId,
        action: 'inventory.stock_opname.delete',
        entityType: 'stock_opname_document',
        entityId: stockOpnameId,
        oldData: {
          number: str(current.number),
          stockLocationId: str(current.stockLocationId),
        },
        newData: { deleted: true },
        requestId: audit.requestId ?? null,
        ipAddress: audit.ipAddress ?? null,
      },
      tx,
    );

    return { id: stockOpnameId, deleted: true };
  });
}

// --------------------------------------------------------------------------
// GET /admin/stock/summary
// --------------------------------------------------------------------------
function jakartaDateString(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export async function stockSummary(query: StockSummaryQuery) {
  const today = jakartaDateString(new Date());
  const from = query.from ?? `${today.slice(0, 7)}-01`;
  const to = query.to ?? today;

  if (from > to) throw unprocessable('Tanggal awal tidak boleh melewati tanggal akhir');

  const rows = (await inventoryRepo.stockSummary({
    stockLocationId: query.stockLocationId,
    from,
    to,
  })) as unknown as Record<string, unknown>[];

  const items = rows.map((row) => {
    const closingStock = roundQuantity(num(row.closingStock));
    const reorderLevel = num(row.reorderLevel);
    return {
      ingredientId: str(row.ingredientId),
      sku: str(row.sku),
      name: str(row.name),
      baseUnit: str(row.baseUnit),
      reorderLevel,
      openingStock: roundQuantity(num(row.openingStock)),
      totalIn: roundQuantity(num(row.totalIn)),
      totalOut: roundQuantity(num(row.totalOut)),
      totalSales: roundQuantity(num(row.totalSales)),
      totalWaste: roundQuantity(num(row.totalWaste)),
      totalAdjustment: roundQuantity(num(row.totalAdjustment)),
      closingStock,
      lowStock: closingStock <= reorderLevel,
    };
  });

  const summary = items.reduce(
    (acc, item) => {
      acc.openingStock += item.openingStock;
      acc.totalIn += item.totalIn;
      acc.totalOut += item.totalOut;
      acc.totalSales += item.totalSales;
      acc.totalWaste += item.totalWaste;
      acc.totalAdjustment += item.totalAdjustment;
      if (item.lowStock) acc.lowStockCount += 1;
      return acc;
    },
    {
      ingredientCount: items.length,
      openingStock: 0,
      totalIn: 0,
      totalOut: 0,
      totalSales: 0,
      totalWaste: 0,
      totalAdjustment: 0,
      lowStockCount: 0,
    },
  );

  return { from, to, summary, items };
}
