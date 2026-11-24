"use client";

import { ApiError, apiGet, buildQuery } from "@/lib/client";
import type { Ingredient } from "@/types/api";
import { useCallback, useEffect, useRef, useState } from "react";

const PAGE_SIZE = 100; // batas maksimal `limit` yang diizinkan backend

interface UseAllIngredientsOptions {
  /** Ikuti filter aktif/nonaktif seperti form stok & pembelian. */
  isActive?: boolean;
  /** Cari di server (nama/SKU) — opsional. */
  q?: string;
  enabled?: boolean;
}

/**
 * Ambil seluruh bahan baku untuk keperluan picker.
 *
 * Endpoint `/admin/ingredients` dibatasi 100 baris per halaman. Mengambil hanya
 * halaman pertama membuat bahan di halaman berikutnya (mis. "Telur") tidak
 * pernah muncul di form walaupun tersedia di halaman Inventori.
 */
export function useAllIngredients(options: UseAllIngredientsOptions = {}) {
  const { isActive, q, enabled = true } = options;
  const [data, setData] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(enabled);
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
    if (!enabled) return;
    let active = true;

    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const path = (page: number) =>
          `/admin/ingredients${buildQuery({ page, limit: PAGE_SIZE, isActive, q })}`;

        const first = await apiGet<Ingredient[]>(path(1));
        const totalPages = Math.ceil((first.meta?.total ?? first.data.length) / PAGE_SIZE);
        const rest =
          totalPages > 1
            ? await Promise.all(
                Array.from({ length: totalPages - 1 }, (_, index) =>
                  apiGet<Ingredient[]>(path(index + 2)),
                ),
              )
            : [];
        const all = [first, ...rest].flatMap((response) => response.data);

        if (active && mounted.current) setData(all);
      } catch (err) {
        if (!active || !mounted.current) return;
        setData([]);
        setError(
          err instanceof ApiError
            ? err.message
            : "Gagal memuat daftar bahan baku",
        );
      } finally {
        if (active && mounted.current) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [enabled, isActive, q, tick]);

  return { data, loading, error, reload };
}
