"use client";

import ComponentCard from "@/components/common/ComponentCard";
import DateRangePicker from "@/components/common/DateRangePicker";
import { EmptyBlock, ErrorBlock, KpiSkeleton, Skeleton } from "@/components/common/DataState";
import ExportCsvButton from "@/components/common/ExportCsvButton";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import Pagination from "@/components/common/Pagination";
import KpiCard from "@/components/dashboard/KpiCard";
import CategorySalesTable from "@/components/laporan/CategorySalesTable";
import DailyFinancialTable from "@/components/laporan/DailyFinancialTable";
import ProductSalesTable from "@/components/laporan/ProductSalesTable";
import { useApi } from "@/hooks/useApi";
import { useDateRange } from "@/hooks/useDateRange";
import {
  BoxCubeIcon,
  DollarLineIcon,
  ListIcon,
  PieChartIcon,
  ShootingStarIcon,
} from "@/icons";
import { buildQuery } from "@/lib/client";
import type { CsvColumn } from "@/lib/csv";
import { percentChange, previousRange } from "@/lib/date-range";
import { formatIdr, formatNumber } from "@/lib/format";
import { inputClass, secondaryButtonClass } from "@/lib/ui";
import type { CategorySales, ReportDaily, ReportProduct, ReportSales } from "@/types/api";
import { useState } from "react";

type ProductSort = "revenue_desc" | "profit_desc" | "qty_desc" | "name_asc";

const SORT_OPTIONS: { value: ProductSort; label: string }[] = [
  { value: "revenue_desc", label: "Omzet tertinggi" },
  { value: "profit_desc", label: "Laba tertinggi" },
  { value: "qty_desc", label: "Terjual terbanyak" },
  { value: "name_asc", label: "Nama A–Z" },
];

const DAILY_COLUMNS: CsvColumn<ReportDaily>[] = [
  { header: "Tanggal", value: (row) => row.businessDate },
  { header: "Pesanan", value: (row) => row.orderCount },
  { header: "Item terjual", value: (row) => row.itemsSold },
  { header: "Penjualan kotor (Rp)", value: (row) => row.grossIdr },
  { header: "Diskon (Rp)", value: (row) => row.discountIdr },
  { header: "Penjualan bersih (Rp)", value: (row) => row.netIdr },
  { header: "Modal (Rp)", value: (row) => row.cogsIdr },
  { header: "Laba (Rp)", value: (row) => row.profitIdr },
];

const CATEGORY_COLUMNS: CsvColumn<CategorySales>[] = [
  { header: "Kategori", value: (row) => row.categoryName },
  { header: "Item terjual", value: (row) => row.quantity },
  { header: "Pesanan", value: (row) => row.orderCount },
  { header: "Omzet (Rp)", value: (row) => row.revenueIdr },
  { header: "Modal (Rp)", value: (row) => row.cogsIdr },
  { header: "Laba (Rp)", value: (row) => row.profitIdr },
];

const PRODUCT_COLUMNS: CsvColumn<ReportProduct>[] = [
  { header: "Produk", value: (row) => row.productName },
  { header: "Terjual", value: (row) => row.quantity },
  { header: "Pesanan", value: (row) => row.orderCount },
  { header: "Omzet (Rp)", value: (row) => row.revenueIdr },
  { header: "Modal (Rp)", value: (row) => row.cogsIdr },
  { header: "Laba (Rp)", value: (row) => row.profitIdr },
];

