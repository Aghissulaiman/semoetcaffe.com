import { z } from 'zod';
import * as catalogRepo from '../repositories/catalog.repository.js';
import * as reviewRepo from '../repositories/review.repository.js';
import * as userRepo from '../repositories/user.repository.js';
import { badRequest, notFound } from '../errors/AppError.js';
import { buildPaginationMeta, parsePagination, type Pagination } from '../utils/pagination.js';
import { bool, iso, json, num, strOrNull } from '../utils/serialize.js';
import {
  listCategoryQuerySchema,
  productAvailabilityQuerySchema,
  type ListProductQuery,
} from '../validators/catalog.validator.js';

/** Tipe input diturunkan langsung dari schema validator katalog. */
export type ListCategoryQuery = z.infer<typeof listCategoryQuerySchema>;
export type ListProductAvailabilityQuery = z.infer<typeof productAvailabilityQuerySchema>;

export interface Paginated<T> {
  items: T[];
  meta: ReturnType<typeof buildPaginationMeta>;
}

/** Batas panjang deskripsi ringkas pada list produk. */
const SHORT_DESCRIPTION_LENGTH = 140;

/** Batas jumlah opsi yang ditampilkan pada ringkasan modifier. */
const MAX_MODIFIER_OPTIONS = 20;

interface OpsiModifier {
  id: string;
  groupId: string;
  name: string;
  priceDeltaIdr: number;
  sortOrder: number;
  isActive: boolean;
}

interface GrupModifier {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  isRequired: boolean;
  sortOrder: number;
  options: OpsiModifier[];
}

// --------------------------------------------------------------------------
// Helper shaping
// --------------------------------------------------------------------------

