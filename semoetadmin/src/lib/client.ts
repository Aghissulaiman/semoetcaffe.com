"use client";

import type { ApiEnvelope } from "@/types/api";

/**
 * Klien HTTP sisi browser. Semua panggilan lewat proxy BFF yang sama-origin,
 * jadi tidak ada masalah CORS dan cookie httpOnly ikut terkirim otomatis.
 */
export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Bangun query string dari objek, membuang nilai kosong. */
export function buildQuery(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

async function request<T>(path: string, init?: RequestInit): Promise<ApiEnvelope<T>> {
  let res: Response;
  try {
    res = await fetch(`/api/proxy${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError("Tidak dapat menghubungi server", 0, "NETWORK_ERROR");
  }

  const text = await res.text();
  let json: ApiEnvelope<T> | null = null;
  try {
    json = text ? (JSON.parse(text) as ApiEnvelope<T>) : null;
  } catch {
    json = null;
  }

  if (!res.ok || !json || json.success === false) {
    if (res.status === 401 && typeof window !== "undefined") {
      // Sesi berakhir: muat ulang ke halaman masuk agar cookie & state bersih.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/signin";
    }
    throw new ApiError(
      json?.error?.message ?? `Permintaan gagal (${res.status})`,
      res.status,
      json?.error?.code,
      json?.error?.details,
    );
  }

  return json;
}

export function apiGet<T>(path: string): Promise<ApiEnvelope<T>> {
  return request<T>(path, { method: "GET" });
}

export function apiPost<T>(path: string, body?: unknown): Promise<ApiEnvelope<T>> {
  return request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
}

export function apiPatch<T>(path: string, body?: unknown): Promise<ApiEnvelope<T>> {
  return request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined });
}

export function apiPut<T>(path: string, body?: unknown): Promise<ApiEnvelope<T>> {
  return request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined });
}

export function apiDelete<T>(path: string): Promise<ApiEnvelope<T>> {
  return request<T>(path, { method: "DELETE" });
}
