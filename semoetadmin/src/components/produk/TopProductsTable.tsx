import { formatIdr, formatNumber } from "@/lib/format";
import type { TopProduct } from "@/types/api";

interface TopProductsTableProps {
  data: TopProduct[];
}

export default function TopProductsTable({ data }: TopProductsTableProps) {
  const totalRevenue = data.reduce((sum, item) => sum + item.totalRevenueIdr, 0);
  const totalQuantity = data.reduce((sum, item) => sum + item.totalQuantity, 0);

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead>
          <tr className="border-b border-coffee-linen dark:border-coffee-night-border">
            <th className="pb-3 text-start text-theme-xs font-semibold uppercase tracking-wider text-coffee-muted">
              #
            </th>
            <th className="pb-3 text-start text-theme-xs font-semibold uppercase tracking-wider text-coffee-muted">
              Produk
            </th>
            <th className="pb-3 text-end text-theme-xs font-semibold uppercase tracking-wider text-coffee-muted">
              Terjual
            </th>
            <th className="pb-3 text-end text-theme-xs font-semibold uppercase tracking-wider text-coffee-muted">
              Omzet
            </th>
            <th className="pb-3 text-end text-theme-xs font-semibold uppercase tracking-wider text-coffee-muted">
              Kontribusi
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((product, index) => (
            <tr
              key={product.productId}
              className="border-b border-coffee-linen/70 last:border-0 dark:border-coffee-night-border/70"
            >
              <td className="py-3 text-theme-sm text-coffee-muted">{index + 1}</td>
              <td className="py-3 text-theme-sm font-medium text-coffee-espresso dark:text-coffee-cream">
                {product.productName}
              </td>
              <td className="py-3 text-end text-theme-sm text-coffee-dark dark:text-coffee-cream/80">
                {formatNumber(product.totalQuantity)}
              </td>
              <td className="py-3 text-end text-theme-sm font-semibold text-coffee-espresso dark:text-coffee-cream">
                {formatIdr(product.totalRevenueIdr)}
              </td>
              <td className="py-3 text-end text-theme-sm text-coffee-muted">
                {totalRevenue > 0
                  ? `${Math.round((product.totalRevenueIdr / totalRevenue) * 100)}%`
                  : "0%"}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-coffee-linen dark:border-coffee-night-border">
            <td colSpan={2} className="pt-3 text-theme-sm font-semibold text-coffee-espresso dark:text-coffee-cream">
              Total
            </td>
            <td className="pt-3 text-end text-theme-sm font-semibold text-coffee-espresso dark:text-coffee-cream">
              {formatNumber(totalQuantity)}
            </td>
            <td className="pt-3 text-end text-theme-sm font-bold text-coffee-brown dark:text-coffee-caramel">
              {formatIdr(totalRevenue)}
            </td>
            <td className="pt-3" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
