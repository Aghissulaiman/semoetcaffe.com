import type { Request, Response } from 'express';
import { z } from 'zod';
import * as catalogService from '../services/catalog.service.js';
import * as homeService from '../services/home.service.js';
import * as reviewService from '../services/review.service.js';
import { sendPaginated, sendSuccess } from '../utils/response.js';
import { getParams, getQuery } from '../utils/request.js';
import {
  listCategoryQuerySchema,
  listFeaturedQuerySchema,
  listProductQuerySchema,
  listProductReviewQuerySchema,
  productAvailabilityQuerySchema,
  type ListFeaturedQuery,
  type ListProductQuery,
} from '../validators/catalog.validator.js';
import { uuidSchema } from '../validators/common.validator.js';

/**
 * Query daftar review publik. Schema review bawaan tidak punya productId,
 * jadi digabung di sini karena endpoint ini tetap milik router katalog.
 */
const listReviewsQuerySchema = listProductReviewQuerySchema.extend({ productId: uuidSchema });

type ListReviewsQuery = z.infer<typeof listReviewsQuerySchema>;

/**
 * Parse query sebagai fallback supaya controller tetap aman dipanggil tanpa
 * middleware validate (mis. saat smoke test langsung).
 */
function parseQuery<T>(schema: z.ZodTypeAny, query: unknown): T {
  const parsed = schema.safeParse(query ?? {});
  return (parsed.success ? parsed.data : query) as T;
}

/** User id opsional untuk endpoint publik (hasil optionalAuthenticate). */
function optionalUserId(req: Request): string | null {
  return req.user?.id ?? null;
}

// GET /categories
export async function listCategories(req: Request, res: Response): Promise<Response> {
  const query = parseQuery<catalogService.ListCategoryQuery>(listCategoryQuerySchema, getQuery(req));
  const data = await catalogService.listCategories(query);
  return sendSuccess(res, data.items, {
    meta: { total: data.items.length, tree: data.tree },
  });
}

// GET /products
export async function listProducts(req: Request, res: Response): Promise<Response> {
  const query = parseQuery<z.infer<typeof listProductQuerySchema>>(listProductQuerySchema, getQuery(req));
  const result = await catalogService.listProducts(query, optionalUserId(req));
  return sendPaginated(res, result.items, {
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
  });
}

// GET /products/featured/:placement
export async function listFeatured(req: Request, res: Response): Promise<Response> {
  const { placement } = getParams<{ placement: string }>(req);
  const query = parseQuery<ListFeaturedQuery>(listFeaturedQuerySchema, getQuery(req));
  // Nilai placement sudah dijamin enum oleh featuredPlacementParamSchema.
  const data = await homeService.listPlacementProducts({
    ...query,
    placement: placement as ListFeaturedQuery['placement'],
  });
  return sendSuccess(res, data);
}

// GET /products/:slug
export async function productDetail(req: Request, res: Response): Promise<Response> {
  const { slug } = getParams<{ slug: string }>(req);
  const data = await catalogService.getProductBySlug(slug, optionalUserId(req));
  return sendSuccess(res, data);
}

// GET /products/:id/availability
export async function productAvailability(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const query = parseQuery<catalogService.ListProductAvailabilityQuery>(
    productAvailabilityQuerySchema,
    getQuery(req),
  );
  const data = await catalogService.checkAvailability(id, query);
  return sendSuccess(res, data);
}

// GET /reviews
export async function listProductReviews(req: Request, res: Response): Promise<Response> {
  const query = parseQuery<ListReviewsQuery>(listReviewsQuerySchema, getQuery(req));
  // Route /products/:id/reviews menaruh productId di params, bukan query.
  const { id } = getParams<{ id?: string }>(req);
  const productId = id ?? query.productId;
  const result = await reviewService.listProductReviews(productId, query);
  return sendPaginated(
    res,
    result.items,
    { page: result.meta.page, limit: result.meta.limit, total: result.meta.total },
    { rating: result.rating },
  );
}

export async function getCategoryBySlug(req: Request, res: Response): Promise<Response> {
  const { slug } = getParams<{ slug: string }>(req);
  const query = parseQuery<ListProductQuery>(listProductQuerySchema, getQuery(req));
  const data = await catalogService.getCategoryBySlug(slug, query);
  return sendPaginated(
    res,
    data.products,
    { page: data.meta.page, limit: data.meta.limit, total: data.meta.total },
    { category: data.category },
  );
}

export async function productVariants(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await catalogService.getProductVariants(id);
  return sendSuccess(res, data);
}

export async function productModifiers(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await catalogService.getProductModifiers(id);
  return sendSuccess(res, data);
}

export async function productImages(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await catalogService.getProductImages(id);
  return sendSuccess(res, data);
}