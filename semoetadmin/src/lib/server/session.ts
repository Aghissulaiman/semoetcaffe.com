/**
 * Helper sisi server untuk bicara dengan backend Semoet.
 * Hanya boleh diimpor dari Route Handler / Server Component — bukan dari client.
 */
import type { ApiEnvelope, AuthMe, SessionUser } from "@/types/api";

export const ACCESS_COOKIE = "semoet_at";
export const REFRESH_COOKIE = "semoet_rt";

const REFRESH_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 hari

export const API_BASE = (process.env.SEMOET_API_URL ?? "http://localhost:4000").replace(/\/$/, "");
export const API_PREFIX = "/api/v1";

/** URL lengkap ke backend, mis. apiV1("/auth/login"). */
export function apiV1(path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${API_PREFIX}${clean}`;
}

export interface TokenBundle {
  user: SessionUser | null;
  accessToken: string;
  expiresIn: number;
  refreshToken: string | null;
}

/** Ambil token refresh dari header Set-Cookie backend. */
export function extractRefreshToken(res: Response): string | null {
  const cookies = res.headers.getSetCookie?.() ?? [];
  for (const cookie of cookies) {
    const [pair] = cookie.split(";");
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const name = pair.slice(0, idx).trim();
    if (name === "semoet_refresh") {
      return decodeURIComponent(pair.slice(idx + 1).trim());
    }
  }
  return null;
}

interface BackendAuthPayload {
  user?: SessionUser;
  accessToken: string;
  expiresIn: number;
}

async function readEnvelope<T>(res: Response): Promise<T> {
  const text = await res.text();
  const json = text ? (JSON.parse(text) as ApiEnvelope<T>) : null;
  if (!res.ok || !json || json.success === false) {
    const message = json?.error?.message ?? `Permintaan gagal (${res.status})`;
    const error = new Error(message) as Error & { status?: number; code?: string };
    error.status = res.status;
    error.code = json?.error?.code;
    throw error;
  }
  return json.data;
}

export async function loginBackend(
  identifier: string,
  password: string,
): Promise<TokenBundle> {
  const res = await fetch(apiV1("/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password, deviceLabel: "Semoet Admin Web" }),
    cache: "no-store",
  });

  const data = await readEnvelope<BackendAuthPayload>(res);
  return {
    user: data.user ?? null,
    accessToken: data.accessToken,
    expiresIn: data.expiresIn,
    refreshToken: extractRefreshToken(res),
  };
}

export async function refreshBackend(refreshToken: string): Promise<TokenBundle> {
  const res = await fetch(apiV1("/auth/refresh"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
    cache: "no-store",
  });

  const data = await readEnvelope<BackendAuthPayload>(res);
  return {
    user: data.user ?? null,
    accessToken: data.accessToken,
    expiresIn: data.expiresIn,
    refreshToken: extractRefreshToken(res) ?? refreshToken,
  };
}

/**
 * Refresh "single-flight" + cache singkat.
 *
 * Backend memakai ROTASI refresh token: sekali dipakai, token lama dicabut.
 * Bila banyak permintaan paralel (mis. beberapa `useApi` sekaligus saat access
 * token kedaluwarsa) memakai refresh token yang SAMA, panggilan kedua akan
 * dianggap "token dipakai ulang" dan sesi dicabut → user ter-logout.
 *
 * Karena itu permintaan refresh digabung:
 * - `refreshInflight`: permintaan bersamaan berbagi satu panggilan backend.
 * - `refreshCache`: permintaan yang datang terlambat (masih membawa token lama,
 *   belum sempat menerima cookie baru) memakai hasil rotasi yang baru.
 */
const REFRESH_CACHE_TTL_MS = 60_000;
interface CachedRefresh {
  bundle: TokenBundle;
  expiresAt: number;
}

interface RefreshSharedState {
  cache: Map<string, CachedRefresh>;
  inflight: Map<string, Promise<TokenBundle>>;
}

/**
 * Route handler Next (mis. `/api/proxy/[...path]` vs `/api/auth/session`) berada
 * di bundel modul yang berbeda, sehingga variabel modul TIDAK dibagi. Simpan di
 * `globalThis` agar penggabungan refresh berlaku untuk seluruh proses Node.
 */
const globalRef = globalThis as typeof globalThis & { __semoetRefresh?: RefreshSharedState };
const shared: RefreshSharedState =
  globalRef.__semoetRefresh ?? { cache: new Map(), inflight: new Map() };
globalRef.__semoetRefresh = shared;

export async function refreshBackendShared(refreshToken: string): Promise<TokenBundle> {
  const cached = shared.cache.get(refreshToken);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.bundle;
  }

  const pending = shared.inflight.get(refreshToken);
  if (pending) {
    return pending;
  }

  const task = refreshBackend(refreshToken)
    .then((bundle) => {
      const now = Date.now();
      for (const [key, entry] of shared.cache) {
        if (entry.expiresAt <= now) shared.cache.delete(key);
      }
      shared.cache.set(refreshToken, { bundle, expiresAt: now + REFRESH_CACHE_TTL_MS });
      return bundle;
    })
    .finally(() => {
      shared.inflight.delete(refreshToken);
    });

  shared.inflight.set(refreshToken, task);
  return task;
}

export async function fetchMe(accessToken: string): Promise<AuthMe> {
  const res = await fetch(apiV1("/auth/me"), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  return readEnvelope<AuthMe>(res);
}

export async function logoutBackend(accessToken: string, allDevices = false): Promise<void> {
  try {
    await fetch(apiV1("/auth/logout"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ allDevices }),
      cache: "no-store",
    });
  } catch {
    // Abaikan: cookie lokal tetap akan dihapus.
  }
}

/** Opsi cookie akses (httpOnly, 15 menit). */
export function accessCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.max(60, Math.floor(maxAgeSeconds)),
  };
}

/** Opsi cookie refresh (httpOnly, 30 hari). */
export function refreshCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: REFRESH_MAX_AGE_SECONDS,
  };
}
