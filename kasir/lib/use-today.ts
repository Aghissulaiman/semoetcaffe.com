"use client";

import { useSyncExternalStore } from "react";

import { todayKey } from "./format";

function subscribeNoop(): () => void {
  return () => {};
}

function getSnapshot(): string | null {
  return todayKey();
}

function getServerSnapshot(): string | null {
  return null;
}

/**
 * Tanggal hari ini (`YYYY-MM-DD`) yang aman untuk prerender Next.js.
 *
 * Saat server / hidrasi nilainya `null`, lalu berubah menjadi tanggal lokal
 * setelah aplikasi hidup di browser. Dengan begitu `new Date()` tidak pernah
 * dievaluasi saat build (Cache Components akan menolaknya).
 */
export function useToday(): string | null {
  return useSyncExternalStore(subscribeNoop, getSnapshot, getServerSnapshot);
}
