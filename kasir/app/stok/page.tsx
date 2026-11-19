"use client";

import {
  AlertTriangle,
  Boxes,
  History,
  Loader2,
  MapPin,
  Package,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { StockAdjustModal } from "@/components/stock-adjust-modal";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  PageHeader,
  PageLoader,
  Select,
  StatCard,
} from "@/components/ui";
import {
  api,
  apiErrorFrom,
  type ApiStockOpnameDocument,
  type ApiStockSnapshot,
  type ApiStockSnapshotItem,
} from "@/lib/api";
import { formatDateShort, formatDateTime, formatQuantity } from "@/lib/format";
import { useKasir } from "@/lib/store";

const OPNAME_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  posted: "Diposting",
  cancelled: "Dibatalkan",
};

export default function StokPage() {
  const { hydrated } = useKasir();
  const [snapshot, setSnapshot] = useState<ApiStockSnapshot | null>(null);
  const [history, setHistory] = useState<ApiStockOpnameDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [locationId, setLocationId] = useState("");
  const [adjustTarget, setAdjustTarget] =
    useState<ApiStockSnapshotItem | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [snapshotData, historyData] = await Promise.all([
          api<ApiStockSnapshot>("/admin/stock/snapshot"),
          api<ApiStockOpnameDocument[]>("/admin/stock-opnames", {
            query: { limit: 6 },
          }).catch(() => [] as ApiStockOpnameDocument[]),
        ]);
        if (cancelled) return;
        setSnapshot(snapshotData);
        setHistory(historyData);
      } catch (err) {
        if (!cancelled) {
          setError(apiErrorFrom(err, "Gagal memuat stok bahan"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [hydrated, refreshKey]);

  const locations = snapshot?.locations ?? [];
  const selectedLocation =
    locations.find((location) => location.id === locationId) ?? null;

  const stockFor = useCallback(
    (item: ApiStockSnapshotItem): number => {
      if (!locationId) return item.onHand;
      return (
        item.byLocation.find((row) => row.stockLocationId === locationId)
          ?.onHand ?? 0
      );
    },
    [locationId],
  );

  const lowStockCount = useMemo(
    () =>
      (snapshot?.items ?? []).filter(
        (item) => stockFor(item) <= item.reorderLevel,
      ).length,
    [snapshot, stockFor],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (snapshot?.items ?? []).filter((item) => {
      const qty = stockFor(item);
      const low = qty <= item.reorderLevel;
      const matchLow = !lowOnly || low;
      const matchSearch =
        !query ||
        item.name.toLowerCase().includes(query) ||
        item.sku.toLowerCase().includes(query);
      return matchLow && matchSearch;
    });
  }, [snapshot, search, lowOnly, stockFor]);

  function refresh() {
    setRefreshKey((value) => value + 1);
  }

  if (!hydrated || (loading && !snapshot)) {
    return <PageLoader label="Memuat stok bahan…" />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Stok Bahan"
        description="Lihat saldo sistem dan catat stok fisik asli setelah hitung ulang."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : undefined} />
            Muat ulang
          </Button>
        }
      />

      {error ? (
        <p className="rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">
          {error}
        </p>
      ) : null}

      {success ? (
        <div className="flex items-start gap-2 rounded-xl border border-success/20 bg-success-soft px-3 py-2 text-xs font-semibold text-success">
          <Package size={15} className="mt-0.5 shrink-0" />
          <p className="flex-1">{success}</p>
          <button
            type="button"
            onClick={() => setSuccess(null)}
            aria-label="Tutup notifikasi"
            className="focus-ring -mr-1 -mt-0.5 flex h-6 w-6 items-center justify-center rounded-md hover:bg-success/10"
          >
            <X size={13} />
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
        <StatCard
          label="Jumlah Bahan"
          value={snapshot?.summary.ingredientCount ?? 0}
          hint="Bahan aktif dan nonaktif"
          icon={<Boxes size={15} />}
        />
        <StatCard
          label="Stok Menipis"
          value={lowStockCount}
          hint="Stok ≤ batas reorder"
          icon={<AlertTriangle size={15} />}
          tone="warning"
        />
        <StatCard
          label="Lokasi Stok"
          value={snapshot?.summary.locationCount ?? 0}
          hint={selectedLocation?.name ?? "Semua lokasi"}
          icon={<MapPin size={15} />}
          tone="info"
        />
      </div>

      <div className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari nama atau SKU bahan…"
            className="h-10 pl-9 text-xs"
          />
        </div>
        <Select
          value={locationId}
          onChange={(event) => setLocationId(event.target.value)}
          aria-label="Pilih lokasi stok"
          className="h-10 text-xs sm:max-w-52"
        >
          <option value="">Semua lokasi</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </Select>
        <button
          type="button"
          onClick={() => setLowOnly((value) => !value)}
          className={`focus-ring flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition ${
            lowOnly
              ? "border-warning/40 bg-warning-soft text-warning"
              : "border-line bg-surface text-ink-soft hover:bg-primary-soft"
          }`}
        >
          <AlertTriangle size={14} />
          Stok menipis
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Package size={22} />}
          title="Tidak ada bahan"
          description={
            search || lowOnly
              ? "Coba ubah kata kunci atau matikan filter stok menipis."
              : "Belum ada bahan baku yang terdaftar di sistem."
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead className="bg-milk text-[10px] font-extrabold uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">Bahan</th>
                  <th className="px-4 py-3">Stok sistem</th>
                  <th className="px-4 py-3">Stok per lokasi</th>
                  <th className="px-4 py-3">Reorder</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.map((item) => {
                  const qty = stockFor(item);
                  const low = qty <= item.reorderLevel;
                  return (
                    <tr key={item.ingredientId} className="align-top">
                      <td className="px-4 py-3">
                        <p className="font-bold text-ink">{item.name}</p>
                        <p className="text-[11px] text-muted">
                          {item.sku} · {item.baseUnit}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-black text-ink tabular">
                          {formatQuantity(qty, item.baseUnit)}
                        </p>
                        <p className="text-[10px] text-muted">
                          {selectedLocation?.name ?? "Total semua lokasi"}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          {item.byLocation.map((balance) => (
                            <span
                              key={balance.stockLocationId}
                              className={`text-[11px] ${
                                balance.stockLocationId === locationId
                                  ? "font-bold text-primary"
                                  : "text-muted"
                              }`}
                            >
                              {balance.stockLocationName}:{" "}
                              {formatQuantity(balance.onHand, item.baseUnit)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted tabular">
                        {formatQuantity(item.reorderLevel, item.baseUnit)}
                      </td>
                      <td className="px-4 py-3">
                        {low ? (
                          <Badge tone="warning">Menipis</Badge>
                        ) : (
                          <Badge tone="success">Aman</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setAdjustTarget(item)}
                        >
                          <SlidersHorizontal size={14} />
                          Input stok asli
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <section className="rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-center gap-2">
          <History size={16} className="text-primary" />
          <h2 className="text-sm font-black text-ink">
            Riwayat penyesuaian stok
          </h2>
        </div>
        {history.length === 0 ? (
          <p className="mt-3 text-xs text-muted">
            Belum ada dokumen stok opname. Setelah kamu menyimpan stok asli,
            riwayatnya akan muncul di sini.
          </p>
        ) : (
          <div className="mt-3 divide-y divide-line">
            {history.map((document) => (
              <div
                key={document.id}
                className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-ink">
                    {document.number} · {document.stockLocationName ?? "Lokasi"}
                  </p>
                  <p className="text-[10px] text-muted">
                    {document.opnameDate
                      ? formatDateShort(document.opnameDate)
                      : formatDateTime(document.createdAt)}
                    {" · "}
                    {document.itemCount} bahan ·{" "}
                    {document.createdByName ?? "Kasir"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted">
                    Selisih {formatQuantity(document.totalDifference)}
                  </span>
                  <Badge
                    tone={
                      document.status === "posted"
                        ? "success"
                        : document.status === "cancelled"
                          ? "danger"
                          : "warning"
                    }
                  >
                    {OPNAME_STATUS_LABEL[document.status] ?? document.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {adjustTarget ? (
        <StockAdjustModal
          key={adjustTarget.ingredientId}
          target={adjustTarget}
          locations={locations}
          defaultLocationId={locationId}
          onClose={() => setAdjustTarget(null)}
          onSaved={(message) => {
            setSuccess(message);
            refresh();
          }}
        />
      ) : null}

      {loading && snapshot ? (
        <div className="pointer-events-none fixed bottom-20 right-4 z-50 flex items-center gap-2 rounded-full bg-surface px-3 py-2 text-[11px] font-semibold text-muted shadow-lg lg:bottom-6">
          <Loader2 size={13} className="animate-spin text-primary" />
          Memuat ulang…
        </div>
      ) : null}
    </div>
  );
}
