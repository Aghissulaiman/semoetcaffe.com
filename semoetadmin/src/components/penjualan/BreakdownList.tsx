import { formatIdr, formatNumber } from "@/lib/format";
import type { BreakdownItem } from "@/types/api";

interface BreakdownListProps {
  items: BreakdownItem[];
  /** Ubah key mentah menjadi label Bahasa Indonesia. */
  labelOf: (key: string) => string;
  /** Warna bar (kelas Tailwind). */
  barClassName?: string;
}

/**
 * Daftar sebaran dengan bar proporsional: dipakai untuk metode pesanan &
 * metode pembayaran (label, jumlah pesanan, omzet, porsi).
 */
export default function BreakdownList({
  items,
  labelOf,
  barClassName = "bg-coffee-brown dark:bg-coffee-caramel",
}: BreakdownListProps) {
  const total = items.reduce((sum, item) => sum + item.revenueIdr, 0);

  if (items.length === 0) {
    return <p className="py-6 text-center text-theme-sm text-coffee-muted">Belum ada data</p>;
  }

  return (
    <ul className="space-y-4">
      {items.map((item) => {
        const share = total > 0 ? Math.round((item.revenueIdr / total) * 100) : 0;
        return (
          <li key={item.key}>
            <div className="flex items-center justify-between gap-3">
              <span className="text-theme-sm font-medium text-coffee-espresso dark:text-coffee-cream">
                {labelOf(item.key)}
              </span>
              <span className="text-theme-xs text-coffee-muted">
                {formatNumber(item.orderCount)} pesanan
              </span>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-coffee-linen/70 dark:bg-white/5">
                <div
                  className={`h-full rounded-full ${barClassName}`}
                  style={{ width: `${share}%` }}
                />
              </div>
              <span className="w-28 text-end text-theme-sm font-semibold text-coffee-espresso dark:text-coffee-cream">
                {formatIdr(item.revenueIdr)}
              </span>
              <span className="w-10 text-end text-theme-xs text-coffee-muted">{share}%</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
