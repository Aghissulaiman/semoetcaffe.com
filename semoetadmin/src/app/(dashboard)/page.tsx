"use client";

import OrderStatusDonut from "@/components/charts/OrderStatusDonut";
import SalesAreaChart from "@/components/charts/SalesAreaChart";
import ComponentCard from "@/components/common/ComponentCard";
import { EmptyBlock, ErrorBlock, KpiSkeleton, Skeleton } from "@/components/common/DataState";
import KpiCard from "@/components/dashboard/KpiCard";
import OperationalStats from "@/components/dashboard/OperationalStats";
import OrderStatusBreakdown from "@/components/dashboard/OrderStatusBreakdown";
import RecentActivity from "@/components/dashboard/RecentActivity";
import TopCustomers from "@/components/dashboard/TopCustomers";
import TopProductsList from "@/components/dashboard/TopProductsList";
import { useApi } from "@/hooks/useApi";
import { useDateRange } from "@/hooks/useDateRange";
import { useIsClient } from "@/hooks/useIsClient";
import { useSession } from "@/hooks/useSession";
import { hasPermission } from "@/lib/access";
import { useOrderNotification } from '@/components/common/NotificationSound';
import {
  BoxCubeIcon,
  DollarLineIcon,
  ListIcon,
  RefreshIcon,
  ShootingStarIcon,
} from "@/icons";
import { formatDayMonth, formatIdr, formatNumber } from "@/lib/format";
import type {
  AdminUser,
  AuditLog,
  DailySales,
  DashboardOverview,
  SalesSummary,
  TopProduct,
} from "@/types/api";
import { cn } from "@/utils";

const RANGE_DAYS = 14;

