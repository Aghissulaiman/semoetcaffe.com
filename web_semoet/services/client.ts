/**
 * Client HTTP untuk `semoet_service` (prefix /api/v1) versi web.
 *
 * - Access token disimpan di `localStorage` supaya sesi bertahan saat tab
 *   dibuka lagi.
 * - Refresh token dikirim server sebagai cookie httpOnly; semua request memakai
 *   `credentials: 'include'`. Di development, `/api/v1/*` di-proxy oleh Next.js
 *   (lihat `next.config.ts`) sehingga cookie tetap same-origin.
 * - Semua response dibungkus envelope `{ success, data, meta }` milik backend.
 */
import type { ApiMeta } from '@/types/api';

/**
 * Base URL API (prefix /api/v1).
 *
 * Default `/api/v1` memakai proxy Next.js. Bisa dioverride lewat
 * `NEXT_PUBLIC_API_URL` bila backend berada di origin lain.
 */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL?.trim() || '/api/v1';

const ACCESS_TOKEN_KEY = 'semoet.accessToken';
const TOKEN_EXPIRES_KEY = 'semoet.accessTokenExpiresAt';

const REQUEST_TIMEOUT_MS = 30000;
/** Refresh sedikit sebelum token habis supaya request tidak sempat 401. */
const REFRESH_LEEWAY_MS = 30_000;

export class ApiError extends Error {
  readonly status: number;
  readonly details?: { field?: string; message?: string }[];
  readonly requestId?: string;

  constructor(
    message: string,
    status: number,
    options?: { details?: ApiError['details']; requestId?: string },
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = options?.details;
    this.requestId = options?.requestId;
  }

  /**
   * Pesan validasi per-field, bila backend mengirim details.
   * Backend menulis field seperti `body.password` — prefix dibuang supaya
   * cocok dengan kunci error di layar (`errors.password`).
   */
  get fieldErrors(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const detail of this.details ?? []) {
      if (detail.field && detail.message) {
        const key = detail.field.replace(/^(body|query|params)\./, '');
        if (!(key in result)) result[key] = detail.message;
      }
    }
    return result;
  }
}

// ---------------------------------------------------------------------------
// Penyimpanan token
// ---------------------------------------------------------------------------
let cachedToken: string | null | undefined;

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export async function getAccessToken(): Promise<string | null> {
  if (cachedToken !== undefined) return cachedToken;
  try {
    cachedToken = storage()?.getItem(ACCESS_TOKEN_KEY) ?? null;
  } catch {
    cachedToken = null;
  }
  return cachedToken;
}

export async function setAccessToken(token: string | null, expiresInSeconds?: number): Promise<void> {
  cachedToken = token;
  try {
    const store = storage();
    if (!store) return;
    if (token) {
      store.setItem(ACCESS_TOKEN_KEY, token);
      const expiresAt = Date.now() + (expiresInSeconds ?? 900) * 1000;
      store.setItem(TOKEN_EXPIRES_KEY, String(expiresAt));
    } else {
      store.removeItem(ACCESS_TOKEN_KEY);
      store.removeItem(TOKEN_EXPIRES_KEY);
    }
  } catch {
    // Storage tidak tersedia (mis. private mode) — token tetap hidup di memori.
  }
}

export async function clearSession(): Promise<void> {
  await setAccessToken(null);
}

// ---------------------------------------------------------------------------
// Notifikasi sesi berakhir — dipasang oleh auth-store supaya state login ikut
// direset ketika token tidak lagi bisa dipulihkan (bukan hanya tokennya dibuang).
// ---------------------------------------------------------------------------
let sessionExpiredHandler: (() => void) | null = null;

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  sessionExpiredHandler = handler;
}