export default function LaporanPage() {
  const initial = useDateRange(30);
  const [fromOverride, setFromOverride] = useState<string | null>(null);
  const [toOverride, setToOverride] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<ProductSort>("revenue_desc");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");

  const from = fromOverride ?? initial?.from ?? "";
  const to = toOverride ?? initial?.to ?? "";
  const ready = Boolean(from && to);
  const prev = ready ? previousRange(from, to) : null;

  const summary = useApi<ReportSales>(
    ready ? `/admin/reports/sales${buildQuery({ from, to })}` : null,
  );
  const prevSummary = useApi<ReportSales>(
    prev ? `/admin/reports/sales${buildQuery({ from: prev.from, to: prev.to })}` : null,
  );
  const daily = useApi<ReportDaily[]>(
    ready ? `/admin/reports/daily${buildQuery({ from, to })}` : null,
  );
  const categories = useApi<CategorySales[]>(
    ready ? `/admin/reports/categories${buildQuery({ from, to })}` : null,
  );
  const products = useApi<ReportProduct[]>(
    ready
      ? `/admin/reports/products${buildQuery({ from, to, q, sort, page, limit: 10 })}`
      : null,
  );

  const handleRangeChange = (nextFrom: string, nextTo: string) => {
    setFromOverride(nextFrom);
    setToOverride(nextTo);
    setPage(1);
  };

  const handleReset = () => {
    setFromOverride(null);
    setToOverride(null);
    setQInput("");
    setQ("");
    setSort("revenue_desc");
    setPage(1);
  };

  const net = summary.data?.netSalesIdr ?? 0;
  const profit = summary.data?.profitIdr ?? 0;
  const gross = summary.data?.grossSalesIdr ?? 0;
  const discount = summary.data?.discountIdr ?? 0;
  const margin = net > 0 ? Math.round((profit / net) * 100) : 0;
  const discountShare = gross > 0 ? Math.round((discount / gross) * 100) : 0;

  const change = (current: number | undefined, previous: number | undefined) =>
    percentChange(current ?? 0, previous ?? 0);

  return (
    <div className="space-y-6">
      <PageBreadcrumb pageTitle="Laporan Penjualan" items={[{ label: "Laporan" }]} />

      {/* Filter */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-coffee-linen bg-white p-4 dark:border-coffee-night-border dark:bg-coffee-night-soft">
        <label className="flex flex-col gap-1">
          <span className="text-theme-xs font-medium text-coffee-muted">Periode</span>
          <DateRangePicker from={from} to={to} onChange={handleRangeChange} />
        </label>

        <button type="button" onClick={handleReset} className={`ms-auto ${secondaryButtonClass}`}>
          Reset
        </button>
      </div>

      {/* Akumulasi */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {summary.loading && !summary.data ? (
          <>
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
          </>
        ) : summary.error ? (
          <div className="sm:col-span-2 xl:col-span-3">
            <ErrorBlock message={summary.error} onRetry={summary.reload} />
          </div>
        ) : (
          <>
            <KpiCard
              label="Penjualan Kotor"
              value={formatIdr(gross)}
              hint={`${formatNumber(summary.data?.orderCount)} pesanan lunas`}
              icon={<DollarLineIcon />}
              tone="coffee"
              delta={{ pct: change(summary.data?.grossSalesIdr, prevSummary.data?.grossSalesIdr) }}
            />
            <KpiCard
              label="Akumulasi Diskon"
              value={formatIdr(discount)}
              hint={`${discountShare}% dari penjualan kotor`}
              icon={<ShootingStarIcon />}
              tone="warning"
              delta={{
                pct: change(summary.data?.discountIdr, prevSummary.data?.discountIdr),
                invert: true,
              }}
            />
            <KpiCard
              label="Penjualan Bersih"
              value={formatIdr(net)}
              hint="Kotor − diskon"
              icon={<PieChartIcon />}
              tone="success"
              delta={{ pct: change(summary.data?.netSalesIdr, prevSummary.data?.netSalesIdr) }}
            />
            <KpiCard
              label="Modal Produk (HPP)"
              value={formatIdr(summary.data?.cogsIdr)}
              hint="Total harga pokok item terjual"
              icon={<BoxCubeIcon />}
              tone="muted"
              delta={{
                pct: change(summary.data?.cogsIdr, prevSummary.data?.cogsIdr),
                invert: true,
              }}
            />
            <KpiCard
              label="Laba"
              value={formatIdr(profit)}
              hint={`Margin ${margin}%`}
              icon={<DollarLineIcon />}
              tone="gold"
              delta={{ pct: change(summary.data?.profitIdr, prevSummary.data?.profitIdr) }}
            />
            <KpiCard
              label="Qty Item Terjual"
              value={formatNumber(summary.data?.itemsSold)}
              hint={`${formatNumber(summary.data?.productCount)} produk terjual`}
              icon={<ListIcon />}
              tone="gold"
              delta={{ pct: change(summary.data?.itemsSold, prevSummary.data?.itemsSold) }}
            />
          </>
        )}
      </div>

      <p className="text-theme-xs text-coffee-muted">
        Akumulasi dihitung dari pesanan berstatus lunas (paid) dan tidak dibatalkan. Persentase
        membandingkan dengan periode sebelumnya yang sama panjang. Isi harga modal (HPP) tiap varian
        di halaman Katalog agar nilai modal &amp; laba akurat.
      </p>

      {/* Rincian harian */}
      <ComponentCard
        title="Rincian Harian"
        desc="Kotor, diskon, bersih, modal, dan laba tiap hari"
        action={
          <ExportCsvButton
            filename={`laporan-harian-${from}-${to}.csv`}
            rows={daily.data ?? []}
            columns={DAILY_COLUMNS}
          />
        }
      >
        {daily.loading && !daily.data ? (
          <Skeleton className="h-[280px] w-full" />
        ) : daily.error ? (
          <ErrorBlock message={daily.error} onRetry={daily.reload} />
        ) : (daily.data?.length ?? 0) === 0 ? (
          <EmptyBlock message="Belum ada penjualan pada periode ini" />
        ) : (
          <DailyFinancialTable data={daily.data!} />
        )}
      </ComponentCard>

      {/* Per kategori */}
      <ComponentCard
        title="Penjualan per Kategori"
        desc="Kontribusi tiap kategori terhadap penjualan"
        action={
          <ExportCsvButton
            filename={`laporan-kategori-${from}-${to}.csv`}
            rows={categories.data ?? []}
            columns={CATEGORY_COLUMNS}
          />
        }
      >
        {categories.loading && !categories.data ? (
          <Skeleton className="h-[220px] w-full" />
        ) : categories.error ? (
          <ErrorBlock message={categories.error} onRetry={categories.reload} />
        ) : (categories.data?.length ?? 0) === 0 ? (
          <EmptyBlock message="Belum ada penjualan pada periode ini" />
        ) : (
          <CategorySalesTable data={categories.data!} />
        )}
      </ComponentCard>

      {/* Per produk */}
      <ComponentCard
        title="Penjualan per Produk"
        desc="Cari total penjualan untuk produk tertentu"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <form
              className="flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                setQ(qInput.trim());
                setPage(1);
              }}
            >
              <input
                type="search"
                value={qInput}
                onChange={(event) => setQInput(event.target.value)}
                placeholder="Cari produk…"
                className={`${inputClass} w-44`}
              />
              <button type="submit" className={secondaryButtonClass}>
                Cari
              </button>
            </form>
            <ExportCsvButton
              filename={`laporan-produk-${from}-${to}.csv`}
              rows={products.data ?? []}
              columns={PRODUCT_COLUMNS}
            />
          </div>
        }
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as ProductSort);
              setPage(1);
            }}
            className={`${inputClass} w-48`}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {q && (
            <button
              type="button"
              onClick={() => {
                setQ("");
                setQInput("");
                setPage(1);
              }}
              className="text-theme-xs font-medium text-coffee-brown underline-offset-2 hover:underline dark:text-coffee-caramel"
            >
              Hapus filter “{q}”
            </button>
          )}
        </div>

        {products.loading && !products.data ? (
          <Skeleton className="h-[280px] w-full" />
        ) : products.error ? (
          <ErrorBlock message={products.error} onRetry={products.reload} />
        ) : (products.data?.length ?? 0) === 0 ? (
          <EmptyBlock
            message={q ? `Tidak ada penjualan untuk “${q}”` : "Belum ada penjualan pada periode ini"}
          />
        ) : (
          <>
            <ProductSalesTable
              data={products.data!}
              totalRevenue={summary.data?.itemRevenueIdr ?? 0}
            />
            {products.meta && (
              <div className="mt-4">
                <Pagination
                  page={products.meta.page}
                  totalPages={products.meta.totalPages}
                  total={products.meta.total}
                  unit="produk"
                  onPageChange={setPage}
                />
              </div>
            )}
          </>
        )}
      </ComponentCard>
    </div>
  );
}
