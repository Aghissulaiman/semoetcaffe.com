"use client";

import ComponentCard from "@/components/common/ComponentCard";
import { EmptyBlock, ErrorBlock, Skeleton } from "@/components/common/DataState";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import StockSnapshotView from "@/components/inventori/StockSnapshotView";
import StockTransferModal from "@/components/inventori/StockTransferModal";
import { useApi } from "@/hooks/useApi";
import { buildQuery } from "@/lib/client";
import { inputClass, secondaryButtonClass } from "@/lib/ui";
import type { StockLocation, StockSnapshot } from "@/types/api";
import { useState } from "react";

export default function StockSnapshotPage() {
  const [snapshotLocationId, setSnapshotLocationId] = useState("");
  const [transferOpen, setTransferOpen] = useState(false);

  const locations = useApi<StockLocation[]>("/admin/stock-locations?limit=100");
  const effectiveSnapshotLocation =
    snapshotLocationId || locations.data?.[0]?.id || "";

  const snapshot = useApi<StockSnapshot>(
    effectiveSnapshotLocation
      ? `/admin/stock/snapshot${buildQuery({
          stockLocationId: effectiveSnapshotLocation,
        })}`
      : null,
  );

  return (
    <div className="space-y-6">
      <PageBreadcrumb
        pageTitle="Snapshot Stok"
        items={[{ label: "Inventori" }, { label: "Snapshot Stok" }]}
      />

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-coffee-linen bg-white p-4 dark:border-coffee-night-border dark:bg-coffee-night-soft">
        <label className="flex min-w-[220px] flex-col gap-1">
          <span className="text-theme-xs font-medium text-coffee-muted">Lokasi Stok</span>
          <select
            value={effectiveSnapshotLocation}
            onChange={(event) => setSnapshotLocationId(event.target.value)}
            className={inputClass}
          >
            {(locations.data ?? []).map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ComponentCard
        title="Snapshot Stok"
        desc="Posisi stok terkini per lokasi"
        action={
          <button
            type="button"
            onClick={() => setTransferOpen(true)}
            className={secondaryButtonClass}
          >
            Transfer Stok (Gudang → Outlet)
          </button>
        }
      >
        {!effectiveSnapshotLocation ? (
          <EmptyBlock message="Belum ada lokasi stok. Tambahkan lokasi terlebih dahulu." />
        ) : snapshot.loading && !snapshot.data ? (
          <Skeleton className="h-[420px] w-full" />
        ) : snapshot.error ? (
          <ErrorBlock message={snapshot.error} onRetry={snapshot.reload} />
        ) : !snapshot.data ? (
          <EmptyBlock message="Belum ada data stok" />
        ) : (
          <StockSnapshotView snapshot={snapshot.data} />
        )}
      </ComponentCard>

      {transferOpen && (
        <StockTransferModal
          onClose={() => setTransferOpen(false)}
          onSaved={() => {
            snapshot.reload();
          }}
        />
      )}
    </div>
  );
}
