import { formatIdr, formatNumber } from "@/lib/format";
import { trClass, tdClass, thClass } from "@/lib/ui";
import type { ReportProduct } from "@/types/api";

interface ProductSalesTableProps {
  data: ReportProduct[];
  /** Total omzet item (untuk kolom kontribusi). */
  totalRevenue: number;
}

export default function ProductSalesTable({ data, totalRevenue }: ProductSalesTableProps) {
  const totalQuantity = data.reduce((sum, item) => sum + item.quantity, 0);
  const totalCogs = data.reduce((sum, item) => sum + item.cogsIdr, 0);
  const totalProfit = data.reduce((sum, item) => sum + item.profitIdr, 0);

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead>
          <tr className="border-b border-coffee-linen dark:border-coffee-night-border">
            <th className={`${thClass} text-start`}>#</th>
            <th className={`${thClass} text-start`}>Produk</th>
            <th className={`${thClass} text-end`}>Terjual</th>
            <th className={`${thClass} text-end`}>Omzet</th>
            <th className={`${thClass} text-end`}>Modal</th>
            <th className={`${thClass} text-end`}>Laba</th>
            <th className={`${thClass} text-end`}>Kontribusi</th>
          </tr>
        </thead>
        <tbody>
          {data.map((item, index) => {
            const margin = item.revenueIdr > 0 ? Math.round((item.profitIdr / item.revenueIdr) * 100) : 0;
            return (
              <tr key={`${item.productId}-${item.productName}`} className={trClass}>
                <td className={`${tdClass} text-coffee-muted`}>{index + 1}</td>
                <td className={`${tdClass} font-medium text-coffee-espresso dark:text-coffee-cream`}>
                  {item.productName}
                </td>
                <td className={`${tdClass} text-end`}>{formatNumber(item.quantity)}</td>
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
        <tfoot>
          <tr className="border-t-2 border-coffee-linen dark:border-coffee-night-border">
            <td colSpan={2} className="pt-3 text-theme-sm font-semibold text-coffee-espresso dark:text-coffee-cream">
              Total halaman ini
            </td>
            <td className="pt-3 text-end text-theme-sm font-semibold text-coffee-espresso dark:text-coffee-cream">
              {formatNumber(totalQuantity)}
            </td>
            <td className="pt-3" />
            <td className="pt-3 text-end text-theme-sm font-semibold text-coffee-espresso dark:text-coffee-cream">
              {formatIdr(totalCogs)}
            </td>
            <td className="pt-3 text-end text-theme-sm font-bold text-coffee-brown dark:text-coffee-caramel">
              {formatIdr(totalProfit)}
            </td>
            <td className="pt-3" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
