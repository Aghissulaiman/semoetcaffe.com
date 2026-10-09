import type { Response } from 'express';

export interface ApiMeta {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  hasNext?: boolean;
  hasPrev?: boolean;
  [key: string]: unknown;
}

export interface ApiResponse<T> {
  success: true;
  data: T;
  meta?: ApiMeta;
  requestId?: string;
}

export function buildSuccess<T>(data: T, meta?: ApiMeta, requestId?: string): ApiResponse<T> {
  return {
    success: true,
    data,
    ...(meta ? { meta } : {}),
    ...(requestId ? { requestId } : {}),
  };
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  options: { statusCode?: number; meta?: ApiMeta } = {},
): Response {
  const { statusCode = 200, meta } = options;
  const requestId = res.locals.requestId as string | undefined;
  return res.status(statusCode).json(buildSuccess(data, meta, requestId));
}

export function sendCreated<T>(res: Response, data: T, meta?: ApiMeta): Response {
  return sendSuccess(res, data, { statusCode: 201, meta });
}

export function sendAccepted<T>(res: Response, data: T, meta?: ApiMeta): Response {
  return sendSuccess(res, data, { statusCode: 202, meta });
}

export function sendNoContent(res: Response): Response {
  return res.status(204).send();
}

export function sendPaginated<T>(
  res: Response,
  items: T[],
  pagination: { page: number; limit: number; total: number },
  extraMeta: ApiMeta = {},
): Response {
  const totalPages = pagination.limit > 0 ? Math.ceil(pagination.total / pagination.limit) : 0;
  return sendSuccess(res, items, {
    meta: {
      page: pagination.page,
      limit: pagination.limit,
      total: pagination.total,
      totalPages,
      hasNext: pagination.page < totalPages,
      hasPrev: pagination.page > 1,
      ...extraMeta,
    },
  });
}