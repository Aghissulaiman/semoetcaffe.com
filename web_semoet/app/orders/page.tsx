"use client";

/**
 * Pesanan saya — GET /me/orders dengan filter status.
 */
import { ReceiptText, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { OrderCard } from "@/components/order-card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Loader } from "@/components/ui/loader";
import { apiErrorFrom } from "@/services/client";
import { listMyOrders, type OrderStatusFilter } from "@/services/order.service";
import { useAuthStore } from "@/store/auth-store";

import type { OrderSummary } from "@/types/api";

const FILTERS: { value: OrderStatusFilter | null; label: string }[] = [
  { value: null, label: "Semua" },
  { value: "placed", label: "Diterima" },
  { value: "preparing", label: "Disiapkan" },
  { value: "ready", label: "Siap" },
  { value: "completed", label: "Selesai" },
  { value: "cancelled", label: "Dibatalkan" },
];

export default function OrdersPage() {
  const router = useRouter();
  const status = useAuthStore((state) => state.status);
  const isAuthenticated = status === "authenticated";

  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [filter, setFilter] = useState<OrderStatusFilter | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pageRef = useRef(1);
  const [hasMore, setHasMore] = useState(false);

  const fetchPage = useCallback(
    async (page: number, replace: boolean) => {
      if (!isAuthenticated) {
        setOrders([]);
        setLoading(false);
        return;
      }
      try {
        setError(null);
        const result = await listMyOrders({ page, orderStatus: filter ?? undefined, sort: "recent" });
        setHasMore(Boolean(result.meta?.hasNext));
        setOrders((prev) => (replace ? result.items : [...prev, ...result.items]));
      } catch (err) {
        setError(apiErrorFrom(err, "Gagal memuat pesanan"));
      }
    },
    [filter, isAuthenticated],
  );

  useEffect(() => {
    pageRef.current = 1;
    setLoading(true);
    fetchPage(1, true).finally(() => setLoading(false));
  }, [fetchPage]);

  const loadMore = () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    pageRef.current += 1;
    fetchPage(pageRef.current, false).finally(() => setLoadingMore(false));
  };

  if (status === "loading") return <Loader label="Memuat pesanan…" />;

  if (!isAuthenticated) {
    return (
      <EmptyState
        icon={ReceiptText}
        title="Masuk untuk melihat pesanan"
        description="Riwayat, status, dan detail pesananmu tersimpan di akun Semoet Cafe."
        actionLabel="Masuk / Daftar"
        onAction={() => router.push("/auth/login")}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-ink">Pesanan Saya</h1>
          <p className="text-xs text-muted">Riwayat & status pesananmu</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setRefreshing(true);
            pageRef.current = 1;
            fetchPage(1, true).finally(() => setRefreshing(false));
          }}
          aria-label="Muat ulang"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-primary transition hover:bg-cream focus-ring">
          <RefreshCw size={17} className={refreshing ? "animate-spin" : undefined} />
        </button>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <Chip
            key={item.label}
            label={item.label}
            size="sm"
            active={item.value === filter}
            onClick={() => setFilter(item.value)}
          />
        ))}
      </div>

      {loading ? (
        <Loader label="Memuat pesanan…" />
      ) : orders.length === 0 ? (
        error ? (
          <ErrorState message={error} onRetry={() => { pageRef.current = 1; void fetchPage(1, true); }} />
        ) : (
          <EmptyState
            icon={ReceiptText}
            title={filter ? "Belum ada pesanan dengan status ini" : "Belum ada pesanan"}
            description="Mulai pesan minuman favoritmu dari tab Menu."
            actionLabel="Buka Menu"
            onAction={() => router.push("/menu")}
          />
        )
      ) : (
        <div className="flex flex-col gap-3">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
          {loadingMore ? <Loader label="Memuat lagi…" fullscreen={false} /> : null}
          {hasMore ? (
            <button
              type="button"
              onClick={loadMore}
              className="mx-auto rounded-full bg-primary-soft px-4 py-2 text-[13px] font-bold text-primary transition hover:bg-cream">
              Muat lebih banyak
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