export default function DashboardPage() {
  const { me } = useSession();
  const { play: playNotificationSound } = useOrderNotification();

  // Notifikasi suara saat ada order baru
    // Gunakan playNotificationSound() saat order baru datang

  const isClient = useIsClient();
  const range = useDateRange(RANGE_DAYS);

  const overview = useApi<DashboardOverview>("/admin/dashboard/overview");
  const sales = useApi<DailySales[]>(
    range ? `/admin/dashboard/sales?from=${range.from}&to=${range.to}&limit=60` : null,
  );
  const summary = useApi<SalesSummary>(
    range ? `/admin/dashboard/sales-summary?from=${range.from}&to=${range.to}` : null,
  );
  const topProducts = useApi<TopProduct[]>("/admin/dashboard/top-products?limit=5");

  // Seksi tambahan hanya dimuat bila perannya punya izin, supaya pengguna
  // dengan akses terbatas tidak melihat kartu error 403.
  const canReadAudit = hasPermission(me?.permissions, "audit:read");
  const canReadUsers = hasPermission(me?.permissions, "user:read");
  const auditLogs = useApi<AuditLog[]>(canReadAudit ? "/admin/audit-logs?limit=6" : null);
  const users = useApi<AdminUser[]>(canReadUsers ? "/admin/users?limit=100" : null);

  const daily = [...(sales.data ?? [])].sort((a, b) =>
    a.businessDate.localeCompare(b.businessDate),
  );
  const categories = daily.map((item) => formatDayMonth(item.businessDate));
  const series = daily.map((item) => item.paidSalesIdr);

  const today = isClient
    ? new Intl.DateTimeFormat("id-ID", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date())
    : "";

  const greetingName = me?.user.displayName?.split(" ")[0] ?? "Pemilik";

  const refreshing =
    overview.loading ||
    sales.loading ||
    summary.loading ||
    topProducts.loading ||
    auditLogs.loading ||
    users.loading;

  const refreshAll = () => {
    overview.reload();
    sales.reload();
    summary.reload();
    topProducts.reload();
    auditLogs.reload();
    users.reload();
  };

  const statusData = overview.data?.orders.byStatus ?? [];

  return (
    <div className="space-y-6">
      {/* Sapaan */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-coffee-espresso dark:text-coffee-cream">
            Selamat datang, {greetingName} 👋
          </h2>
          <p className="mt-0.5 text-theme-sm text-coffee-muted">
            {today || "\u00A0"}
          </p>
        </div>
        <button
          type="button"
          onClick={refreshAll}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-coffee-linen bg-white px-3.5 py-2 text-theme-sm font-medium text-coffee-dark transition-colors hover:bg-coffee-milk disabled:cursor-not-allowed disabled:opacity-60 dark:border-coffee-night-border dark:bg-coffee-night-soft dark:text-coffee-cream dark:hover:bg-white/5"
        >
          <RefreshIcon className={cn("h-4 w-4", refreshing && "animate-spin")} />
          Muat ulang
        </button>
      </div>

      {/* KPI utama */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {overview.loading && !overview.data ? (
          <>
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
          </>
        ) : overview.error ? (
          <div className="sm:col-span-2 xl:col-span-4">
            <ErrorBlock message={overview.error} onRetry={overview.reload} />
          </div>
        ) : (
          <>
            <KpiCard
              label="Omzet Hari Ini"
              value={formatIdr(overview.data?.orders.todayRevenueIdr)}
              hint="Total pembayaran berhasil hari ini"
              icon={<DollarLineIcon />}
              tone="coffee"
            />
            <KpiCard
              label="Pesanan Hari Ini"
              value={formatNumber(overview.data?.orders.todayOrders)}
              hint="Jumlah pesanan masuk hari ini"
              icon={<ListIcon />}
              tone="gold"
            />
            <KpiCard
              label="Pesanan Aktif"
              value={formatNumber(overview.data?.orders.activeOrders)}
              hint="Sedang berjalan / belum selesai"
              icon={<BoxCubeIcon />}
              tone="success"
            />
            <KpiCard
              label="Pesanan Pending"
              value={formatNumber(overview.data?.orders.pendingOrders)}
              hint="Menunggu diproses"
              icon={<ShootingStarIcon />}
              tone="warning"
            />
          </>
        )}
      </div>

      {/* Statistik operasional */}
      <OperationalStats data={overview.data ?? undefined} loading={overview.loading && !overview.data} />

      {/* Grafik omzet + status */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ComponentCard
            title="Tren Omzet"
            desc={
              range
                ? `${RANGE_DAYS} hari terakhir · ${formatDayMonth(range.from)} – ${formatDayMonth(range.to)}`
                : `${RANGE_DAYS} hari terakhir`
            }
            action={
              summary.data ? (
                <div className="text-end">
                  <p className="text-theme-xs text-coffee-muted">Total</p>
                  <p className="text-base font-bold text-coffee-brown dark:text-coffee-caramel">
                    {formatIdr(summary.data.paidSalesIdr)}
                  </p>
                </div>
              ) : null
            }
          >
            {sales.loading && !sales.data ? (
              <Skeleton className="h-[300px] w-full" />
            ) : sales.error ? (
              <ErrorBlock message={sales.error} onRetry={sales.reload} />
            ) : series.length === 0 ? (
              <EmptyBlock message="Belum ada data penjualan pada periode ini" />
            ) : (
              <SalesAreaChart categories={categories} series={series} />
            )}
          </ComponentCard>
        </div>

        <ComponentCard title="Status Pesanan" desc="Seluruh pesanan">
          {overview.loading && !overview.data ? (
            <Skeleton className="h-[220px] w-full" />
          ) : statusData.length === 0 ? (
            <EmptyBlock message="Belum ada pesanan" />
          ) : (
            <div className="space-y-5">
              <OrderStatusDonut data={statusData} height={200} showLegend={false} />
              <OrderStatusBreakdown data={statusData} />
            </div>
          )}
        </ComponentCard>
      </div>

      {/* Produk terlaris + ringkasan */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ComponentCard title="Produk Terlaris" desc="Berdasarkan omzet sepanjang waktu">
            {topProducts.loading && !topProducts.data ? (
              <Skeleton className="h-[240px] w-full" />
            ) : topProducts.error ? (
              <ErrorBlock message={topProducts.error} onRetry={topProducts.reload} />
            ) : (topProducts.data?.length ?? 0) === 0 ? (
              <EmptyBlock message="Belum ada penjualan produk" />
            ) : (
              <TopProductsList products={topProducts.data!} />
            )}
          </ComponentCard>
        </div>

        <ComponentCard title="Ringkasan Periode" desc={`${RANGE_DAYS} hari terakhir`}>
          {summary.loading && !summary.data ? (
            <Skeleton className="h-[240px] w-full" />
          ) : summary.error ? (
            <ErrorBlock message={summary.error} onRetry={summary.reload} />
          ) : (
            <dl className="space-y-4">
              <SummaryRow label="Total Pesanan" value={formatNumber(summary.data?.totalOrders)} />
              <SummaryRow label="Total Omzet" value={formatIdr(summary.data?.paidSalesIdr)} />
              <SummaryRow
                label="Rata-rata / Pesanan"
                value={formatIdr(summary.data?.averageOrderIdr)}
              />
              <SummaryRow label="Hari Aktif" value={formatNumber(summary.data?.activeDays)} />
              <SummaryRow
                label="Pesanan Dibatalkan"
                value={formatNumber(summary.data?.cancelledOrderCount)}
              />
            </dl>
          )}
        </ComponentCard>
      </div>

      {/* Aktivitas terbaru */}
      <ComponentCard title="Aktivitas Terbaru" desc="Jejak audit sistem">
        <RecentActivity
          logs={auditLogs.data}
          loading={auditLogs.loading}
          error={auditLogs.error}
          onRetry={auditLogs.reload}
        />
      </ComponentCard>

      {/* Pelanggan teratas */}
      <ComponentCard title="Pelanggan Teratas" desc="Berdasarkan total belanja sepanjang waktu">
        <TopCustomers users={users.data} loading={users.loading} limit={5} />
      </ComponentCard>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-dashed border-coffee-linen pb-3 last:border-0 last:pb-0 dark:border-coffee-night-border">
      <dt className="text-theme-sm text-coffee-muted">{label}</dt>
      <dd className="text-theme-sm font-semibold text-coffee-espresso dark:text-coffee-cream">
        {value}
      </dd>
    </div>
  );
}
