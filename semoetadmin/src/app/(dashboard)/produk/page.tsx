"use client";

import TopProductsBarChart from "@/components/charts/TopProductsBarChart";
import ComponentCard from "@/components/common/ComponentCard";
import DateRangePicker from "@/components/common/DateRangePicker";
import { EmptyBlock, ErrorBlock, KpiSkeleton, Skeleton } from "@/components/common/DataState";
import ExportCsvButton from "@/components/common/ExportCsvButton";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import KpiCard from "@/components/dashboard/KpiCard";
import CategorySalesTable from "@/components/laporan/CategorySalesTable";
import ProductSalesSearch from "@/components/laporan/ProductSalesSearch";
import TopProductsTable from "@/components/produk/TopProductsTable";
import { useApi } from "@/hooks/useApi";
import { useDateRange } from "@/hooks/useDateRange";
import { BoxCubeIcon, DollarLineIcon, ListIcon, ShootingStarIcon } from "@/icons";
import { buildQuery } from "@/lib/client";
import type { CsvColumn } from "@/lib/csv";
import { percentChange, previousRange } from "@/lib/date-range";
import { formatIdr, formatNumber } from "@/lib/format";
import { inputClass, secondaryButtonClass } from "@/lib/ui";
import { cn } from "@/utils";
import type { CategorySales, ReportSales, TopProduct } from "@/types/api";
import { useMemo, useState } from "react";

type Metric = "revenue" | "quantity";

const TOP_COLUMNS: CsvColumn<TopProduct>[] = [
  { header: "Produk", value: (row) => row.productName },
  { header: "Unit terjual", value: (row) => row.totalQuantity },
  { header: "Omzet (Rp)", value: (row) => row.totalRevenueIdr },
];

const CATEGORY_COLUMNS: CsvColumn<CategorySales>[] = [
  { header: "Kategori", value: (row) => row.categoryName },
  { header: "Item terjual", value: (row) => row.quantity },
  { header: "Pesanan", value: (row) => row.orderCount },
  { header: "Omzet (Rp)", value: (row) => row.revenueIdr },
  { header: "Modal (Rp)", value: (row) => row.cogsIdr },
  { header: "Laba (Rp)", value: (row) => row.profitIdr },
];

