"use client";

import { useEffect, useState } from "react";

import { useCartStore } from "@/store/cart-store";

/**
 * Apakah keranjang sudah selesai dibaca dari localStorage.
 *
 * Keranjang sengaja dihidrasi manual di `Providers`, jadi render pertama
 * selalu kosong. Halaman yang bergantung pada isi keranjang (keranjang &
 * checkout) menunggu flag ini supaya tidak sempat menampilkan "kosong".
 */
export function useCartHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (useCartStore.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return useCartStore.persist.onFinishHydration(() => setHydrated(true));
  }, []);

  return hydrated;
}
