"use client";

import { apiGet, ApiError } from "@/lib/client";
import type { ApiEnvelope } from "@/types/api";
import { useCallback, useEffect, useRef, useState } from "react";

interface UseApiResult<T> {
  data: T | null;
  meta: ApiEnvelope<T>["meta"] | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Hook pengambil data sederhana. `path` = path backend (mis. "/admin/dashboard/overview").
 * Kirim `null` untuk melewati pemanggilan (mis. menunggu filter siap).
 */
export function useApi<T>(path: string | null): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [meta, setMeta] = useState<ApiEnvelope<T>["meta"] | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(path));
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const mounted = useRef(true);

  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!path) return;
    let active = true;

    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const envelope = await apiGet<T>(path);
        if (!active || !mounted.current) return;
        setData(envelope.data);
        setMeta(envelope.meta ?? null);
      } catch (err) {
        if (!active || !mounted.current) return;
        setError(err instanceof ApiError ? err.message : "Gagal memuat data");
      } finally {
        if (active && mounted.current) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [path, tick]);

  return { data, meta, loading, error, reload };
}
