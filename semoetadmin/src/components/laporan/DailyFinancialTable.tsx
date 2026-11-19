import { formatDate, formatIdr, formatNumber } from "@/lib/format";
import { tdClass, thClass, trClass } from "@/lib/ui";
import type { ReportDaily } from "@/types/api";

interface DailyFinancialTableProps {
  data: ReportDaily[];
}

/** Rincian keuangan harian: kotor, diskon, bersih, modal (HPP), laba, qty. */
export default function DailyFinancialTable({ data }: DailyFinancialTableProps) {
  const rows = [...data].sort((a, b) => b.businessDate.localeCompare(a.businessDate));

  const total = rows.reduce(
    (acc, row) => ({
      orderCount: acc.orderCount + row.orderCount,
      grossIdr: acc.grossIdr + row.grossIdr,
      discountIdr: acc.discountIdr + row.discountIdr,
      netIdr: acc.netIdr + row.netIdr,
      cogsIdr: acc.cogsIdr + row.cogsIdr,
      profitIdr: acc.profitIdr + row.profitIdr,
      itemsSold: acc.itemsSold + row.itemsSold,
    }),
    {
      orderCount: 0,
      grossIdr: 0,
      discountIdr: 0,
      netIdr: 0,
      cogsIdr: 0,
      profitIdr: 0,
      itemsSold: 0,
    },
  );

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead>
          <tr className="border-b border-coffee-linen dark:border-coffee-night-border">
            <th className={`${thClass} text-start`}>Tanggal</th>
            <th className={`${thClass} text-end`}>Pesanan</th>
            <th className={`${thClass} text-end`}>Item</th>
            <th className={`${thClass} text-end`}>Kotor</th>
            <th className={`${thClass} text-end`}>Diskon</th>
            <th className={`${thClass} text-end`}>Bersih</th>
            <th className={`${thClass} text-end`}>Modal</th>
            <th className={`${thClass} text-end`}>Laba</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.businessDate} className={trClass}>
              <td className={`${tdClass} font-medium text-coffee-espresso dark:text-coffee-cream`}>
                {formatDate(row.businessDate)}
              </td>
              <td className={`${tdClass} text-end`}>{formatNumber(row.orderCount)}</td>
              <td className={`${tdClass} text-end`}>{formatNumber(row.itemsSold)}</td>
              <td className={`${tdClass} text-end`}>{formatIdr(row.grossIdr)}</td>
              <td className={`${tdClass} text-end text-coffee-warning`}>
                {row.discountIdr > 0 ? `-${formatIdr(row.discountIdr)}` : "—"}
              </td>
              <td className={`${tdClass} text-end font-semibold text-coffee-espresso dark:text-coffee-cream`}>
                {formatIdr(row.netIdr)}
              </td>
              <td className={`${tdClass} text-end`}>{formatIdr(row.cogsIdr)}</td>
              <td className={`${tdClass} text-end font-semibold text-coffee-success`}>
                {formatIdr(row.profitIdr)}
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
              {formatNumber(total.orderCount)}
            </td>
            <td className="pt-3 text-end text-theme-sm font-semibold text-coffee-espresso dark:text-coffee-cream">
              {formatNumber(total.itemsSold)}
            </td>
            <td className="pt-3 text-end text-theme-sm font-semibold text-coffee-espresso dark:text-coffee-cream">
              {formatIdr(total.grossIdr)}
            </td>
            <td className="pt-3 text-end text-theme-sm font-semibold text-coffee-warning">
              {total.discountIdr > 0 ? `-${formatIdr(total.discountIdr)}` : "—"}
            </td>
            <td className="pt-3 text-end text-theme-sm font-semibold text-coffee-espresso dark:text-coffee-cream">
              {formatIdr(total.netIdr)}
            </td>
            <td className="pt-3 text-end text-theme-sm font-semibold text-coffee-espresso dark:text-coffee-cream">
              {formatIdr(total.cogsIdr)}
            </td>
            <td className="pt-3 text-end text-theme-sm font-bold text-coffee-brown dark:text-coffee-caramel">
              {formatIdr(total.profitIdr)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
