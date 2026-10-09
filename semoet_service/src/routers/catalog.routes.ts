import { Router } from 'express';
import { z } from 'zod';
import * as catalogController from '../controllers/catalog.controller.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { optionalAuthenticate } from '../middlewares/authenticate.js';
import { readLimiter } from '../middlewares/rateLimit.js';
import { validate } from '../middlewares/validate.js';
import {
  featuredPlacementParamSchema,
  listCategoryQuerySchema,
  listFeaturedQuerySchema,
  listProductQuerySchema,
  listProductReviewQuerySchema,
  productAvailabilityQuerySchema,
  productIdParamSchema,
  productSlugParamSchema,
} from '../validators/catalog.validator.js';
import { uuidSchema } from '../validators/common.validator.js';

/**
 * Query daftar review publik. Schema bawaan tidak menyertakan productId,
 * jadi ditambah di sini karena endpoint review publik ikut me-mount di katalog.
 */
const listReviewsQuerySchema = listProductReviewQuerySchema.extend({ productId: uuidSchema });

export const catalogRouter = Router();

// GET /categories - katalog publik
catalogRouter.get(
  '/categories',
  validate({ query: listCategoryQuerySchema }),
  asyncHandler(catalogController.listCategories),
);

// GET /products - publik; isFavorite hanya terisi bila user login
catalogRouter.get(
  '/products',
  optionalAuthenticate,
  readLimiter,
  validate({ query: listProductQuerySchema }),
  asyncHandler(catalogController.listProducts),
);

// GET /products/featured/:placement - wajib didaftarkan sebelum /products/:slug
// supaya path "featured" tidak tertangkap sebagai slug produk.
catalogRouter.get(
  '/products/featured/:placement',
  readLimiter,
  validate({ params: featuredPlacementParamSchema, query: listFeaturedQuerySchema }),
  asyncHandler(catalogController.listFeatured),
);

// GET /categories/:slug
catalogRouter.get(
  '/categories/:slug',
  readLimiter,
  validate({ params: z.object({ slug: z.string().min(1) }), query: listProductQuerySchema }),
  asyncHandler(catalogController.getCategoryBySlug),
);

// GET /products/:slug - detail produk publik
catalogRouter.get(
  '/products/:slug',
  optionalAuthenticate,
  readLimiter,
  validate({ params: productSlugParamSchema }),
  asyncHandler(catalogController.productDetail),
);

// GET /products/:id/variants
catalogRouter.get(
  '/products/:id/variants',
  readLimiter,
  validate({ params: productIdParamSchema }),
  asyncHandler(catalogController.productVariants),
);

// GET /products/:id/modifiers
catalogRouter.get(
  '/products/:id/modifiers',
  readLimiter,
  validate({ params: productIdParamSchema }),
  asyncHandler(catalogController.productModifiers),
);

// GET /products/:id/images
catalogRouter.get(
  '/products/:id/images',
  readLimiter,
  validate({ params: productIdParamSchema }),
  asyncHandler(catalogController.productImages),
);

// GET /products/:id/reviews
catalogRouter.get(
  '/products/:id/reviews',
  readLimiter,
  validate({ params: productIdParamSchema, query: listProductReviewQuerySchema }),
  asyncHandler(catalogController.listProductReviews),
);

// GET /reviews - daftar review publik untuk satu produk
catalogRouter.get(
  '/reviews',
  readLimiter,
  validate({ query: listReviewsQuerySchema }),
  asyncHandler(catalogController.listProductReviews),
);

// GET /products/:id/availability - jadwal ketersediaan produk
catalogRouter.get(
  '/products/:id/availability',
  optionalAuthenticate,
  validate({ params: productIdParamSchema, query: productAvailabilityQuerySchema }),
  asyncHandler(catalogController.productAvailability),
);