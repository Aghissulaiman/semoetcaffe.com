"use client";

import { type Column } from "@/components/common/DataTable";
import ToneBadge from "@/components/common/ToneBadge";
import { formatNumber } from "@/lib/format";
import { tdClass, thClass, trClass } from "@/lib/ui";
import type { StockSummary, StockSummaryItem } from "@/types/api";

interface StockSummaryTableProps {
  summary: StockSummary;
}

export default function StockSummaryTable({ summary }: StockSummaryTableProps) {
  const columns: Column<StockSummaryItem>[] = [
    {
      key: "name",
      header: "Bahan",
      render: (row) => (
        <div>
          <p className="font-medium text-coffee-dark dark:text-coffee-cream">{row.name}</p>
          <p className="font-mono text-theme-xs text-coffee-muted">{row.sku}</p>
        </div>
      ),
    },
    {
      key: "openingStock",
      header: "Stok Awal",
      align: "right",
      render: (row) => formatNumber(row.openingStock),
    },
    {
      key: "totalIn",
      header: "Masuk",
      align: "right",
      render: (row) => <span className="font-semibold text-coffee-success">{formatNumber(row.totalIn)}</span>,
    },
    {
      key: "totalOut",
      header: "Keluar",
      align: "right",
      render: (row) => <span className="font-semibold text-coffee-danger">{formatNumber(row.totalOut)}</span>,
    },
    {
      key: "totalSales",
      header: "Penjualan",
      align: "right",
      render: (row) => <span className="font-semibold text-coffee-brown dark:text-coffee-caramel">{formatNumber(row.totalSales)}</span>,
    },
    {
      key: "totalWaste",
      header: "Terbuang",
      align: "right",
      render: (row) => formatNumber(row.totalWaste),
    },
    {
      key: "totalAdjustment",
      header: "Penyesuaian",
      align: "right",
      render: (row) => formatNumber(row.totalAdjustment),
    },
    {
      key: "closingStock",
      header: "Stok Akhir",
      align: "right",
      render: (row) => (
        <div className="flex items-center justify-end gap-2">
          <span className="font-semibold">{formatNumber(row.closingStock)}</span>
          {row.lowStock && <ToneBadge tone="warning">Menipis</ToneBadge>}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className={tdClass}>
          <p className="text-theme-sm text-coffee-muted">Bahan</p>
          <p className="mt-2 text-xl font-bold text-coffee-espresso dark:text-coffee-cream">
            {formatNumber(summary.summary.ingredientCount)}
          </p>
        </div>
        <div className={tdClass}>
          <p className="text-theme-sm text-coffee-muted">Stok Akhir</p>
          <p className="mt-2 text-xl font-bold text-coffee-espresso dark:text-coffee-cream">
            {formatNumber(summary.summary.openingStock + summary.summary.totalIn - summary.summary.totalOut - summary.summary.totalSales - summary.summary.totalWaste + summary.summary.totalAdjustment)}
          </p>
        </div>
        <div className={tdClass}>
          <p className="text-theme-sm text-coffee-muted">Stok Menipis</p>
          <p className={`mt-2 text-xl font-bold ${summary.summary.lowStockCount > 0 ? "text-coffee-danger" : "text-coffee-espresso dark:text-coffee-cream"}`}>
            {formatNumber(summary.summary.lowStockCount)}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-coffee-linen dark:border-coffee-night-border">
        <table className="min-w-full">
          <thead>
            <tr className="bg-coffee-milk/50 dark:bg-coffee-night-border/50">
              {columns.map((column) => (
                <th
                  key={column.key}
                  style={{ textAlign: column.align ?? "left" }}
                  className={`${thClass} border-b border-coffee-linen px-4 py-3 text-left text-theme-xs font-semibold uppercase tracking-wider text-coffee-muted dark:border-coffee-night-border ${
                    column.align === "right" ? "text-right" : ""}
                  }`}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {summary.items.map((item) => (
              <tr key={item.ingredientId} className={trClass}>
                <td className={`${tdClass} text-coffee-dark dark:text-coffee-cream/80`}>
                  <span className="block font-medium">{item.name}</span>
                  <span className="block font-mono text-theme-xs text-coffee-muted">{item.sku}</span>
                </td>
                {columns.slice(1).map((column) => (
                  <td
                    key={column.key}
                    className={`${tdClass} ${column.align === "right" ? "text-right" : ""} text-coffee-dark dark:text-coffee-cream/80`}
                    style={{ textAlign: column.align ?? "left" }}
                  >
                    {column.render ? column.render(item, 0) : null}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
