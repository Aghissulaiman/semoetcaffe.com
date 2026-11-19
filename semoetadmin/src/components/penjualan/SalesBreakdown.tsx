"use client";

import OrderStatusDonut from "@/components/charts/OrderStatusDonut";
import VerticalBarChart from "@/components/charts/VerticalBarChart";
import ComponentCard from "@/components/common/ComponentCard";
import { ErrorBlock, Skeleton } from "@/components/common/DataState";
import BreakdownList from "@/components/penjualan/BreakdownList";
import { useApi } from "@/hooks/useApi";
import { buildQuery } from "@/lib/client";
import { fulfillmentLabel, paymentMethodLabel, weekdayShortLabel } from "@/lib/labels";
import type { ReportBreakdown } from "@/types/api";

interface SalesBreakdownProps {
  from: string;
  to: string;
}

/** Urutan hari Senin → Minggu (0 = Minggu pada PostgreSQL DOW). */
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

/**
 * Seksi sebaran penjualan: metode pesanan, metode pembayaran, jam sibuk,
 * hari sibuk, dan status pesanan.
 */
export default function SalesBreakdown({ from, to }: SalesBreakdownProps) {
  const ready = Boolean(from && to);
  const breakdown = useApi<ReportBreakdown>(
    ready ? `/admin/reports/breakdown${buildQuery({ from, to })}` : null,
  );

  const data = breakdown.data;

  const hourlyMap = new Map((data?.hourly ?? []).map((item) => [String(item.key), item.revenueIdr]));
  const hourlyCategories = Array.from({ length: 24 }, (_, hour) => `${`${hour}`.padStart(2, "0")}:00`);
  const hourlySeries = Array.from({ length: 24 }, (_, hour) => hourlyMap.get(String(hour)) ?? 0);

  const weekdayMap = new Map((data?.weekday ?? []).map((item) => [String(item.key), item.revenueIdr]));
  const weekdayCategories = WEEKDAY_ORDER.map((dow) => weekdayShortLabel(dow));
  const weekdaySeries = WEEKDAY_ORDER.map((dow) => weekdayMap.get(String(dow)) ?? 0);

  if (breakdown.loading && !data) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-[240px] w-full" />
        <Skeleton className="h-[240px] w-full" />
      </div>
    );
  }

  if (breakdown.error) {
    return <ErrorBlock message={breakdown.error} onRetry={breakdown.reload} />;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ComponentCard title="Metode Pesanan" desc="Omzet menurut cara pesanan">
          <BreakdownList items={data?.fulfillment ?? []} labelOf={fulfillmentLabel} />
        </ComponentCard>
        <ComponentCard title="Metode Pembayaran" desc="Omzet menurut cara bayar">
          <BreakdownList
            items={data?.payment ?? []}
            labelOf={paymentMethodLabel}
            barClassName="bg-coffee-gold"
          />
        </ComponentCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ComponentCard title="Jam Sibuk" desc="Omzet per jam (waktu Jakarta)">
          <VerticalBarChart
            categories={hourlyCategories}
            series={hourlySeries}
            height={280}
            seriesName="Omzet"
          />
        </ComponentCard>
        <ComponentCard title="Hari Sibuk" desc="Omzet per hari dalam sepekan">
          <VerticalBarChart
            categories={weekdayCategories}
            series={weekdaySeries}
            height={280}
            seriesName="Omzet"
            color="#a9714b"
          />
        </ComponentCard>
      </div>

      <ComponentCard title="Status Pesanan" desc="Sebaran seluruh pesanan pada periode ini">
        {(data?.status?.length ?? 0) === 0 ? (
          <p className="py-6 text-center text-theme-sm text-coffee-muted">Belum ada data</p>
        ) : (
          <OrderStatusDonut data={data!.status} height={280} />
        )}
      </ComponentCard>
    </div>
  );
}
