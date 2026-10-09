import { z } from 'zod';

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

/** Query string selalu berupa string, jadi angka dik coercion dari string. */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(DEFAULT_PAGE),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/**
 * Bagian pagination yang dibutuhkan query LIMIT/OFFSET saja.
 * Dipakai repository agar tidak wajib menyediakan `total` sebelum query count.
 */
export interface Paging {
  limit: number;
  offset: number;
}

export interface Pagination extends Paging {
  page: number;
  total: number;
}

export function parsePagination(query: unknown): { page: number; limit: number; offset: number } {
  const parsed = paginationQuerySchema.safeParse(query ?? {});
  const { page, limit } = parsed.success ? parsed.data : { page: DEFAULT_PAGE, limit: DEFAULT_LIMIT };
  return { page, limit, offset: (page - 1) * limit };
}

/** Query string untuk LIMIT/OFFSET (LIMIT harus integer literal, bukan placeholder). */
export function paginationSql(pagination: { limit: number; offset: number }): string {
  const limit = Math.max(1, Math.min(MAX_LIMIT, Math.trunc(pagination.limit)));
  const offset = Math.max(0, Math.trunc(pagination.offset));
  return `LIMIT ${limit} OFFSET ${offset}`;
}

export function buildPaginationMeta(pagination: Pagination): {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
} {
  const totalPages = pagination.limit > 0 ? Math.ceil(pagination.total / pagination.limit) : 0;
  return {
    page: pagination.page,
    limit: pagination.limit,
    total: pagination.total,
    totalPages,
    hasNext: pagination.page < totalPages,
    hasPrev: pagination.page > 1,
  };
}

/** Sort whitelist: mencegah SQL injection lewat query string ORDER BY. */
export function resolveSort<T extends string>(
  requested: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  if (typeof requested !== 'string') return fallback;
  const normalized = requested.trim();
  return (allowed as readonly string[]).includes(normalized) ? (normalized as T) : fallback;
}