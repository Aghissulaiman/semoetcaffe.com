import type { Request, Response } from 'express';
import * as inventoryService from '../services/inventory.service.js';
import { sendCreated, sendPaginated, sendSuccess } from '../utils/response.js';
import { getBody, getParams, getQuery, getUserId } from '../utils/request.js';
import type {
  CreateIngredientInput,
  CreateMovementInput,
  ListIngredientQuery,
  ListMovementQuery,
  ListRecipeQuery,
  UpdateIngredientInput,
  UpsertRecipeInput,
} from '../validators/inventory.validator.js';
import type {
  CreateStockLocationInput,
  ListStockLocationQuery,
  StockSnapshotQuery,
} from '../services/inventory.service.js';

// GET /admin/ingredients
export async function listIngredients(req: Request, res: Response): Promise<Response> {
  const result = await inventoryService.listIngredients(getQuery<ListIngredientQuery>(req));
  return sendPaginated(res, result.items, {
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
  });
}

// POST /admin/ingredients
export async function createIngredient(req: Request, res: Response): Promise<Response> {
  const data = await inventoryService.createIngredient(getBody<CreateIngredientInput>(req));
  return sendCreated(res, data);
}

// GET /admin/ingredients/:id
export async function ingredientDetail(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await inventoryService.ingredientDetail(id);
  return sendSuccess(res, data);
}

// PATCH /admin/ingredients/:id
export async function updateIngredient(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const body = getBody<UpdateIngredientInput>(req);
  const data = await inventoryService.updateIngredient(id, body);
  return sendSuccess(res, data);
}

// GET /admin/recipes
export async function listRecipes(req: Request, res: Response): Promise<Response> {
  const result = await inventoryService.listRecipes(getQuery<ListRecipeQuery>(req));
  return sendPaginated(res, result.items, {
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
  });
}

// PUT /admin/recipes
export async function saveRecipe(req: Request, res: Response): Promise<Response> {
  const body = getBody<UpsertRecipeInput>(req);
  const data = await inventoryService.saveRecipe(body);
  return sendSuccess(res, data);
}

// GET /admin/stock-locations
export async function listStockLocations(req: Request, res: Response): Promise<Response> {
  const result = await inventoryService.listStockLocations(getQuery<ListStockLocationQuery>(req));
  return sendPaginated(res, result.items, {
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
  });
}

// POST /admin/stock-locations
export async function createStockLocation(req: Request, res: Response): Promise<Response> {
  const body = getBody<CreateStockLocationInput>(req);
  const data = await inventoryService.createStockLocation(body);
  return sendCreated(res, data);
}

// GET /admin/stock/movements
export async function listMovements(req: Request, res: Response): Promise<Response> {
  const result = await inventoryService.listMovements(getQuery<ListMovementQuery>(req));
  return sendPaginated(res, result.items, {
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
  });
}

// POST /admin/stock/movements
export async function createMovement(req: Request, res: Response): Promise<Response> {
  const body = getBody<CreateMovementInput>(req);
  const data = await inventoryService.createMovement(getUserId(req), body);
  return sendCreated(res, data);
}

// GET /admin/stock/snapshot
export async function stockSnapshot(req: Request, res: Response): Promise<Response> {
  const query = getQuery<StockSnapshotQuery>(req);
  const data = await inventoryService.stockSnapshot(query);
  return sendSuccess(res, data);
}