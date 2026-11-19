"use client";

import SalesAreaChart from "@/components/charts/SalesAreaChart";
import ComponentCard from "@/components/common/ComponentCard";
import { EmptyBlock, ErrorBlock, KpiSkeleton, Skeleton } from "@/components/common/DataState";
import ExportCsvButton from "@/components/common/ExportCsvButton";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import KpiCard from "@/components/dashboard/KpiCard";
import ProductSalesSearch from "@/components/laporan/ProductSalesSearch";
import DailySalesTable from "@/components/penjualan/DailySalesTable";
import SalesBreakdown from "@/components/penjualan/SalesBreakdown";
import SalesFilterBar from "@/components/penjualan/SalesFilterBar";
import { useApi } from "@/hooks/useApi";
import { useDateRange } from "@/hooks/useDateRange";
import { buildQuery } from "@/lib/client";
import { percentChange, previousRange } from "@/lib/date-range";
import { formatDayMonth, formatIdr, formatNumber } from "@/lib/format";
import type { CsvColumn } from "@/lib/csv";
import { DollarLineIcon, ListIcon, ShootingStarIcon, TrashBinIcon } from "@/icons";
import type { DailySales, SalesSummary } from "@/types/api";
import { useState } from "react";

const DAILY_COLUMNS: CsvColumn<DailySales>[] = [
  { header: "Tanggal", value: (row) => row.businessDate },
  { header: "Pesanan", value: (row) => row.orderCount },
  { header: "Omzet (Rp)", value: (row) => row.paidSalesIdr },
];

export default function PenjualanPage() {
  const initial = useDateRange(30);
  const [fromOverride, setFromOverride] = useState<string | null>(null);
  const [toOverride, setToOverride] = useState<string | null>(null);

  const from = fromOverride ?? initial?.from ?? "";
  const to = toOverride ?? initial?.to ?? "";
  const ready = Boolean(from && to);

  const prev = ready ? previousRange(from, to) : null;

  const sales = useApi<DailySales[]>(
    ready ? `/admin/dashboard/sales${buildQuery({ from, to, limit: 100 })}` : null,
  );
  const summary = useApi<SalesSummary>(
    ready ? `/admin/dashboard/sales-summary${buildQuery({ from, to })}` : null,
  );
  const prevSummary = useApi<SalesSummary>(
    prev ? `/admin/dashboard/sales-summary${buildQuery({ from: prev.from, to: prev.to })}` : null,
  );

  const daily = [...(sales.data ?? [])].sort((a, b) =>
    a.businessDate.localeCompare(b.businessDate),
  );
  const categories = daily.map((item) => formatDayMonth(item.businessDate));
  const series = daily.map((item) => item.paidSalesIdr);

  const change = (current: number | undefined, previous: number | undefined) =>
    percentChange(current ?? 0, previous ?? 0);

  const handleReset = () => {
    setFromOverride(null);
    setToOverride(null);
  };

  return (
    <div className="space-y-6">
      <PageBreadcrumb pageTitle="Penjualan" items={[{ label: "Penjualan" }]} />

      <SalesFilterBar
        from={from}
        to={to}
        onRangeChange={(nextFrom, nextTo) => {
          setFromOverride(nextFrom);
          setToOverride(nextTo);
        }}
        onReset={handleReset}
      />

      {/* KPI + perbandingan periode sebelumnya */}
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
              label="Total Omzet"
              value={formatIdr(summary.data?.paidSalesIdr)}
              icon={<DollarLineIcon />}
              tone="coffee"
              delta={{ pct: change(summary.data?.paidSalesIdr, prevSummary.data?.paidSalesIdr) }}
            />
            <KpiCard
              label="Total Pesanan"
              value={formatNumber(summary.data?.totalOrders)}
              icon={<ListIcon />}
              tone="gold"
              delta={{ pct: change(summary.data?.totalOrders, prevSummary.data?.totalOrders) }}
            />
            <KpiCard
              label="Rata-rata / Pesanan"
              value={formatIdr(summary.data?.averageOrderIdr)}
              icon={<ShootingStarIcon />}
              tone="success"
              delta={{
                pct: change(summary.data?.averageOrderIdr, prevSummary.data?.averageOrderIdr),
              }}
            />
            <KpiCard
              label="Pesanan Dibatalkan"
              value={formatNumber(summary.data?.cancelledOrderCount)}
              icon={<TrashBinIcon />}
              tone="danger"
              delta={{
                pct: change(
                  summary.data?.cancelledOrderCount,
                  prevSummary.data?.cancelledOrderCount,
                ),
                invert: true,
              }}
            />
          </>
        )}
      </div>

      {/* Grafik */}
      <ComponentCard
        title="Tren Omzet Harian"
        desc={from && to ? `${formatDayMonth(from)} – ${formatDayMonth(to)}` : undefined}
      >
        {sales.loading && !sales.data ? (
          <Skeleton className="h-[320px] w-full" />
        ) : sales.error ? (
          <ErrorBlock message={sales.error} onRetry={sales.reload} />
        ) : series.length === 0 ? (
          <EmptyBlock message="Belum ada penjualan pada periode ini" />
        ) : (
          <SalesAreaChart categories={categories} series={series} height={320} />
        )}
      </ComponentCard>

      {/* Sebaran penjualan */}
      <SalesBreakdown from={from} to={to} />

      {/* Tabel harian */}
      <ComponentCard
        title="Rincian Harian"
        desc="Omzet per hari pada periode terpilih"
        action={
          <ExportCsvButton
            filename={`penjualan-harian-${from}-${to}.csv`}
            rows={sales.data ?? []}
            columns={DAILY_COLUMNS}
          />
        }
      >
        {sales.loading && !sales.data ? (
          <Skeleton className="h-[280px] w-full" />
        ) : sales.error ? (
          <ErrorBlock message={sales.error} onRetry={sales.reload} />
        ) : (sales.data?.length ?? 0) === 0 ? (
          <EmptyBlock message="Belum ada data" />
        ) : (
          <DailySalesTable data={sales.data!} />
        )}
      </ComponentCard>

      {/* Cari total penjualan produk tertentu */}
      <ProductSalesSearch from={from} to={to} />
    </div>
  );
}
