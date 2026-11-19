/** Endpoint /api/v1/home, /banners, /placements, /categories/overview. */
import { api } from './client';

import type { HomePayload, Placement, HomeProduct, ProductCategory, HomeBanner } from '@/types/api';

export function getHome(branchId?: string): Promise<HomePayload> {
  return api<HomePayload>('/home', { query: { branchId }, auth: false });
}

export function listBanners(): Promise<HomeBanner[]> {
  return api<HomeBanner[]>('/banners', { auth: false });
}

export function listPlacementProducts(
  placement: Placement,
  page = 1,
  limit = 20,
): Promise<HomeProduct[]> {
  return api<HomeProduct[]>(`/placements/${placement}/products`, {
    query: { page, limit },
    auth: false,
  });
}

export function getCategoryOverview(): Promise<{ items: ProductCategory[]; tree: ProductCategory[] }> {
  return api('/categories/overview', { auth: false });
}
