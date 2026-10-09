import { Router } from 'express';
import * as homeController from '../controllers/home.controller.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { readLimiter } from '../middlewares/rateLimit.js';
import { validate } from '../middlewares/validate.js';
import {
  featuredPlacementParamSchema,
  homeQuerySchema,
  listBannerQuerySchema,
  listFeaturedQuerySchema,
} from '../validators/catalog.validator.js';
import { uuidParamSchema } from '../validators/common.validator.js';

export const homeRouter = Router();

// GET /home - payload gabungan untuk halaman beranda
homeRouter.get(
  '/home',
  readLimiter,
  validate({ query: homeQuerySchema }),
  asyncHandler(homeController.home),
);

// GET /banners - banner yang sedang aktif
homeRouter.get(
  '/banners',
  validate({ query: listBannerQuerySchema }),
  asyncHandler(homeController.listBanners),
);

// GET /banners/:id
homeRouter.get(
  '/banners/:id',
  validate({ params: uuidParamSchema }),
  asyncHandler(homeController.bannerDetail),
);

// GET /placements - daftar placement aktif beserta labelnya
homeRouter.get(
  '/placements',
  asyncHandler(homeController.listPlacements),
);

// GET /placements/:placement/products
homeRouter.get(
  '/placements/:placement/products',
  readLimiter,
  validate({ params: featuredPlacementParamSchema, query: listFeaturedQuerySchema }),
  asyncHandler(homeController.listPlacementProducts),
);

// GET /categories/overview - jumlah produk per kategori beserta tree
homeRouter.get(
  '/categories/overview',
  asyncHandler(homeController.categoryOverview),
);