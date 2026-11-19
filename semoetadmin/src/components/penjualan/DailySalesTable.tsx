import { formatDate, formatIdr, formatNumber } from "@/lib/format";
import type { DailySales } from "@/types/api";

interface DailySalesTableProps {
  data: DailySales[];
}

export default function DailySalesTable({ data }: DailySalesTableProps) {
  const rows = [...data].sort((a, b) => b.businessDate.localeCompare(a.businessDate));
  const totalOrders = rows.reduce((sum, row) => sum + row.orderCount, 0);
  const totalRevenue = rows.reduce((sum, row) => sum + row.paidSalesIdr, 0);

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-start">
        <thead>
          <tr className="border-b border-coffee-linen dark:border-coffee-night-border">
            <th className="pb-3 text-start text-theme-xs font-semibold uppercase tracking-wider text-coffee-muted">
              Tanggal
            </th>
            <th className="pb-3 text-end text-theme-xs font-semibold uppercase tracking-wider text-coffee-muted">
              Pesanan
            </th>
            <th className="pb-3 text-end text-theme-xs font-semibold uppercase tracking-wider text-coffee-muted">
              Omzet
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.businessDate}
              className="border-b border-coffee-linen/70 last:border-0 dark:border-coffee-night-border/70"
            >
              <td className="py-3 text-theme-sm text-coffee-dark dark:text-coffee-cream/80">
                {formatDate(row.businessDate)}
              </td>
              <td className="py-3 text-end text-theme-sm text-coffee-dark dark:text-coffee-cream/80">
                {formatNumber(row.orderCount)}
              </td>
              <td className="py-3 text-end text-theme-sm font-semibold text-coffee-espresso dark:text-coffee-cream">
                {formatIdr(row.paidSalesIdr)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-coffee-linen dark:border-coffee-night-border">
            <td className="pt-3 text-theme-sm font-semibold text-coffee-espresso dark:text-coffee-cream">
              Total ({rows.length} hari)
            </td>
            <td className="pt-3 text-end text-theme-sm font-semibold text-coffee-espresso dark:text-coffee-cream">
              {formatNumber(totalOrders)}
            </td>
            <td className="pt-3 text-end text-theme-sm font-bold text-coffee-brown dark:text-coffee-caramel">
              {formatIdr(totalRevenue)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
