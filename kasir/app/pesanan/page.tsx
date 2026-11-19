"use client";

import {
  Banknote,
  CheckCircle2,
  ChefHat,
  History,
  PackageCheck,
  ReceiptText,
  Search,
  Truck,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { PaymentModal } from "@/components/payment-modal";
import { ReceiptModal } from "@/components/receipt-modal";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  PageLoader,
  Segmented,
  StatCard,
} from "@/components/ui";
import { apiErrorFrom } from "@/lib/api";
import {
  formatDateTime,
  formatRupiah,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
  ORDER_TYPE_SHORT,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
} from "@/lib/format";
import { orderDateKey } from "@/lib/reports";
import { useKasir } from "@/lib/store";
import { useToday } from "@/lib/use-today";
import type { Order, OrderStatus, PaymentMethod } from "@/lib/types";

type Filter = "all" | "unpaid" | "active" | "cancelled";

const ACTIVE_STATUSES: OrderStatus[] = [
  "placed",
  "accepted",
  "preparing",
  "ready",
  "out_for_delivery",
];

const CLOSED_STATUSES: OrderStatus[] = ["cancelled", "rejected"];

function isActive(order: Order): boolean {
  return ACTIVE_STATUSES.includes(order.status);
}

function nextAction(
  order: Order,
): { label: string; status: OrderStatus; icon: typeof CheckCircle2 } | null {
  if (order.status === "placed")
    return { label: "Terima", status: "accepted", icon: CheckCircle2 };
  if (order.status === "accepted")
    return { label: "Siapkan", status: "preparing", icon: ChefHat };
  if (order.status === "preparing")
    return { label: "Siap", status: "ready", icon: PackageCheck };
  if (order.status === "ready" && order.type === "delivery")
    return { label: "Kirim", status: "out_for_delivery", icon: Truck };
  if (order.status === "ready" || order.status === "out_for_delivery")
    return { label: "Selesai", status: "completed", icon: CheckCircle2 };
  return null;
}