async function isTokenExpiringSoon(): Promise<boolean> {
  try {
    const raw = storage()?.getItem(TOKEN_EXPIRES_KEY);
    if (!raw) return false;
    return Number(raw) - Date.now() < REFRESH_LEEWAY_MS;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Util
// ---------------------------------------------------------------------------
export type QueryParams = Record<string, string | number | boolean | null | undefined>;

export function buildQuery(params?: QueryParams): string {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    search.append(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: QueryParams;
  /** Sertakan Bearer token bila tersedia. Default true. */
  auth?: boolean;
  headers?: Record<string, string>;
  /** Cegah order dobel saat user menekan tombol berulang. */
  idempotencyKey?: string;
  /** Custom timeout dalam ms. */
  timeoutMs?: number;
}

export interface ApiResult<T> {
  data: T;
  meta?: ApiMeta;
}

function isAuthEndpoint(path: string): boolean {
  return path.startsWith('/auth/');
}

/**
 * Satu refresh berjalan pada satu waktu.
 *
 * Backend merotasi refresh token: sesi lama dicabut lalu sesi baru dibuat.
 * Kalau beberapa request memanggil refresh bersamaan (mis. hydrate + fetch
 * halaman, atau efek ganda React Strict Mode), request kedua membawa cookie
 * lama yang sudah dicabut dan bisa membuat sesi dianggap berakhir. Promise
 * bersama ini memastikan semua pemanggil menunggu hasil refresh yang sama.
 */
let refreshPromise: Promise<string | null> | null = null;

async function performRefresh(): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      // Tab lain mungkin baru saja merotasi cookie. Beri jeda singkat lalu
      // coba sekali lagi dengan cookie terbaru sebelum menyimpulkan logout.
      if (response.status === 401 && attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        continue;
      }

      if (!response.ok) return null;
      const json = (await response.json()) as { data?: { accessToken?: string; expiresIn?: number } };
      const token = json.data?.accessToken;
      if (!token) return null;
      await setAccessToken(token, json.data?.expiresIn);
      return token;
    } catch {
      return null;
    }
  }
  return null;
}

function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = performRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function performRequest<T>(path: string, options: RequestOptions, token: string | null): Promise<ApiResult<T>> {
  const { method = 'GET', body, query, auth = true, headers = {}, timeoutMs = REQUEST_TIMEOUT_MS } = options;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${API_BASE_URL}${path}${buildQuery(query)}`, {
      method,
      credentials: 'include',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (response.status === 204) return { data: undefined as T };

    const json = (await response.json().catch(() => null)) as
      | {
          success?: boolean;
          data?: T;
          meta?: ApiMeta;
          message?: string;
          details?: ApiError['details'];
          requestId?: string;
          /** Envelope error backend: { success:false, error:{ code, message, details }, requestId } */
          error?: { code?: string; message?: string; details?: ApiError['details'] };
        }
      | null;

    if (!response.ok) {
      throw new ApiError(
        json?.error?.message ?? json?.message ?? `Permintaan gagal (HTTP ${response.status})`,
        response.status,
        { details: json?.error?.details ?? json?.details, requestId: json?.requestId },
      );
    }

    return { data: json?.data as T, meta: json?.meta };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError('Koneksi lambat, coba lagi', 0);
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('Koneksi lambat, coba lagi', 0);
    }
    throw new ApiError(error instanceof Error ? error.message : 'Tidak dapat terhubung ke server', 0);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Request dengan auto-refresh token bila access token hampir/habis berlaku.
 *
 * Bila `auth` diminta tetapi belum ada token, request tetap dikirim tanpa
 * header Authorization. Ini penting agar pengunjung (guest) bisa melihat
 * katalog publik; endpoint yang memang butuh login akan menjawab 401.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  const { auth = true } = options;

  let token = auth ? await getAccessToken() : null;

  if (auth && token && !isAuthEndpoint(path) && (await isTokenExpiringSoon())) {
    token = (await refreshAccessToken()) ?? token;
  }

  try {
    return await performRequest<T>(path, options, token);
  } catch (error) {
    const shouldRetry =
      auth &&
      token !== null &&
      error instanceof ApiError &&
      error.status === 401 &&
      !isAuthEndpoint(path);

    if (!shouldRetry) throw error;

    const refreshed = await refreshAccessToken();
    if (!refreshed) {
      await clearSession();
      sessionExpiredHandler?.();
      throw error;
    }
    return performRequest<T>(path, options, refreshed);
  }
}

/** Shortcut untuk endpoint yang hanya mengembalikan `data`. */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const result = await request<T>(path, options);
  return result.data;
}

export function apiErrorFrom(error: unknown, fallback = 'Terjadi kesalahan'): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
