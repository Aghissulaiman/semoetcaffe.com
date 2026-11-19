"use client";

import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

/**
 * Mengembalikan `true` hanya setelah komponen hidup di browser.
 * Berguna untuk menghindari hydration mismatch tanpa setState di effect.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}
