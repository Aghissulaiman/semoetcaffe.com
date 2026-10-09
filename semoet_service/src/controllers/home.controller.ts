import type { Request, Response } from 'express';
import { z } from 'zod';
import * as homeService from '../services/home.service.js';
import { sendSuccess } from '../utils/response.js';
import { getParams, getQuery } from '../utils/request.js';
import {
  homeQuerySchema,
  listBannerQuerySchema,
  listFeaturedQuerySchema,
  type ListFeaturedQuery,
} from '../validators/catalog.validator.js';

/** Parse query sebagai fallback supaya controller aman tanpa middleware validate. */
function parseQuery<T>(schema: z.ZodTypeAny, query: unknown): T {
  const parsed = schema.safeParse(query ?? {});
  return (parsed.success ? parsed.data : query) as T;
}

// GET /home
export async function home(req: Request, res: Response): Promise<Response> {
  const query = parseQuery<homeService.HomeQuery>(homeQuerySchema, getQuery(req));
  const data = await homeService.getHome(query);
  return sendSuccess(res, data);
}

// GET /banners
export async function listBanners(req: Request, res: Response): Promise<Response> {
  const query = parseQuery<homeService.ListBannerQuery>(listBannerQuerySchema, getQuery(req));
  const data = await homeService.listBanners(query);
  return sendSuccess(res, data);
}

// GET /banners/:id
export async function bannerDetail(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await homeService.getBanner(id);
  return sendSuccess(res, data);
}

// GET /placements
export async function listPlacements(_req: Request, res: Response): Promise<Response> {
  const data = await homeService.listPlacements();
  return sendSuccess(res, data);
}

// GET /placements/:placement/products
export async function listPlacementProducts(req: Request, res: Response): Promise<Response> {
  const { placement } = getParams<{ placement: string }>(req);
  const query = parseQuery<ListFeaturedQuery>(listFeaturedQuerySchema, getQuery(req));
  // Nilai placement sudah dijamin enum oleh featuredPlacementParamSchema.
  const data = await homeService.listPlacementProducts({
    ...query,
    placement: placement as ListFeaturedQuery['placement'],
  });
  return sendSuccess(res, data);
}

// GET /categories/overview
export async function categoryOverview(_req: Request, res: Response): Promise<Response> {
  const data = await homeService.getCategoryOverview();
  return sendSuccess(res, data);
}