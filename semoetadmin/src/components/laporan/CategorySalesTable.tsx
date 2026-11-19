import { formatIdr, formatNumber } from "@/lib/format";
import { tdClass, thClass, trClass } from "@/lib/ui";
import type { CategorySales } from "@/types/api";

interface CategorySalesTableProps {
  data: CategorySales[];
}

/** Rekap penjualan per kategori produk beserta kontribusi omzetnya. */
export default function CategorySalesTable({ data }: CategorySalesTableProps) {
  const totalRevenue = data.reduce((sum, item) => sum + item.revenueIdr, 0);

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead>
          <tr className="border-b border-coffee-linen dark:border-coffee-night-border">
            <th className={`${thClass} text-start`}>Kategori</th>
            <th className={`${thClass} text-end`}>Item</th>
            <th className={`${thClass} text-end`}>Pesanan</th>
            <th className={`${thClass} text-end`}>Omzet</th>
            <th className={`${thClass} text-end`}>Modal</th>
            <th className={`${thClass} text-end`}>Laba</th>
            <th className={`${thClass} text-end`}>Kontribusi</th>
          </tr>
        </thead>
        <tbody>
          {data.map((item) => {
            const margin = item.revenueIdr > 0 ? Math.round((item.profitIdr / item.revenueIdr) * 100) : 0;
            return (
              <tr key={item.categoryId || item.categoryName} className={trClass}>
                <td className={`${tdClass} font-medium text-coffee-espresso dark:text-coffee-cream`}>
                  {item.categoryName}
                </td>
                <td className={`${tdClass} text-end`}>{formatNumber(item.quantity)}</td>
                <td className={`${tdClass} text-end`}>{formatNumber(item.orderCount)}</td>
                <td className={`${tdClass} text-end font-semibold text-coffee-espresso dark:text-coffee-cream`}>
                  {formatIdr(item.revenueIdr)}
                </td>
                <td className={`${tdClass} text-end`}>{formatIdr(item.cogsIdr)}</td>
                <td className={`${tdClass} text-end font-semibold text-coffee-success`}>
                  {formatIdr(item.profitIdr)}
                  <span className="ms-1 text-theme-xs text-coffee-muted">({margin}%)</span>
                </td>
                <td className={`${tdClass} text-end text-coffee-muted`}>
                  {totalRevenue > 0 ? `${Math.round((item.revenueIdr / totalRevenue) * 100)}%` : "0%"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
