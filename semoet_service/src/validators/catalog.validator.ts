import { z } from 'zod';
import {
  FEATURED_PLACEMENT,
  PRODUCT_KIND,
  SERVICE_TYPE,
} from '../config/constants.js';
import { booleanQuery, slugParamSchema, uuidSchema } from './common.validator.js';

// --------------------------------------------------------------------------
// Branch (/branches)
// --------------------------------------------------------------------------
export const listBranchQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  isActive: booleanQuery.optional(),
  q: z.string().trim().max(120).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  /** Radius pencarian terdekat dalam kilometer. */
  radiusKm: z.coerce.number().positive().max(200).optional(),
});

export const branchIdParamSchema = z.object({ id: uuidSchema });

export const listTableQuerySchema = z.object({
  areaId: uuidSchema.optional(),
  isActive: booleanQuery.optional(),
  minCapacity: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const tableQrParamSchema = z.object({
  token: z.string().trim().min(8).max(255),
});

// --------------------------------------------------------------------------
// Category & product
// --------------------------------------------------------------------------
export const listCategoryQuerySchema = z.object({
  isActive: booleanQuery.optional(),
  parentId: z.string().optional(),
  includeChildren: booleanQuery.default(true),
});

export const listProductQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(60).default(20),
  categoryId: uuidSchema.optional(),
  categorySlug: z.string().trim().max(180).optional(),
  parentCategoryId: uuidSchema.optional(),
  productKind: z.enum(PRODUCT_KIND).optional(),
  isFeatured: booleanQuery.optional(),
  isActive: booleanQuery.optional(),
  /** Saring produk yang tersedia di cabang + tanggal tertentu. */
  branchId: uuidSchema.optional(),
  availableAt: z.string().optional(),
  serviceType: z.enum(SERVICE_TYPE).optional(),
  minPriceIdr: z.coerce.number().int().min(0).optional(),
  maxPriceIdr: z.coerce.number().int().min(0).optional(),
  q: z.string().trim().max(120).optional(),
  sort: z
    .enum(['name', 'price_asc', 'price_desc', 'newest', 'popular', 'featured'])
    .default('featured'),
  includeModifiers: booleanQuery.default(false),
  includeImages: booleanQuery.default(true),
});

/** Admin boleh memuat lebih banyak produk untuk pemilih promo. */
export const listAdminProductQuerySchema = listProductQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const productSlugParamSchema = slugParamSchema;

export const productIdParamSchema = z.object({ id: uuidSchema });

export const productAvailabilityQuerySchema = z.object({
  branchId: uuidSchema.optional(),
  date: z.string().optional(),
});

export const listProductReviewQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  minRating: z.coerce.number().int().min(1).max(5).optional(),
  sort: z.enum(['recent', 'rating_desc', 'rating_asc']).default('recent'),
});

// --------------------------------------------------------------------------
// Home
// --------------------------------------------------------------------------
export const homeQuerySchema = z.object({
  branchId: uuidSchema.optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
});

export const listBannerQuerySchema = z.object({
  isActive: booleanQuery.optional(),
  at: z.string().optional(),
});

export const featuredPlacementParamSchema = z.object({
  placement: z.enum(FEATURED_PLACEMENT),
});

export const listFeaturedQuerySchema = z.object({
  placement: z.enum(FEATURED_PLACEMENT).optional(),
  at: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type ListBranchQuery = z.infer<typeof listBranchQuerySchema>;
export type ListProductQuery = z.infer<typeof listProductQuerySchema>;
export type ListTableQuery = z.infer<typeof listTableQuerySchema>;
export type ListProductReviewQuery = z.infer<typeof listProductReviewQuerySchema>;
export type ListFeaturedQuery = z.infer<typeof listFeaturedQuerySchema>;