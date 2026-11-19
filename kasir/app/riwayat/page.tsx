"use client";

import {
  CalendarRange,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  History,
  ReceiptText,
  Search,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { ReceiptModal } from "@/components/receipt-modal";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  PageHeader,
  PageLoader,
} from "@/components/ui";
import { apiErrorFrom, request, type ApiOrder } from "@/lib/api";
import {
  formatDateLong,
  formatDateTime,
  formatRupiah,
  ORDER_TYPE_SHORT,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
} from "@/lib/format";
import { presetRange, type ReportPreset } from "@/lib/reports";
import { toOrder, useKasir } from "@/lib/store";
import type { Order } from "@/lib/types";
import { useToday } from "@/lib/use-today";

const PAGE_SIZE = 20;

const PRESETS: { value: Exclude<ReportPreset, "custom">; label: string }[] = [
  { value: "today", label: "Hari Ini" },
  { value: "7d", label: "7 Hari" },
  { value: "30d", label: "30 Hari" },
  { value: "month", label: "Bulan Ini" },
];

export default function RiwayatPage() {
  const router = useRouter();
  const { hydrated, branchId, user } = useKasir();
  const today = useToday();

  const [preset, setPreset] = useState<ReportPreset>("30d");
  const [customFrom, setCustomFrom] = useState<string | null>(null);
  const [customTo, setCustomTo] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Order | null>(null);
  const loadedBranchRef = useRef<string | null>(null);

  const range = useMemo(() => {
    if (!today) return null;
    if (preset === "custom") {
      if (customFrom && customTo) return { from: customFrom, to: customTo };
      return presetRange("30d");
    }
    return presetRange(preset);
  }, [today, preset, customFrom, customTo]);

  const cashier = user?.displayName ?? "Kasir";

  useEffect(() => {
    if (!hydrated || !branchId || !range) return;

    let cancelled = false;
    const timer = window.setTimeout(
      () => {
        setLoading(true);
        setError(null);

        // Jangan tampilkan data cabang lama saat kasir berganti cabang.
        if (loadedBranchRef.current !== branchId) {
          loadedBranchRef.current = branchId;
          setOrders([]);
          setTotal(0);
          setSelected(null);
          if (page !== 1) {
            setPage(1);
            return;
          }
        }

        void (async () => {
          try {
            const result = await request<ApiOrder[]>("/admin/orders", {
              query: {
                branchId,
                orderStatus: "completed",
                from: range.from,
                to: range.to,
                limit: PAGE_SIZE,
                page,
                sort: "recent",
                q: search.trim() || undefined,
              },
            });
            if (cancelled) return;
            setOrders(
              (result.data ?? []).map((row) => toOrder(row, cashier)),
            );
            setTotal(result.meta?.total ?? result.data?.length ?? 0);
          } catch (err) {
            if (!cancelled) {
              setError(apiErrorFrom(err, "Gagal memuat riwayat pesanan"));
            }
          } finally {
            if (!cancelled) setLoading(false);
          }
        })();
      },
      search.trim() ? 300 : 0,
    );

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [hydrated, branchId, range, page, search, cashier]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageRevenue = orders
    .filter((order) => order.paymentStatus === "paid")
    .reduce((sum, order) => sum + order.total, 0);

  function handlePreset(value: Exclude<ReportPreset, "custom">) {
    setPreset(value);
    setCustomFrom(null);
    setCustomTo(null);
    setPage(1);
  }

  function handleFromChange(value: string) {
    if (!value) return;
    setPreset("custom");
    setCustomFrom(value);
    setCustomTo((prev) => {
      const currentTo = prev ?? range?.to ?? value;
      return value > currentTo ? value : currentTo;
    });
    setPage(1);
  }

  function handleToChange(value: string) {
    if (!value) return;
    setPreset("custom");
    setCustomTo(value);
    setCustomFrom((prev) => {
      const currentFrom = prev ?? range?.from ?? value;
      return value < currentFrom ? value : currentFrom;
    });
    setPage(1);
  }

  if (!hydrated || !today || !range) {
    return <PageLoader label="Menyiapkan riwayat pesanan…" />;
  }

  if (loading && orders.length === 0) {
    return <PageLoader label="Memuat riwayat pesanan…" />;
  }

  const from = range.from;
  const to = range.to;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Riwayat Pesanan"
        description="Pesanan yang sudah selesai disimpan di sini supaya antrean aktif tetap ringkas."
        actions={
          <Button variant="outline" onClick={() => router.push("/pesanan")}>
            <ReceiptText size={16} />
            Pesanan Aktif
          </Button>
        }
      />

      {error ? (
        <p className="rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-3 lg:flex-row lg:items-center lg:justify-between">
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

      <div className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs text-muted">
            <strong className="text-ink-soft">{total}</strong> pesanan selesai ·{" "}
            {formatDateLong(from)} – {formatDateLong(to)}
            {loading ? " · memperbarui…" : ""}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">
            Nilai halaman ini:{" "}
            <strong className="text-ink-soft">
              {formatRupiah(pageRevenue)}
            </strong>
          </p>
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Cari kode / nama / meja…"
            className="h-10 pl-9 text-xs"
          />
        </div>
      </div>

      {orders.length === 0 ? (
        <EmptyState
          icon={<History size={22} />}
          title="Belum ada riwayat"
          description="Pesanan yang sudah diselesaikan akan muncul di sini."
        />
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {orders.map((order) => (
            <article
              key={order.id}
              className="flex flex-col rounded-2xl border border-line bg-surface p-4 shadow-[0_1px_0_rgba(42,26,17,0.04)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-xs font-black text-primary">
                      {order.code}
                    </p>
                    <Badge tone="success">
                      <CheckCircle2 size={11} />
                      Selesai
                    </Badge>
                    <Badge
                      tone={
                        order.paymentStatus === "paid"
                          ? "success"
                          : order.paymentStatus === "pending"
                            ? "warning"
                            : "default"
                      }
                    >
                      {PAYMENT_STATUS_LABEL[order.paymentStatus] ??
                        order.paymentStatus}
                    </Badge>
                  </div>
                  <p className="mt-1 truncate text-sm font-black text-ink">
                    {order.customerName ?? "Walk-in"}
                  </p>
                  <p className="text-[11px] text-muted">
                    {formatDateTime(order.createdAt)} ·{" "}
                    {ORDER_TYPE_SHORT[order.type]}
                    {order.tableNumber ? ` · ${order.tableNumber}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-black text-ink tabular">
                    {formatRupiah(order.total)}
                  </p>
                  <p className="text-[11px] text-muted">
                    {order.paymentMethod
                      ? PAYMENT_METHOD_LABEL[order.paymentMethod]
                      : "Belum dibayar"}
                  </p>
                </div>
              </div>

              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {order.items.slice(0, 3).map((item) => (
                  <span
                    key={item.key}
                    className="rounded-lg bg-milk px-2 py-1 text-[10px] font-semibold text-ink-soft"
                  >
                    {item.qty}x {item.name}
                  </span>
                ))}
                {order.items.length > 3 ? (
                  <span className="rounded-lg bg-milk px-2 py-1 text-[10px] font-semibold text-muted">
                    +{order.items.length - 3} lainnya
                  </span>
                ) : null}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line/70 pt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelected(order)}
                >
                  <ReceiptText size={14} />
                  Detail
                </Button>
                <span className="ml-auto text-[11px] font-semibold text-muted">
                  {order.items.length} item
                </span>
              </div>
            </article>
          ))}
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-surface p-3">
          <p className="text-xs font-semibold text-muted">
            Halaman {page} dari {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              <ChevronLeft size={14} />
              Sebelumnya
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() =>
                setPage((value) => Math.min(totalPages, value + 1))
              }
            >
              Berikutnya
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      ) : null}

      <ReceiptModal order={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
