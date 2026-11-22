"use client";

import ComponentCard from "@/components/common/ComponentCard";
import { EmptyBlock, ErrorBlock, Skeleton } from "@/components/common/DataState";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import StockSummaryTable from "@/components/inventori/StockSummaryTable";
import { useApi } from "@/hooks/useApi";
import { buildQuery } from "@/lib/client";
import { monthBounds, monthOfValue, todayValue } from "@/lib/date-range";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "@/lib/ui";
import type { StockLocation, StockSummary } from "@/types/api";
import { useMemo, useState } from "react";

export default function StockRekapPage() {
  const locations = useApi<StockLocation[]>("/admin/stock-locations?limit=100");

  const now = new Date();
  const currentMonth = monthOfValue(todayValue(), {
    year: now.getFullYear(),
    month: now.getMonth(),
  });
  const monthBoundsValue = monthBounds(currentMonth);
  const [locationId, setLocationId] = useState("");
  const [from, setFrom] = useState(monthBoundsValue.start);
  const [to, setTo] = useState(monthBoundsValue.end);
  const [search, setSearch] = useState("");

  const summary = useApi<StockSummary>(
    `/admin/stock/summary${buildQuery({ stockLocationId: locationId || undefined, from, to })}`,
  );

  const filteredSummary = useMemo(() => {
    if (!summary.data) return null;
    const q = search.trim().toLowerCase();
    if (!q) return summary.data;
    return {
      ...summary.data,
      items: summary.data.items.filter(
        (it) => it.name.toLowerCase().includes(q) || (it.sku ?? "").toLowerCase().includes(q),
      ),
    };
  }, [summary.data, search]);

  return (
    <div className="space-y-6">
      <PageBreadcrumb pageTitle="Rekap Pergerakan Stok" items={[{ label: "Inventori" }, { label: "Rekap Pergerakan Stok" }]} />

      <ComponentCard title="Rekap Pergerakan Stok" desc="Masuk, keluar, penjualan, terbuang & stok akhir per bahan">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            summary.reload();
          }}
          className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-coffee-linen bg-white p-4 dark:border-coffee-night-border dark:bg-coffee-night-soft"
        >
          <label className="flex min-w-[220px] flex-1 flex-col gap-1">
            <span className="text-theme-xs font-medium text-coffee-muted">Lokasi Stok</span>
            <select value={locationId} onChange={(event) => setLocationId(event.target.value)} className={inputClass}>
              <option value="">Semua Lokasi</option>
              {(locations.data ?? []).map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[200px] flex-col gap-1">
            <span className="text-theme-xs font-medium text-coffee-muted">Dari</span>
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className={inputClass} />
          </label>
          <label className="flex min-w-[200px] flex-col gap-1">
            <span className="text-theme-xs font-medium text-coffee-muted">Ke</span>
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className={inputClass} />
          </label>
          <label className="flex min-w-[200px] flex-1 flex-col gap-1">
            <span className="text-theme-xs font-medium text-coffee-muted">Cari bahan</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nama atau SKU" className={inputClass} />
          </label>
          <button type="submit" className={primaryButtonClass}>
            Terapkan
          </button>
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={() => {
              setFrom(monthBoundsValue.start);
              setTo(monthBoundsValue.end);
              setSearch("");
            }}
          >
            Bulan Ini
          </button>
        </form>

        {summary.loading && !summary.data ? (
          <Skeleton className="h-[420px] w-full" />
        ) : summary.error ? (
          <ErrorBlock message={summary.error} onRetry={summary.reload} />
        ) : !filteredSummary ? (
          <EmptyBlock message="Belum ada data pergerakan stok" />
        ) : (
          <StockSummaryTable summary={filteredSummary} />
        )}
      </ComponentCard>
    </div>
  );
}
