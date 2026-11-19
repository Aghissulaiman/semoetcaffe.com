import type { Request, Response } from 'express';
import * as inventoryService from '../services/inventory.service.js';
import { sendCreated, sendPaginated, sendSuccess } from '../utils/response.js';
import { getBody, getIp, getParams, getQuery, getUserId } from '../utils/request.js';
import type {
  CancelStockDocumentInput,
  CreateIngredientInput,
  CreateMovementInput,
  CreateStockOpnameInput,
  CreateStockOutInput,
  ListIngredientQuery,
  ListMovementQuery,
  ListRecipeQuery,
  ListStockOpnameQuery,
  ListStockOutQuery,
  StockSummaryQuery,
  TransferStockInput,
  UpdateIngredientInput,
  UpdateStockOpnameInput,
  UpdateStockOutInput,
  UpsertRecipeInput,
} from '../validators/inventory.validator.js';
import type {
  CreateStockLocationInput,
  ListStockLocationQuery,
  StockSnapshotQuery,
} from '../services/inventory.service.js';

/** Konteks audit dari request untuk halaman Aktivitas Sistem. */
function auditContext(req: Request) {
  return { requestId: req.requestId ?? null, ipAddress: getIp(req) };
}

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
  const data = await inventoryService.createIngredient(
    getUserId(req),
    getBody<CreateIngredientInput>(req),
    auditContext(req),
  );
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
  const data = await inventoryService.updateIngredient(id, getUserId(req), body, auditContext(req));
  return sendSuccess(res, data);
}

// DELETE /admin/ingredients/:id - hapus bahan baku yang belum dipakai resep
export async function deleteIngredient(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await inventoryService.deleteIngredient(id, getUserId(req), auditContext(req));
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
  const data = await inventoryService.saveRecipe(getUserId(req), body, auditContext(req));
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
  const data = await inventoryService.createStockLocation(
    getUserId(req),
    body,
    auditContext(req),
  );
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
  const data = await inventoryService.createMovement(getUserId(req), body, auditContext(req));
  return sendCreated(res, data);
}

// POST /admin/stock/transfers - pindahkan bahan antar lokasi (gudang → outlet)
export async function transferStock(req: Request, res: Response): Promise<Response> {
  const body = getBody<TransferStockInput>(req);
  const data = await inventoryService.transferStock(getUserId(req), body, auditContext(req));
  return sendCreated(res, data);
}

// GET /admin/stock/snapshot
export async function stockSnapshot(req: Request, res: Response): Promise<Response> {
  const query = getQuery<StockSnapshotQuery>(req);
  const data = await inventoryService.stockSnapshot(query);
  return sendSuccess(res, data);
}

// GET /admin/stock/summary
export async function stockSummary(req: Request, res: Response): Promise<Response> {
  const data = await inventoryService.stockSummary(getQuery<StockSummaryQuery>(req));
  return sendSuccess(res, data);
}

// GET /admin/stock-outs
export async function listStockOuts(req: Request, res: Response): Promise<Response> {
  const result = await inventoryService.listStockOuts(getQuery<ListStockOutQuery>(req));
  return sendPaginated(res, result.items, {
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
  });
}

// POST /admin/stock-outs
export async function createStockOut(req: Request, res: Response): Promise<Response> {
  const data = await inventoryService.createStockOut(
    getUserId(req),
    getBody<CreateStockOutInput>(req),
    auditContext(req),
  );
  return sendCreated(res, data);
}

// GET /admin/stock-outs/:id
export async function stockOutDetail(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await inventoryService.stockOutDetail(id);
  return sendSuccess(res, data);
}

// PATCH /admin/stock-outs/:id
export async function updateStockOut(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await inventoryService.updateStockOut(
    id,
    getUserId(req),
    getBody<UpdateStockOutInput>(req),
    auditContext(req),
  );
  return sendSuccess(res, data);
}

// POST /admin/stock-outs/:id/post
export async function postStockOut(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await inventoryService.postStockOut(id, getUserId(req), auditContext(req));
  return sendSuccess(res, data);
}

// POST /admin/stock-outs/:id/cancel
export async function cancelStockOut(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const body = getBody<CancelStockDocumentInput>(req);
  const data = await inventoryService.cancelStockOut(
    id,
    getUserId(req),
    body.reason,
    auditContext(req),
  );
  return sendSuccess(res, data);
}

// DELETE /admin/stock-outs/:id
export async function deleteStockOut(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await inventoryService.deleteStockOut(id, getUserId(req), auditContext(req));
  return sendSuccess(res, data);
}

// GET /admin/stock-opnames
export async function listStockOpnames(req: Request, res: Response): Promise<Response> {
  const result = await inventoryService.listStockOpnames(getQuery<ListStockOpnameQuery>(req));
  return sendPaginated(res, result.items, {
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
  });
}

// POST /admin/stock-opnames
export async function createStockOpname(req: Request, res: Response): Promise<Response> {
  const data = await inventoryService.createStockOpname(
    getUserId(req),
    getBody<CreateStockOpnameInput>(req),
    auditContext(req),
  );
  return sendCreated(res, data);
}

// GET /admin/stock-opnames/:id
export async function stockOpnameDetail(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await inventoryService.stockOpnameDetail(id);
  return sendSuccess(res, data);
}

// PATCH /admin/stock-opnames/:id
export async function updateStockOpname(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await inventoryService.updateStockOpname(
    id,
    getUserId(req),
    getBody<UpdateStockOpnameInput>(req),
    auditContext(req),
  );
  return sendSuccess(res, data);
}

// POST /admin/stock-opnames/:id/post
export async function postStockOpname(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await inventoryService.postStockOpname(id, getUserId(req), auditContext(req));
  return sendSuccess(res, data);
}

// POST /admin/stock-opnames/:id/cancel
export async function cancelStockOpname(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const body = getBody<CancelStockDocumentInput>(req);
  const data = await inventoryService.cancelStockOpname(
    id,
    getUserId(req),
    body.reason,
    auditContext(req),
  );
  return sendSuccess(res, data);
}

// DELETE /admin/stock-opnames/:id
export async function deleteStockOpname(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await inventoryService.deleteStockOpname(id, getUserId(req), auditContext(req));
  return sendSuccess(res, data);
}