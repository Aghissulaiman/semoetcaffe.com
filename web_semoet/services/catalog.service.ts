/** Endpoint /api/v1/categories & /products — katalog publik. */
import { api, request } from './client';

import type { Paginated, Product, ProductCategory, ProductDetail, Review } from '@/types/api';

export type ProductSort = 'name' | 'price_asc' | 'price_desc' | 'newest' | 'popular' | 'featured';

export interface ListProductsParams {
  page?: number;
  limit?: number;
  /** Diterjemahkan ke query `q` di backend. */
  search?: string;
  categoryId?: string;
  categorySlug?: string;
  productKind?: string;
  branchId?: string;
  sort?: ProductSort;
  isFeatured?: boolean;
}

export async function listCategories(): Promise<Paginated<ProductCategory>> {
  const res = await request<ProductCategory[]>('/categories', {
    query: { limit: 50, isActive: true },
    auth: false,
  });
  return { items: res.data, meta: res.meta };
}

export async function listProducts(params: ListProductsParams = {}): Promise<Paginated<Product>> {
  const { search, ...rest } = params;
  const res = await request<Product[]>('/products', {
    query: { ...rest, q: search ?? undefined, limit: params.limit ?? 20 },
    auth: true,
  });
  return { items: res.data, meta: res.meta };
}

export function getProductDetail(slug: string): Promise<ProductDetail> {
  return api<ProductDetail>(`/products/${slug}`, { auth: true });
}

export async function listProductReviews(productId: string, page = 1, limit = 5): Promise<Paginated<Review>> {
  const res = await request<Review[]>(`/products/${productId}/reviews`, {
    query: { page, limit },
    auth: false,
  });
  return { items: res.data, meta: res.meta };
}