export default function PesananPage() {
  const router = useRouter();
  const { hydrated, orders, updateOrderStatus, payOrder } = useKasir();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Order | null>(null);
  const [payTarget, setPayTarget] = useState<Order | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = useToday();
  const todayOrders = orders.filter(
    (order) =>
      orderDateKey(order) === today &&
      order.status !== "cancelled" &&
      order.status !== "rejected",
  );
  const todayRevenue = todayOrders
    .filter((order) => order.paymentStatus === "paid")
    .reduce((sum, order) => sum + order.total, 0);
  const pendingCount = orders.filter(
    (order) => order.paymentStatus !== "paid" && isActive(order),
  ).length;
  const processingCount = orders.filter((order) =>
    ["accepted", "preparing", "ready", "out_for_delivery"].includes(
      order.status,
    ),
  ).length;

  // Pesanan selesai dipindahkan ke halaman Riwayat supaya antrean aktif
  // tidak penuh oleh transaksi lama.
  const activeOrders = useMemo(
    () => orders.filter((order) => order.status !== "completed"),
    [orders],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return activeOrders.filter((order) => {
      let matchFilter = true;
      if (filter === "unpaid")
        matchFilter = order.paymentStatus !== "paid" && isActive(order);
      else if (filter === "active") matchFilter = isActive(order);
      else if (filter === "cancelled")
        matchFilter = CLOSED_STATUSES.includes(order.status);

      const matchSearch =
        !query ||
        order.code.toLowerCase().includes(query) ||
        (order.customerName ?? "").toLowerCase().includes(query) ||
        (order.customerPhone ?? "").includes(query) ||
        (order.tableNumber ?? "").toLowerCase().includes(query);
      return matchFilter && matchSearch;
    });
  }, [activeOrders, filter, search]);

  async function handlePayment(method: PaymentMethod, paidAmount: number) {
    if (!payTarget || busy) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await payOrder(payTarget.id, method, paidAmount);
      setSelected(updated);
      setPayTarget(null);
    } catch (err) {
      setError(apiErrorFrom(err, "Pembayaran gagal diproses"));
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(order: Order, status: OrderStatus) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await updateOrderStatus(order.id, status);
      if (selected?.id === order.id) {
        setSelected({ ...selected, status });
      }
    } catch (err) {
      setError(apiErrorFrom(err, "Status pesanan gagal diubah"));
    } finally {
      setBusy(false);
    }
  }

  if (!hydrated || !today) return <PageLoader label="Memuat pesanan…" />;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Pesanan"
        description="Pantau pesanan masuk, proses pembayaran, dan selesaikan antrean."
        actions={
          <Button variant="outline" onClick={() => router.push("/riwayat")}>
            <History size={16} />
            Riwayat
          </Button>
        }
      />

      {error ? (
        <p className="rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <StatCard
          label="Pesanan Hari Ini"
          value={todayOrders.length}
          hint="Tidak termasuk yang dibatalkan"
          icon={<ReceiptText size={15} />}
        />
        <StatCard
          label="Omzet Hari Ini"
          value={formatRupiah(todayRevenue)}
          hint="Dari pesanan yang sudah lunas"
          icon={<Banknote size={15} />}
          tone="success"
        />
        <StatCard
          label="Belum Dibayar"
          value={pendingCount}
          hint="Perlu ditagih / dibayar"
          icon={<XCircle size={15} />}
          tone="warning"
        />
        <StatCard
          label="Sedang Diproses"
          value={processingCount}
          hint="Pesanan di antrean dapur"
          icon={<CheckCircle2 size={15} />}
          tone="info"
        />
      </div>

      <div className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "Semua" },
            { value: "unpaid", label: `Belum Bayar (${pendingCount})` },
            { value: "active", label: `Aktif (${processingCount})` },
            { value: "cancelled", label: "Batal" },
          ]}
        />
        <div className="relative w-full sm:max-w-xs">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari kode / nama / meja…"
            className="h-10 pl-9 text-xs"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<ReceiptText size={22} />}
          title="Tidak ada pesanan aktif"
          description="Pesanan baru dari pelanggan atau kasir akan muncul di sini. Pesanan yang sudah selesai bisa dilihat di halaman Riwayat."
        />
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {filtered.map((order) => {
            const action = nextAction(order);
            const ActionIcon = action?.icon;
            return (
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
                      <Badge tone={ORDER_STATUS_TONE[order.status]}>
                        {ORDER_STATUS_LABEL[order.status]}
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
                  {order.paymentStatus !== "paid" && isActive(order) ? (
                    <Button size="sm" onClick={() => setPayTarget(order)}>
                      <Banknote size={14} />
                      Bayar
                    </Button>
                  ) : null}
                  {action && ActionIcon ? (
                    <Button
                      variant="success"
                      size="sm"
                      disabled={busy}
                      onClick={() => void changeStatus(order, action.status)}
                    >
                      <ActionIcon size={14} />
                      {action.label}
                    </Button>
                  ) : null}
                  {isActive(order) ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger hover:bg-danger-soft"
                      onClick={() => setCancelTarget(order)}
                    >
                      <XCircle size={14} />
                      Batalkan
                    </Button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <PaymentModal
        key={payTarget?.id ?? "closed"}
        open={Boolean(payTarget)}
        total={payTarget?.total ?? 0}
        subtitle={payTarget ? `Pesanan ${payTarget.code}` : undefined}
        error={error}
        busy={busy}
        onClose={() => {
          if (!busy) setPayTarget(null);
        }}
        onConfirm={handlePayment}
      />

      <ReceiptModal
        order={selected}
        onClose={() => setSelected(null)}
        onPay={(order) => {
          setError(null);
          setPayTarget(order);
        }}
      />

      <Modal
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        title="Batalkan pesanan?"
        subtitle={cancelTarget?.code}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCancelTarget(null)}>
              Kembali
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={async () => {
                if (cancelTarget) {
                  await changeStatus(cancelTarget, "cancelled");
                }
                setCancelTarget(null);
              }}
            >
              Ya, batalkan
            </Button>
          </div>
        }
      >
        <p className="text-sm leading-relaxed text-ink-soft">
          Pesanan akan ditandai <strong>dibatalkan</strong> dan tidak dihitung
          dalam laporan penjualan. Tindakan ini tidak bisa dibatalkan.
        </p>
      </Modal>
    </div>
  );
}
