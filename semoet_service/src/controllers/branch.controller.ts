import type { Request, Response } from 'express';
import * as branchService from '../services/branch.service.js';
import { sendPaginated, sendSuccess } from '../utils/response.js';
import { getParams, getQuery } from '../utils/request.js';
import type {
  ListBranchQuery,
  ListTableQuery,
} from '../validators/catalog.validator.js';
import { listBranchQuerySchema, listTableQuerySchema } from '../validators/catalog.validator.js';

/**
 * Parse pagination dari query tervalidasi. Import schema langsung sebagai
 * fallback supaya controller tetap aman dipanggil tanpa middleware validate.
 */
function parseQuery<T>(schema: typeof listBranchQuerySchema | typeof listTableQuerySchema, query: unknown): T {
  const parsed = schema.safeParse(query ?? {});
  return (parsed.success ? parsed.data : query) as T;
}

// GET /branches
export async function list(req: Request, res: Response): Promise<Response> {
  const query = parseQuery<ListBranchQuery>(listBranchQuerySchema, getQuery(req));
  const result = await branchService.listBranches(query);
  return sendPaginated(res, result.items, {
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
  });
}

// GET /branches/:id
export async function detail(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await branchService.getBranchDetail(id);
  return sendSuccess(res, data);
}

// GET /branches/:id/areas
export async function areas(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await branchService.listAreas(id, req.query.isActive === 'true');
  return sendSuccess(res, data);
}

// GET /branches/:id/tables
export async function tables(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const query = parseQuery<ListTableQuery>(listTableQuerySchema, getQuery(req));
  const result = await branchService.listTables(id, query);
  return sendPaginated(res, result.items, {
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
  });
}

// GET /branches/:id/hours
export async function hours(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await branchService.getBranchHours(id);
  return sendSuccess(res, data);
}

// GET /tables/:id
export async function tableDetail(req: Request, res: Response): Promise<Response> {
  const { id } = getParams<{ id: string }>(req);
  const data = await branchService.getTable(id);
  return sendSuccess(res, data);
}

// GET /tables/qr/:token
export async function tableByQr(req: Request, res: Response): Promise<Response> {
  const { token } = getParams<{ token: string }>(req);
  const data = await branchService.resolveTableByQr(token);
  return sendSuccess(res, data);
}