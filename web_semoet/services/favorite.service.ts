/** Endpoint /api/v1/favorites — produk favorit milik user. */
import { api, request } from './client';

import type { FavoriteProduct, Paginated } from '@/types/api';

export async function listFavorites(page = 1, limit = 20): Promise<Paginated<FavoriteProduct>> {
  const res = await request<FavoriteProduct[]>('/me/favorites', { query: { page, limit }, auth: true });
  return { items: res.data, meta: res.meta };
}

export function addFavorite(productId: string): Promise<unknown> {
  return api('/me/favorites', { method: 'POST', body: { productId }, auth: true });
}

export function removeFavorite(productId: string): Promise<unknown> {
  return api(`/me/favorites/${productId}`, { method: 'DELETE', auth: true });
}
