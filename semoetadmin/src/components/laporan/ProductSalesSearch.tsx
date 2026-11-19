"use client";

import ComponentCard from "@/components/common/ComponentCard";
import { EmptyBlock, ErrorBlock, Skeleton } from "@/components/common/DataState";
import { useApi } from "@/hooks/useApi";
import { buildQuery } from "@/lib/client";
import { formatIdr, formatNumber } from "@/lib/format";
import { inputClass, secondaryButtonClass, tdClass, thClass, trClass } from "@/lib/ui";
import type { ReportProduct } from "@/types/api";
import { useState, type FormEvent } from "react";

interface ProductSalesSearchProps {
  from: string;
  to: string;
  /** Judul kartu; default "Cari Penjualan Produk". */
  title?: string;
  desc?: string;
}

/**
 * Pencarian total penjualan untuk item/produk tertentu pada rentang tanggal.
 * Dipakai di halaman Penjualan, Produk, dan Laporan.
 */
export default function ProductSalesSearch({
  from,
  to,
  title = "Cari Penjualan Produk",
  desc = "Lihat total penjualan untuk item/produk tertentu",
}: ProductSalesSearchProps) {
  const ready = Boolean(from && to);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");

  const products = useApi<ReportProduct[]>(
    ready
      ? `/admin/reports/products${buildQuery({
          from,
          to,
          q,
          sort: q ? "revenue_desc" : "qty_desc",
          limit: 10,
        })}`
      : null,
  );

  const rows = products.data ?? [];
  const totalRevenue = rows.reduce((sum, row) => sum + row.revenueIdr, 0);
  const totalQuantity = rows.reduce((sum, row) => sum + row.quantity, 0);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setQ(qInput.trim());
  };

  return (
    <ComponentCard
      title={title}
      desc={desc}
      action={
        <form className="flex flex-wrap items-center gap-2" onSubmit={submitSearch}>
          <input
            type="search"
            value={qInput}
            onChange={(event) => setQInput(event.target.value)}
            placeholder="Nama produk…"
            className={`${inputClass} w-48`}
            aria-label="Cari nama produk"
          />
          <button type="submit" className={secondaryButtonClass}>
            Cari
          </button>
          {q && (
            <button
              type="button"
              onClick={() => {
                setQ("");
                setQInput("");
              }}
              className="text-theme-xs font-medium text-coffee-brown underline-offset-2 hover:underline dark:text-coffee-caramel"
            >
              Hapus
            </button>
          )}
        </form>
      }
    >
      {rows.length > 0 && (
        <p className="mb-4 text-theme-xs text-coffee-muted">
          {q ? (
            <>
              Hasil untuk <span className="font-semibold text-coffee-dark dark:text-coffee-cream">“{q}”</span>
              {" · "}
            </>
          ) : (
            "Produk terlaris · "
          )}
          {formatNumber(products.meta?.total ?? rows.length)} produk · {formatNumber(totalQuantity)} item ·{" "}
          {formatIdr(totalRevenue)}
        </p>
      )}

      {products.loading && !products.data ? (
        <Skeleton className="h-[220px] w-full" />
      ) : products.error ? (
        <ErrorBlock message={products.error} onRetry={products.reload} />
      ) : rows.length === 0 ? (
        <EmptyBlock
          message={
            q
              ? `Tidak ada penjualan untuk “${q}” pada periode ini`
              : "Belum ada penjualan produk pada periode ini"
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-coffee-linen dark:border-coffee-night-border">
                <th className={`${thClass} text-start`}>Produk</th>
                <th className={`${thClass} text-end`}>Terjual</th>
                <th className={`${thClass} text-end`}>Omzet</th>
                <th className={`${thClass} text-end`}>Laba</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.productId}-${row.productName}`} className={trClass}>
                  <td className={`${tdClass} font-medium text-coffee-espresso dark:text-coffee-cream`}>
                    {row.productName}
                  </td>
                  <td className={`${tdClass} text-end`}>{formatNumber(row.quantity)}</td>
                  <td className={`${tdClass} text-end font-semibold text-coffee-espresso dark:text-coffee-cream`}>
                    {formatIdr(row.revenueIdr)}
                  </td>
                  <td className={`${tdClass} text-end font-semibold text-coffee-success`}>
                    {formatIdr(row.profitIdr)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ComponentCard>
  );
}
