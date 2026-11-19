"use client";

import { useEffect } from "react";

import { useAuthStore } from "@/store/auth-store";
import { useCartStore } from "@/store/cart-store";

/**
 * Menyiapkan state client setelah mount:
 * - membaca sesi login dari localStorage,
 * - menghidrasi keranjang dari localStorage.
 *
 * Keduanya sengaja dilakukan di effect supaya HTML server dan render pertama
 * client tetap sama (tidak ada hydration mismatch).
 */
export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    void useAuthStore.getState().hydrate();
    void useCartStore.persist.rehydrate();
  }, []);

  return <>{children}</>;
}
