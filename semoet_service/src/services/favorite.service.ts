import * as userRepo from '../repositories/user.repository.js';
import { buildPaginationMeta, parsePagination, type Pagination } from '../utils/pagination.js';
import type { AddFavoriteInput, ListFavoriteQuery } from '../validators/user.validator.js';
export type { AddFavoriteInput };
import { notFound } from '../errors/AppError.js';

export interface Paginated<T> {
  items: T[];
  meta: ReturnType<typeof buildPaginationMeta>;
}

function shapeFavorite(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    productKind: row.productKind ?? row.product_kind,
    isFeatured: Boolean(row.isFeatured ?? row.is_featured),
    sortOrder: row.sortOrder ?? row.sort_order,
    availableFrom: row.availableFrom ?? row.available_from,
    availableUntil: row.availableUntil ?? row.available_until,
    favoritedAt: row.favoritedAt ?? row.favorited_at,
    minPriceIdr: Number(row.minPriceIdr ?? row.min_price_idr ?? 0),
    maxPriceIdr: Number(row.maxPriceIdr ?? row.max_price_idr ?? 0),
    imageUrl: row.imageUrl ?? row.image_url,
    categoryName: row.categoryName ?? row.category_name,
    categorySlug: row.categorySlug ?? row.category_slug,
  };
}

export async function listFavorites(userId: string, query: ListFavoriteQuery): Promise<Paginated<unknown>> {
  const paging = parsePagination(query);
  const rows = await userRepo.listFavorites(userId, paging);
  const total = await userRepo.countFavorites(userId);

  const pagination: Pagination = {
    page: paging.page,
    limit: paging.limit,
    offset: paging.offset,
    total,
  };

  return {
    items: rows.map(shapeFavorite),
    meta: buildPaginationMeta(pagination),
  };
}

export async function addFavorite(userId: string, input: AddFavoriteInput) {
  const exists = await userRepo.productExists(input.productId);
  if (!exists) {
    throw notFound('Produk', input.productId);
  }

  const result = await userRepo.addFavorite(userId, input.productId);
  if (result) {
    return {
      userId: result.user_id,
      productId: result.product_id,
      createdAt: result.created_at,
    };
  }

  return {
    userId,
    productId: input.productId,
    createdAt: new Date().toISOString(),
  };
}

export async function removeFavorite(userId: string, productId: string) {
  await userRepo.removeFavorite(userId, productId);
  return { deleted: true };
}

export async function getFavoriteIds(userId: string, productIds: string[] = []) {
  if (productIds.length === 0) {
    const paging = { page: 1, limit: 1000, offset: 0 };
    const rows = await userRepo.listFavorites(userId, paging);
    const ids = rows.map((r: any) => r.id);
    return { ids };
  }
  const idsSet = await userRepo.favoriteProductIds(userId, productIds);
  return { ids: Array.from(idsSet) };
}