import { Router } from 'express';
import * as inventoryController from '../controllers/inventory.controller.js';
import { ACTIONS, RESOURCES } from '../config/constants.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { authenticate } from '../middlewares/authenticate.js';
import { readLimiter, writeLimiter } from '../middlewares/rateLimit.js';
import { requirePermission, requireStaff } from '../middlewares/rbac.js';
import { validate } from '../middlewares/validate.js';
import { uuidParamSchema } from '../validators/common.validator.js';
import {
  createIngredientSchema,
  createMovementSchema,
  createStockLocationSchema,
  listIngredientQuerySchema,
  listMovementQuerySchema,
  listRecipeQuerySchema,
  listStockLocationQuerySchema,
  stockSnapshotQuerySchema,
  updateIngredientSchema,
  upsertRecipeSchema,
} from '../validators/inventory.validator.js';

export const inventoryRouter = Router();

// GET /admin/ingredients - daftar bahan baku (bisa disaring stok menipis)
inventoryRouter.get(
  '/admin/ingredients',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.INVENTORY, ACTIONS.READ),
  readLimiter,
  validate({ query: listIngredientQuerySchema }),
  asyncHandler(inventoryController.listIngredients),
);

// POST /admin/ingredients - tambah bahan baku baru
inventoryRouter.post(
  '/admin/ingredients',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.INVENTORY, ACTIONS.CREATE),
  writeLimiter,
  validate({ body: createIngredientSchema }),
  asyncHandler(inventoryController.createIngredient),
);

// GET /admin/ingredients/:id - detail bahan baku beserta pemakaian di resep
inventoryRouter.get(
  '/admin/ingredients/:id',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.INVENTORY, ACTIONS.READ),
  readLimiter,
  validate({ params: uuidParamSchema }),
  asyncHandler(inventoryController.ingredientDetail),
);

// PATCH /admin/ingredients/:id - ubah nama, satuan, reorder level, atau status aktif
inventoryRouter.patch(
  '/admin/ingredients/:id',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.INVENTORY, ACTIONS.UPDATE),
  writeLimiter,
  validate({ params: uuidParamSchema, body: updateIngredientSchema }),
  asyncHandler(inventoryController.updateIngredient),
);

// GET /admin/recipes - komposisi bahan per varian produk
inventoryRouter.get(
  '/admin/recipes',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.INVENTORY, ACTIONS.READ),
  readLimiter,
  validate({ query: listRecipeQuerySchema }),
  asyncHandler(inventoryController.listRecipes),
);

// PUT /admin/recipes - ganti seluruh bahan pembentuk satu varian produk
inventoryRouter.put(
  '/admin/recipes',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.INVENTORY, ACTIONS.UPDATE),
  writeLimiter,
  validate({ body: upsertRecipeSchema }),
  asyncHandler(inventoryController.saveRecipe),
);

// GET /admin/stock-locations - daftar lokasi stok per cabang
inventoryRouter.get(
  '/admin/stock-locations',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.INVENTORY, ACTIONS.READ),
  readLimiter,
  validate({ query: listStockLocationQuerySchema }),
  asyncHandler(inventoryController.listStockLocations),
);

// POST /admin/stock-locations - tambah lokasi stok (mis. gudang atau cold storage)
inventoryRouter.post(
  '/admin/stock-locations',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.INVENTORY, ACTIONS.CREATE),
  writeLimiter,
  validate({ body: createStockLocationSchema }),
  asyncHandler(inventoryController.createStockLocation),
);

// GET /admin/stock/movements - buku besar mutasi stok
inventoryRouter.get(
  '/admin/stock/movements',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.INVENTORY, ACTIONS.READ),
  readLimiter,
  validate({ query: listMovementQuerySchema }),
  asyncHandler(inventoryController.listMovements),
);

// POST /admin/stock/movements - catat mutasi stok, satu-satunya cara mengubah stok
inventoryRouter.post(
  '/admin/stock/movements',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.INVENTORY, ACTIONS.CREATE),
  writeLimiter,
  validate({ body: createMovementSchema }),
  asyncHandler(inventoryController.createMovement),
);

// GET /admin/stock/snapshot - saldo stok terkini beserta penanda stok menipis
inventoryRouter.get(
  '/admin/stock/snapshot',
  authenticate,
  requireStaff,
  requirePermission(RESOURCES.INVENTORY, ACTIONS.READ),
  readLimiter,
  validate({ query: stockSnapshotQuerySchema }),
  asyncHandler(inventoryController.stockSnapshot),
);