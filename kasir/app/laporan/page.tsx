"use client";

import {
  Banknote,
  CalendarRange,
  Download,
  Package,
  Percent,
  Printer,
  ReceiptText,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import {
  BreakdownBars,
  HourlyChart,
  SalesBarChart,
} from "@/components/report-charts";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  PageHeader,
  PageLoader,
  StatCard,
} from "@/components/ui";
import { apiErrorFrom } from "@/lib/api";
import {
  formatDateLong,
  formatRupiah,
  formatTime,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
  ORDER_TYPE_SHORT,
  PAYMENT_METHOD_LABEL,
} from "@/lib/format";
import {
  buildReservationSummary,
  dailyPoints,
  hourlyPoints,
  isOrderInRange,
  ordersToCsv,
  paymentLabel,
  presetRange,
  type ReportPreset,
} from "@/lib/reports";
import { useKasir, type ReportsPayload } from "@/lib/store";
import { useToday } from "@/lib/use-today";

const PRESETS: { value: Exclude<ReportPreset, "custom">; label: string }[] = [
  { value: "today", label: "Hari Ini" },
  { value: "7d", label: "7 Hari" },
  { value: "30d", label: "30 Hari" },
  { value: "month", label: "Bulan Ini" },
];

export default function LaporanPage() {
  const {
    hydrated,
    orders,
    categories,
    reservations,
    fetchReports,
  } = useKasir();

  const [preset, setPreset] = useState<ReportPreset>("7d");
  const [customFrom, setCustomFrom] = useState<string | null>(null);
  const [customTo, setCustomTo] = useState<string | null>(null);
  const [data, setData] = useState<ReportsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = useToday();

  const range = useMemo(() => {
    if (!today) return null;
    if (preset === "custom") {
      if (customFrom && customTo) return { from: customFrom, to: customTo };
      return presetRange("7d");
    }
    return presetRange(preset);
  }, [today, preset, customFrom, customTo]);

  const from = range?.from ?? "";
  const to = range?.to ?? "";

  useEffect(() => {
    if (!hydrated || !range) return;
    const activeRange = range;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const payload = await fetchReports(activeRange);
        if (!cancelled) setData(payload);
      } catch (err) {
        if (!cancelled) setError(apiErrorFrom(err, "Gagal memuat laporan"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [hydrated, range, fetchReports]);

  const reservationSummary = useMemo(
    () =>
      range
        ? buildReservationSummary(reservations, range.from, range.to)
        : null,
    [reservations, range],
  );

  const paidOrders = useMemo(() => {
    if (!range) return [];
    return orders
      .filter(
        (order) =>
          order.paymentStatus === "paid" &&
          isOrderInRange(order, range.from, range.to),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [orders, range]);

  const dayPoints = useMemo(
    () => (data ? dailyPoints(data.daily) : []),
    [data],
  );
  const hourPoints = useMemo(
    () => (data ? hourlyPoints(data.breakdown.hourly).slice(8, 23) : []),
    [data],
  );

  function handlePreset(value: Exclude<ReportPreset, "custom">) {
    setPreset(value);
    setCustomFrom(null);
    setCustomTo(null);
  }

  function handleFromChange(value: string) {
    if (!value) return;
    setPreset("custom");
    setCustomFrom(value);
    setCustomTo((prev) => {
      const currentTo = prev ?? range?.to ?? value;
      return value > currentTo ? value : currentTo;
    });
  }

  function handleToChange(value: string) {
    if (!value) return;
    setPreset("custom");
    setCustomTo(value);
    setCustomFrom((prev) => {
      const currentFrom = prev ?? range?.from ?? value;
      return value < currentFrom ? value : currentFrom;
    });
  }

  function exportCsv() {
    if (paidOrders.length === 0) return;
    const csv = ordersToCsv(paidOrders);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `laporan-semoet-${from}-${to}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  if (!hydrated || !range || !reservationSummary) {
    return <PageLoader label="Menyiapkan laporan…" />;
  }

  if (loading && !data) {
    return <PageLoader label="Memuat laporan penjualan…" />;
  }

  const summary = data?.summary;

  return (
    <div className="print-area flex flex-col gap-4">
      <PageHeader
        title="Laporan"
        description="Ringkasan penjualan, metode pembayaran, menu terlaris, dan reservasi."
        actions={
          <>
            <Button
              variant="outline"
              onClick={exportCsv}
              disabled={paidOrders.length === 0}
            >
              <Download size={16} />
              Export CSV
            </Button>
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer size={16} />
              Cetak
            </Button>
          </>
        }
      />

      {error ? (
        <p className="rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">
          {error}
        </p>
      ) : null}

      <div className="no-print flex flex-col gap-3 rounded-2xl border border-line bg-surface p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
          {PRESETS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => handlePreset(item.value)}
              className={
                preset === item.value
                  ? "focus-ring shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white shadow-sm"
                  : "focus-ring shrink-0 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-bold text-ink-soft transition hover:border-primary/40 hover:text-primary"
              }
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <CalendarRange size={16} className="text-muted" />
          <Input
            type="date"
            value={from}
            onChange={(event) => handleFromChange(event.target.value)}
            className="h-10 w-auto text-xs"
            aria-label="Tanggal mulai"
          />
          <span className="text-xs font-semibold text-muted">s/d</span>
          <Input
            type="date"
            value={to}
            onChange={(event) => handleToChange(event.target.value)}
            className="h-10 w-auto text-xs"
            aria-label="Tanggal akhir"
          />
        </div>
      </div>

      <p className="text-xs text-muted">
        Menampilkan data{" "}
        <strong className="text-ink-soft">{formatDateLong(from)}</strong> –{" "}
        <strong className="text-ink-soft">{formatDateLong(to)}</strong> ·{" "}
        {summary?.orderCount ?? 0} transaksi dibayar
        {loading ? " · memperbarui…" : ""}
      </p>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Penjualan Bersih"
          value={formatRupiah(summary?.netSalesIdr ?? 0)}
          hint={`Kotor ${formatRupiah(summary?.grossSalesIdr ?? 0)}`}
          icon={<TrendingUp size={15} />}
          tone="success"
        />
        <StatCard
          label="Transaksi"
          value={summary?.orderCount ?? 0}
          hint="Sudah dibayar"
          icon={<ReceiptText size={15} />}
        />
        <StatCard
          label="Item Terjual"
          value={summary?.itemsSold ?? 0}
          hint="Total qty"
          icon={<Package size={15} />}
        />
        <StatCard
          label="Diskon"
          value={formatRupiah(summary?.discountIdr ?? 0)}
          hint="Total potongan"
          icon={<Percent size={15} />}
          tone="warning"
        />
        <StatCard
          label="Pajak"
          value={formatRupiah(summary?.taxIdr ?? 0)}
          hint="PB1"
          icon={<Wallet size={15} />}
          tone="danger"
        />
        <StatCard
          label="Laba"
          value={formatRupiah(summary?.profitIdr ?? 0)}
          hint="Setelah HPP"
          icon={<Banknote size={15} />}
          tone="info"
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.5fr_1fr]">
        <Card
          title="Omzet per Hari"
          subtitle="Hanya pesanan yang sudah dibayar"
        >
          <SalesBarChart data={dayPoints} />
        </Card>

        <Card title="Metode Pembayaran" subtitle="Distribusi omzet">
          <BreakdownBars
            data={(data?.breakdown.payment ?? []).map((item) => ({
              label: paymentLabel(item.key),
              amount: item.revenueIdr,
              count: item.orderCount,
            }))}
            emptyLabel="Belum ada pembayaran pada rentang ini."
          />
          <div className="mt-3 flex items-center justify-between rounded-xl bg-milk px-3 py-2 text-xs">
            <span className="flex items-center gap-1.5 font-bold text-ink-soft">
              <Banknote size={13} className="text-primary" />
              Total tagihan
            </span>
            <span className="font-black text-ink tabular">
              {formatRupiah(summary?.totalBilledIdr ?? 0)}
            </span>
          </div>
        </Card>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <Card title="Omzet per Kategori" subtitle="Kontribusi tiap kategori menu">
          <BreakdownBars
            data={(data?.categories ?? []).map((item) => ({
              label: item.categoryName,
              amount: item.revenueIdr,
              count: item.quantity,
              emoji:
                categories.find((category) => category.id === item.categoryId)
                  ?.emoji ?? "🍴",
            }))}
            barClassName="bg-gold"
            emptyLabel="Belum ada item terjual."
          />
        </Card>

        <Card title="Jam Sibuk" subtitle="Omzet per jam (08.00–22.00)">
          <HourlyChart data={hourPoints} />
        </Card>
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.3fr_1fr]">
        <Card title="Menu Terlaris" subtitle="Diurutkan berdasarkan omzet">
          {(data?.products ?? []).length === 0 ? (
            <p className="py-8 text-center text-xs text-muted">
              Belum ada menu terjual pada rentang ini.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[360px] text-xs">
                <thead>
                  <tr className="border-b border-line text-left text-[10px] uppercase tracking-wide text-muted">
                    <th className="pb-2 pr-2 font-bold">#</th>
                    <th className="pb-2 font-bold">Menu</th>
                    <th className="pb-2 text-right font-bold">Qty</th>
                    <th className="pb-2 text-right font-bold">Omzet</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.products ?? []).slice(0, 8).map((item, index) => (
                    <tr
                      key={item.productId}
                      className="border-b border-line/60 last:border-0"
                    >
                      <td className="py-2 pr-2 text-[10px] font-black text-muted">
                        {index + 1}
                      </td>
                      <td className="py-2 font-bold text-ink">
                        {item.productName}
                      </td>
                      <td className="py-2 text-right font-bold text-ink-soft tabular">
                        {item.quantity}
                      </td>
                      <td className="py-2 text-right font-black text-primary tabular">
                        {formatRupiah(item.revenueIdr)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card
          title="Reservasi"
          subtitle={`${formatDateLong(from)} – ${formatDateLong(to)}`}
        >
          <div className="grid grid-cols-2 gap-2">
            <MiniStat label="Total reservasi" value={reservationSummary.total} />
            <MiniStat
              label="Total tamu"
              value={reservationSummary.guests}
              icon={<Users size={12} />}
            />
            <MiniStat label="Menunggu" value={reservationSummary.requested} />
            <MiniStat label="Dikonfirmasi" value={reservationSummary.confirmed} />
            <MiniStat label="Sudah duduk" value={reservationSummary.seated} />
            <MiniStat label="Selesai" value={reservationSummary.completed} />
            <MiniStat
              label="Batal / no-show"
              value={reservationSummary.cancelled + reservationSummary.noShow}
            />
            <MiniStat
              label="Tamu hadir"
              value={
                reservationSummary.seated + reservationSummary.completed
              }
            />
          </div>
          <div className="mt-2 flex items-center justify-between rounded-xl bg-milk px-3 py-2 text-xs">
            <span className="flex items-center gap-1.5 font-bold text-ink-soft">
              <Banknote size={13} className="text-primary" />
              DP terkumpul
            </span>
            <span className="font-black text-ink tabular">
              {formatRupiah(reservationSummary.depositCollected)}
            </span>
          </div>
        </Card>
      </div>

      <Card
        title="Transaksi"
        subtitle={`${paidOrders.length} transaksi terbaru pada rentang ini`}
      >
        {paidOrders.length === 0 ? (
          <EmptyState
            icon={<ReceiptText size={22} />}
            title="Belum ada transaksi"
            description="Ubah rentang tanggal atau buat pesanan baru dari halaman Kasir."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-xs">
              <thead>
                <tr className="border-b border-line text-left text-[10px] uppercase tracking-wide text-muted">
                  <th className="pb-2 pr-3 font-bold">Kode</th>
                  <th className="pb-2 pr-3 font-bold">Jam</th>
                  <th className="pb-2 pr-3 font-bold">Pelanggan</th>
                  <th className="pb-2 pr-3 font-bold">Tipe</th>
                  <th className="pb-2 pr-3 text-right font-bold">Total</th>
                  <th className="pb-2 pr-3 font-bold">Metode</th>
                  <th className="pb-2 font-bold">Status</th>
                </tr>
              </thead>
              <tbody>
                {paidOrders.slice(0, 50).map((order) => (
                  <tr
                    key={order.id}
                    className="border-b border-line/60 last:border-0"
                  >
                    <td className="py-2 pr-3 font-mono text-[10px] font-bold text-primary">
                      {order.code}
                    </td>
                    <td className="py-2 pr-3 text-ink-soft tabular">
                      {formatTime(order.createdAt)}
                    </td>
                    <td className="py-2 pr-3 font-semibold text-ink">
                      {order.customerName ?? "Walk-in"}
                    </td>
                    <td className="py-2 pr-3 text-ink-soft">
                      {ORDER_TYPE_SHORT[order.type]}
                      {order.tableNumber ? ` · ${order.tableNumber}` : ""}
                    </td>
                    <td className="py-2 pr-3 text-right font-black text-ink tabular">
                      {formatRupiah(order.total)}
                    </td>
                    <td className="py-2 pr-3 text-ink-soft">
                      {order.paymentMethod
                        ? PAYMENT_METHOD_LABEL[order.paymentMethod]
                        : "-"}
                    </td>
                    <td className="py-2">
                      <Badge tone={ORDER_STATUS_TONE[order.status]}>
                        {ORDER_STATUS_LABEL[order.status]}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {paidOrders.length > 50 ? (
              <p className="mt-2 text-[11px] text-muted">
                Menampilkan 50 dari {paidOrders.length} transaksi. Export CSV
                untuk data lengkap yang termuat.
              </p>
            ) : null}
          </div>
        )}
      </Card>
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 shadow-[0_1px_0_rgba(42,26,17,0.04)]">
      <div className="mb-3">
        <h2 className="text-sm font-black text-ink">{title}</h2>
        {subtitle ? <p className="text-[11px] text-muted">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function MiniStat({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-xl bg-milk px-2.5 py-2">
      <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-muted">
        {icon}
        {label}
      </p>
      <p className="mt-0.5 text-base font-black text-ink tabular">{value}</p>
    </div>
  );
}