export default function ProdukPage() {
  const initial = useDateRange(30);
  const [fromOverride, setFromOverride] = useState<string | null>(null);
  const [toOverride, setToOverride] = useState<string | null>(null);
  const [limit, setLimit] = useState("10");
  const [metric, setMetric] = useState<Metric>("revenue");

  const from = fromOverride ?? initial?.from ?? "";
  const to = toOverride ?? initial?.to ?? "";
  const ready = Boolean(from && to);
  const prev = ready ? previousRange(from, to) : null;

  const products = useApi<TopProduct[]>(
    ready ? `/admin/dashboard/top-products${buildQuery({ from, to, limit })}` : null,
  );
  const summary = useApi<ReportSales>(
    ready ? `/admin/reports/sales${buildQuery({ from, to })}` : null,
  );
  const prevSummary = useApi<ReportSales>(
    prev ? `/admin/reports/sales${buildQuery({ from: prev.from, to: prev.to })}` : null,
  );
  const categories = useApi<CategorySales[]>(
    ready ? `/admin/reports/categories${buildQuery({ from, to })}` : null,
  );

  const rows = useMemo(() => {
    const list = [...(products.data ?? [])];
    if (metric === "quantity") {
      return list.sort((a, b) => b.totalQuantity - a.totalQuantity);
    }
    return list.sort((a, b) => b.totalRevenueIdr - a.totalRevenueIdr);
  }, [products.data, metric]);

  const chartCategories = rows.map((row) => row.productName);
  const chartSeries = rows.map((row) =>
    metric === "revenue" ? row.totalRevenueIdr : row.totalQuantity,
  );

  const categoryRows = categories.data ?? [];
  const categoryChartCategories = categoryRows.map((row) => row.categoryName);
  const categoryChartSeries = categoryRows.map((row) => row.revenueIdr);

  const change = (current: number | undefined, previous: number | undefined) =>
    percentChange(current ?? 0, previous ?? 0);

  const handleReset = () => {
    setFromOverride(null);
    setToOverride(null);
    setLimit("10");
  };

  return (
    <div className="space-y-6">
      <PageBreadcrumb pageTitle="Produk" items={[{ label: "Produk" }]} />

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-coffee-linen bg-white p-4 dark:border-coffee-night-border dark:bg-coffee-night-soft">
        <label className="flex flex-col gap-1">
          <span className="text-theme-xs font-medium text-coffee-muted">Periode</span>
          <DateRangePicker
            from={from}
            to={to}
            onChange={(nextFrom, nextTo) => {
              setFromOverride(nextFrom);
              setToOverride(nextTo);
            }}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-theme-xs font-medium text-coffee-muted">Jumlah</span>
          <select
            value={limit}
            onChange={(event) => setLimit(event.target.value)}
            className={inputClass}
          >
            <option value="5">Top 5</option>
            <option value="10">Top 10</option>
            <option value="20">Top 20</option>
            <option value="50">Top 50</option>
          </select>
        </label>
        <button type="button" onClick={handleReset} className={`ms-auto ${secondaryButtonClass}`}>
          Reset
        </button>
      </div>

      {/* Ringkasan (akurat dari laporan penjualan) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summary.loading && !summary.data ? (
          <>
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
          </>
        ) : summary.error ? (
          <div className="sm:col-span-2 xl:col-span-4">
            <ErrorBlock message={summary.error} onRetry={summary.reload} />
          </div>
        ) : (
          <>
            <KpiCard
              label="Omzet Produk"
              value={formatIdr(summary.data?.itemRevenueIdr)}
              icon={<DollarLineIcon />}
              tone="coffee"
              delta={{ pct: change(summary.data?.itemRevenueIdr, prevSummary.data?.itemRevenueIdr) }}
            />
            <KpiCard
              label="Unit Terjual"
              value={formatNumber(summary.data?.itemsSold)}
              icon={<ListIcon />}
              tone="gold"
              delta={{ pct: change(summary.data?.itemsSold, prevSummary.data?.itemsSold) }}
            />
            <KpiCard
              label="Laba"
              value={formatIdr(summary.data?.profitIdr)}
              icon={<ShootingStarIcon />}
              tone="success"
              delta={{ pct: change(summary.data?.profitIdr, prevSummary.data?.profitIdr) }}
            />
            <KpiCard
              label="Produk Terjual"
              value={formatNumber(summary.data?.productCount)}
              icon={<BoxCubeIcon />}
              tone="muted"
              delta={{ pct: change(summary.data?.productCount, prevSummary.data?.productCount) }}
            />
          </>
        )}
      </div>

      <ComponentCard
        title="Produk Terlaris"
        desc="Berdasarkan periode terpilih"
        action={
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-coffee-linen p-0.5 dark:border-coffee-night-border">
              {(["revenue", "quantity"] as Metric[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setMetric(option)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-theme-xs font-semibold transition-colors",
                    metric === option
                      ? "bg-coffee-brown text-coffee-milk dark:bg-coffee-caramel dark:text-coffee-night"
                      : "text-coffee-muted hover:text-coffee-brown",
                  )}
                >
                  {option === "revenue" ? "Omzet" : "Jumlah"}
                </button>
              ))}
            </div>
            <ExportCsvButton
              filename={`produk-terlaris-${from}-${to}.csv`}
              rows={rows}
              columns={TOP_COLUMNS}
            />
          </div>
        }
      >
        {products.loading && !products.data ? (
          <Skeleton className="h-[340px] w-full" />
        ) : products.error ? (
          <ErrorBlock message={products.error} onRetry={products.reload} />
        ) : rows.length === 0 ? (
          <EmptyBlock message="Belum ada penjualan produk pada periode ini" />
        ) : (
          <TopProductsBarChart
            categories={chartCategories}
            series={chartSeries}
            height={Math.max(240, rows.length * 42)}
            seriesName={metric === "revenue" ? "Omzet" : "Unit"}
          />
        )}
      </ComponentCard>

      <ComponentCard title="Rincian Produk" desc="Kontribusi tiap produk">
        {products.loading && !products.data ? (
          <Skeleton className="h-[280px] w-full" />
        ) : products.error ? (
          <ErrorBlock message={products.error} onRetry={products.reload} />
        ) : rows.length === 0 ? (
          <EmptyBlock />
        ) : (
          <TopProductsTable data={rows} />
        )}
      </ComponentCard>

      {/* Per kategori */}
      <ComponentCard
        title="Penjualan per Kategori"
        desc="Kategori penyumbang omzet terbesar"
        action={
          <ExportCsvButton
            filename={`produk-kategori-${from}-${to}.csv`}
            rows={categoryRows}
            columns={CATEGORY_COLUMNS}
          />
        }
      >
        {categories.loading && !categories.data ? (
          <Skeleton className="h-[280px] w-full" />
        ) : categories.error ? (
          <ErrorBlock message={categories.error} onRetry={categories.reload} />
        ) : categoryRows.length === 0 ? (
          <EmptyBlock message="Belum ada penjualan pada periode ini" />
        ) : (
          <div className="space-y-6">
            <TopProductsBarChart
              categories={categoryChartCategories}
              series={categoryChartSeries}
              height={Math.max(200, categoryRows.length * 46)}
              seriesName="Omzet"
            />
            <CategorySalesTable data={categoryRows} />
          </div>
        )}
      </ComponentCard>

      {/* Cari total penjualan produk tertentu */}
      <ProductSalesSearch from={from} to={to} />
    </div>
  );
}