function truncate(value: unknown, maxLength = SHORT_DESCRIPTION_LENGTH): string | null {
  const text = strOrNull(value);
  if (text === null) return null;
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}...`;
}

/**
 * Ketersediaan produk berdasarkan jendela aktif (available_from/until).
 * Tidak sama dengan ketersediaan per cabang; itu dipakai di checkAvailability.
 */
function isProductAvailableAt(row: Record<string, unknown>, at: Date): boolean {
  const from = row.availableFrom ? new Date(String(row.availableFrom)) : null;
  const until = row.availableUntil ? new Date(String(row.availableUntil)) : null;
  if (from && Number.isNaN(from.getTime())) return true;
  if (until && Number.isNaN(until.getTime())) return true;
  if (from && from.getTime() > at.getTime()) return false;
  if (until && until.getTime() < at.getTime()) return false;
  return true;
}

function shapeImage(row: Record<string, unknown>) {
  return {
    id: row.id,
    url: strOrNull(row.publicUrl),
    altText: strOrNull(row.altText),
    sortOrder: num(row.sortOrder),
    isPrimary: bool(row.isPrimary),
    widthPx: row.widthPx === null || row.widthPx === undefined ? null : num(row.widthPx),
    heightPx: row.heightPx === null || row.heightPx === undefined ? null : num(row.heightPx),
  };
}

/** Bentuk galeri dari jsonb hasil query list, atau dari baris image terpisah. */
function shapeGallery(value: unknown): ReturnType<typeof shapeImage>[] {
  const list = Array.isArray(value) ? value : [];
  return list.map((item) => shapeImage(item as Record<string, unknown>));
}

function shapeOption(row: Record<string, unknown>): OpsiModifier {
  return {
    id: String(row.id),
    groupId: String(row.groupId),
    name: String(row.name),
    priceDeltaIdr: num(row.priceDeltaIdr),
    sortOrder: num(row.sortOrder),
    isActive: bool(row.isActive, true),
  };
}

/** Group + options dari listProductModifiers (options sudah berupa jsonb). */
function shapeModifierGroups(
  rows: Record<string, unknown>[],
  optionsByGroup?: Map<string, OpsiModifier[]>,
): GrupModifier[] {
  return rows.map((row) => {
    const groupId = String(row.groupId);
    const jsonOptions = Array.isArray(row.options) ? (row.options as Record<string, unknown>[]) : [];
    const fallback = jsonOptions.slice(0, MAX_MODIFIER_OPTIONS).map(shapeOption);
    return {
      id: groupId,
      name: String(row.groupName ?? row.name ?? ''),
      minSelect: num(row.minSelect),
      maxSelect: num(row.maxSelect),
      isRequired: bool(row.isRequired),
      sortOrder: num(row.sortOrder),
      options: (optionsByGroup?.get(groupId) ?? fallback).slice(0, MAX_MODIFIER_OPTIONS),
    };
  });
}

/** Group + options dari jsonb query list produk (key sudah camelCase). */
function shapeModifierGroupsFromJson(value: unknown): GrupModifier[] {
  const list = Array.isArray(value) ? value : [];
  return list.map((item) => {
    const group = item as Record<string, unknown>;
    const options = Array.isArray(group.options) ? (group.options as Record<string, unknown>[]) : [];
    return {
      id: String(group.id ?? group.groupId ?? ''),
      name: String(group.name ?? ''),
      minSelect: num(group.minSelect),
      maxSelect: num(group.maxSelect),
      isRequired: bool(group.isRequired),
      sortOrder: num(group.sortOrder),
      options: options.slice(0, MAX_MODIFIER_OPTIONS).map(shapeOption),
    };
  });
}

function shapeRatingSummary(value: Record<string, unknown> | null) {
  return {
    average: value ? num(value.averageOverall) : 0,
    count: value ? num(value.reviewCount) : 0,
  };
}

/** Baris list produk: rating digabung dari food/service/speed via DB. */
function shapeListRating(row: Record<string, unknown>) {
  return {
    average: num(row.averageRating),
    count: num(row.reviewCount),
  };
}

function shapeCategoryRef(row: Record<string, unknown>) {
  return {
    id: String(row.categoryId ?? ''),
    slug: strOrNull(row.categorySlug),
    name: strOrNull(row.categoryName),
  };
}

function shapeVariant(row: Record<string, unknown>, modifierGroups: GrupModifier[]) {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    sku: strOrNull(row.sku),
    priceIdr: num(row.priceIdr),
    compareAtPriceIdr:
      row.compareAtPriceIdr === null || row.compareAtPriceIdr === undefined
        ? null
        : num(row.compareAtPriceIdr),
    isDefault: bool(row.isDefault),
    isAvailable: bool(row.isActive),
    modifierGroups,
  };
}

/** Data produk yang dipakai bersama oleh shape summary dan shape detail. */
function shapeProductBase(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    slug: String(row.slug ?? ''),
    name: String(row.name ?? ''),
    description: strOrNull(row.description),
    productKind: strOrNull(row.productKind),
    isFeatured: bool(row.isFeatured),
    isActive: bool(row.isActive),
    availableFrom: iso(row.availableFrom),
    availableUntil: iso(row.availableUntil),
  };
}

/**
 * Susun pohon kategori dari baris datar.
 * Baris hasil listCategories sudah terurut path, jadi parent selalu sebelum anak.
 */
export function buildCategoryTree(rows: Record<string, unknown>[]) {
  type Node = ReturnType<typeof shapeCategoryNode>;
  const nodes = new Map<string, Node & { children: Node[] }>();
  const roots: (Node & { children: Node[] })[] = [];

  for (const row of rows) {
    const node = shapeCategoryNode(row);
    nodes.set(node.id, { ...node, children: [] });
  }

  for (const row of rows) {
    const node = nodes.get(String(row.id));
    if (!node) continue;
    const parentId = row.parentId === null || row.parentId === undefined ? null : String(row.parentId);
    const parent = parentId ? nodes.get(parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  return roots;
}

function shapeCategoryNode(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    parentId: row.parentId === null || row.parentId === undefined ? null : String(row.parentId),
    name: String(row.name ?? ''),
    slug: strOrNull(row.slug),
    sortOrder: num(row.sortOrder),
    isActive: bool(row.isActive),
    productCount: num(row.productCount),
    depth: num(row.depth),
  };
}

function shapeCategory(row: Record<string, unknown>) {
  const { depth: _depth, ...rest } = shapeCategoryNode(row);
  return rest;
}

/** Rantai kategori (selfie sampai ancestor) dari tree datar kategori. */
function resolveCategoryPath(
  rows: Record<string, unknown>[],
  categoryId: string,
): ReturnType<typeof shapeCategoryNode>[] {
  const byId = new Map(rows.map((row) => [String(row.id), row]));
  const path: ReturnType<typeof shapeCategoryNode>[] = [];
  let current = byId.get(categoryId);
  const guard = new Set<string>();

  while (current && !guard.has(String(current.id))) {
    guard.add(String(current.id));
    path.unshift(shapeCategoryNode(current));
    const parentId = current.parentId === null || current.parentId === undefined ? null : String(current.parentId);
    current = parentId ? byId.get(parentId) : undefined;
  }

  return path;
}

// --------------------------------------------------------------------------
// GET /categories
// --------------------------------------------------------------------------
export async function listCategories(query: ListCategoryQuery) {
  const parentId = query.parentId ? query.parentId : null;
  const rows = await catalogRepo.listCategories({
    isActive: query.isActive,
    parentId,
  });

  // Tanpa parentId, repo mengembalikan seluruh pohon. includeChildren=false
  // membatasi hasil hanya kategori tingkat atas (depth 0).
  const visible = parentId === null && query.includeChildren === false
    ? rows.filter((row) => num(row.depth) === 0)
    : rows;

  return {
    items: visible.map(shapeCategory),
    tree: buildCategoryTree(visible),
  };
}

// --------------------------------------------------------------------------
// GET /products/:slug dan GET /products/:id
// --------------------------------------------------------------------------

/**
 * Susun detail produk dari baris produk yang sudah dimuat.
 * Semua data turunan diambil paralel oleh pemanggil.
 */
function shapeProductDetail(input: {
  product: Record<string, unknown>;
  variants: Record<string, unknown>[];
  images: Record<string, unknown>[];
  modifierGroups: GrupModifier[];
  categories: ReturnType<typeof shapeCategoryNode>[];
  // Generic eksplisit di repository memakai nama kolom snake_case, sedangkan
  // baris runtime sudah di-camelize oleh one().
  rating: Record<string, unknown> | null;
  isFavorite: boolean;
  at: Date;
}) {
  const { product, variants, images, modifierGroups, categories, rating, isFavorite, at } = input;
  const base = shapeProductBase(product);

  return {
    ...base,
    descriptionShort: truncate(product.description),
    imageUrl: strOrNull(images.find((image) => bool(image.isPrimary))?.publicUrl ?? images[0]?.publicUrl),
    category: categories.length > 0 ? shapeCategory(categories[categories.length - 1]) : null,
    rating: shapeRatingSummary(rating),
    isFavorite,
    isAvailable: isProductAvailableAt(product, at),
    basePriceIdr: variants.length > 0 ? Math.min(...variants.map((row) => num(row.priceIdr))) : null,
    variants: variants.map((row) => shapeVariant(row, modifierGroups)),
    images: images.map(shapeImage),
    modifierGroups,
    categories,
    nutritionInfo: json<Record<string, unknown> | null>(product.nutritionInfo, null),
    allergens: Array.isArray(product.allergens) ? product.allergens : [],
  };
}

/** Ambil group + options modifier untuk satu produk (dua query paralel). */
async function loadModifierGroups(productId: string): Promise<GrupModifier[]> {
  const groupRows = await catalogRepo.listProductModifiers(productId);
  if (groupRows.length === 0) return [];

  const groupIds = groupRows.map((row) => String(row.groupId));
  const optionRows = await catalogRepo.listModifierOptionsForGroups(groupIds);

  const optionsByGroup = new Map<string, OpsiModifier[]>();
  for (const row of optionRows) {
    const groupId = String(row.groupId);
    const list = optionsByGroup.get(groupId) ?? [];
    list.push(shapeOption(row));
    optionsByGroup.set(groupId, list);
  }

  return shapeModifierGroups(groupRows, optionsByGroup);
}

export async function getProductBySlug(slug: string, userId?: string | null) {
  const product = await catalogRepo.findProductBySlug(slug);
  if (!product || !bool(product.isActive)) throw notFound('Produk', slug);

  return buildProductDetail(product, userId);
}

export async function getProductById(productId: string, userId?: string | null) {
  const product = await catalogRepo.findProductById(productId);
  if (!product || !bool(product.isActive)) throw notFound('Produk', productId);

  return buildProductDetail(product, userId);
}

/** Ambil seluruh data turunan produk lalu bentuk DTO detail. */
async function buildProductDetail(
  product: Record<string, unknown>,
  userId?: string | null,
) {
  const productId = String(product.id);
  const at = new Date();

  const [variants, images, modifierGroups, categoryRows, rating, favorite] = await Promise.all([
    catalogRepo.listVariants(productId),
    catalogRepo.listProductImages(productId),
    loadModifierGroups(productId),
    catalogRepo.listCategories({ isActive: true }),
    reviewRepo.getProductRatingSummary(productId),
    userId ? userRepo.isFavorite(userId, productId) : Promise.resolve(false),
  ]);

  return shapeProductDetail({
    product,
    variants,
    images,
    modifierGroups,
    categories: resolveCategoryPath(categoryRows, String(product.categoryId ?? '')),
    rating: rating as Record<string, unknown> | null,
    isFavorite: Boolean(favorite),
    at,
  });
}

// --------------------------------------------------------------------------
// GET /products
// --------------------------------------------------------------------------

function buildProductFilters(query: ListProductQuery): catalogRepo.ProductFilters {
  return {
    categoryId: query.categoryId,
    parentCategoryId: query.parentCategoryId,
    categorySlug: query.categorySlug,
    productKind: query.productKind,
    isFeatured: query.isFeatured,
    branchId: query.branchId,
    availableAt: query.availableAt,
    serviceType: query.serviceType,
    minPriceIdr: query.minPriceIdr,
    maxPriceIdr: query.maxPriceIdr,
    q: query.q,
    sort: query.sort,
    includeModifiers: query.includeModifiers,
    includeImages: query.includeImages,
  };
}

export async function listProducts(query: ListProductQuery, userId?: string | null): Promise<Paginated<unknown>> {
  const paging = parsePagination(query);
  const filters = buildProductFilters(query);
  const parsedAt = query.availableAt ? new Date(query.availableAt) : new Date();
  const at = Number.isNaN(parsedAt.getTime()) ? new Date() : parsedAt;

  const rows = await catalogRepo.listProducts(filters, paging);

  const favoriteIds = userId
    ? await userRepo.favoriteProductIds(userId, rows.map((row) => String(row.id)))
    : new Set<string>();

  // Galeri sudah ikut di-select oleh query list, jadi includeImages=false tidak
  // memanggil listProductImagesBulk sama sekali (hemat satu query).
  // Group modifier juga sudah ikut di-select; opsi diambil batch satu query
  // supaya urutan dan harga delta konsisten dengan detail produk.
  let optionsByGroup: Map<string, OpsiModifier[]> | undefined;
  if (filters.includeModifiers) {
    const groupIds = new Set<string>();
    for (const row of rows) {
      const groups = json<Record<string, unknown>[]>(row.modifierGroups, []);
      for (const group of groups) {
        const id = group.groupId ?? group.id;
        if (id) groupIds.add(String(id));
      }
    }
    if (groupIds.size > 0) {
      const optionRows = await catalogRepo.listModifierOptionsForGroups([...groupIds]);
      optionsByGroup = new Map<string, OpsiModifier[]>();
      for (const row of optionRows) {
        const groupId = String(row.groupId);
        const list = optionsByGroup.get(groupId) ?? [];
        list.push(shapeOption(row));
        optionsByGroup.set(groupId, list);
      }
    }
  }

  const items = rows.map((row) => {
    const images = filters.includeImages ? shapeGallery(row.gallery) : [];
    const primaryImage = images.find((image) => image.isPrimary) ?? images[0] ?? null;
    const modifierGroups = filters.includeModifiers
      ? shapeModifierGroupsFromJson(row.modifierGroups).map((group) => ({
          ...group,
          options: (optionsByGroup?.get(group.id) ?? group.options).slice(0, MAX_MODIFIER_OPTIONS),
        }))
      : [];

    return {
      id: String(row.id),
      slug: String(row.slug ?? ''),
      name: String(row.name ?? ''),
      descriptionShort: truncate(row.description),
      productKind: strOrNull(row.productKind),
      isFeatured: bool(row.isFeatured),
      isActive: bool(row.isActive),
      basePriceIdr: row.minPriceIdr === null || row.minPriceIdr === undefined ? null : num(row.minPriceIdr),
      maxPriceIdr: row.maxPriceIdr === null || row.maxPriceIdr === undefined ? null : num(row.maxPriceIdr),
      imageUrl: primaryImage ? primaryImage.url : strOrNull(row.imageUrl),
      category: shapeCategoryRef(row),
      rating: shapeListRating(row),
      isFavorite: userId ? favoriteIds.has(String(row.id)) : false,
      isAvailable: isProductAvailableAt(row, at),
      images,
      modifierGroups,
    };
  });

  const total = await catalogRepo.countProducts(filters, favoriteIds);
  const pagination: Pagination = { page: paging.page, limit: paging.limit, offset: paging.offset, total };

  return { items, meta: buildPaginationMeta(pagination) };
}

// --------------------------------------------------------------------------
// GET /products/:id/availability
// --------------------------------------------------------------------------
export async function checkAvailability(productId: string, query: ListProductAvailabilityQuery) {
  const product = await catalogRepo.findProductById(productId);
  if (!product) throw notFound('Produk', productId);

  let at = new Date();
  if (query.date) {
    const parsed = new Date(query.date);
    if (Number.isNaN(parsed.getTime())) throw badRequest('Parameter date harus format tanggal waktu yang valid');
    at = parsed;
  }

  const branchId = query.branchId ?? null;

  const [availabilityRaw, rules] = await Promise.all([
    catalogRepo.checkProductAvailability(productId, branchId, at),
    catalogRepo.findProductAvailability(productId, branchId ?? undefined),
  ]);

  // Generic eksplisit di repository masih snake_case, sementara one() selalu
  // me-camelize baris, jadi field dibaca lewat bentuk camelCase.
  const availability = availabilityRaw as Record<string, unknown> | null;

  return {
    product: {
      id: String(product.id),
      slug: String(product.slug ?? ''),
      name: String(product.name ?? ''),
      isActive: bool(product.isActive),
    },
    branchId,
    checkedAt: at.toISOString(),
    isAvailable: bool(availability?.isAvailable, true),
    reason: strOrNull(availability?.reason),
    schedules: rules.map((row) => ({
      id: String(row.id),
      branchId: row.branchId === null || row.branchId === undefined ? null : String(row.branchId),
      dayOfWeek: row.dayOfWeek === null || row.dayOfWeek === undefined ? null : num(row.dayOfWeek),
      startsAt: iso(row.startsAt),
      endsAt: iso(row.endsAt),
      startsOn: iso(row.startsOn),
      endsOn: iso(row.endsOn),
      isAvailable: bool(row.isAvailable),
    })),
  };
}

export async function getProductVariants(productId: string) {
  const product = await catalogRepo.findProductById(productId);
  if (!product || !bool(product.isActive)) throw notFound('Produk', productId);

  const variants = await catalogRepo.listVariants(productId);
  return variants.map((row) => shapeVariant(row, []));
}

export async function getProductModifiers(productId: string) {
  const product = await catalogRepo.findProductById(productId);
  if (!product || !bool(product.isActive)) throw notFound('Produk', productId);

  return loadModifierGroups(productId);
}

export async function getProductImages(productId: string) {
  const product = await catalogRepo.findProductById(productId);
  if (!product || !bool(product.isActive)) throw notFound('Produk', productId);

  const images = await catalogRepo.listProductImages(productId);
  return images.map(shapeImage);
}

export async function getCategoryBySlug(slug: string, query: ListProductQuery) {
  const category = await catalogRepo.findCategoryBySlug(slug);
  if (!category || !bool(category.isActive)) throw notFound('Kategori', slug);

  const paging = parsePagination(query);
  const filters: catalogRepo.ProductFilters = {
    categoryId: String(category.id),
  } as catalogRepo.ProductFilters;
  const merged = { ...filters, ...(query as any) } as catalogRepo.ProductFilters;
  const [products, count] = await Promise.all([
    catalogRepo.listProducts(merged, paging, new Set<string>()),
    catalogRepo.countProducts(merged),
  ]);
  return {
    category: shapeCategory(category),
    products,
    meta: buildPaginationMeta({ ...paging, total: count }),
  };
}