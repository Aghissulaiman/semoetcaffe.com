"use client";

import { useIsClient } from "./useIsClient";
import { daysAgo, toDateInputValue } from "@/lib/format";

export interface DateRange {
  from: string;
  to: string;
}

/**
 * Rentang tanggal default (N hari terakhir). Dihitung hanya di klien agar
 * tidak terjadi hydration mismatch antara server & browser.
 */
export function useDateRange(days: number): DateRange | null {
  const isClient = useIsClient();
  if (!isClient) return null;
  return {
    from: toDateInputValue(daysAgo(days - 1)),
    to: toDateInputValue(new Date()),
  };
}
