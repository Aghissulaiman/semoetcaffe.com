"use client";

import ComponentCard from "@/components/common/ComponentCard";
import DataTable, { type Column } from "@/components/common/DataTable";
import { EmptyBlock, ErrorBlock, Skeleton } from "@/components/common/DataState";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { apiPost } from "@/lib/client";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "@/lib/ui";
import { useApi } from "@/hooks/useApi";
import type { StockLocation } from "@/types/api";
import { useState } from "react";

export default function StockLocationPage() {
  const locations = useApi<StockLocation[]>("/admin/stock-locations?limit=100");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (name.trim().length < 2) {
      setError("Nama lokasi harus minimal 2 karakter.");
      return;
    }

    setSaving(true);
    try {
      await apiPost("/admin/stock-locations", { name: name.trim() });
      setName("");
      locations.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan lokasi stok");
    } finally {
      setSaving(false);
    }
  };

  const columns: Column<StockLocation>[] = [
    {
      key: "name",
      header: "Nama Lokasi",
      render: (row) => (
        <span className="font-medium text-coffee-dark dark:text-coffee-cream">{row.name}</span>
      ),
    },
    {
      key: "movementCount",
      header: "Jumlah Mutasi",
      align: "right",
      render: (row) => <span>{row.movementCount}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <PageBreadcrumb
        pageTitle="Lokasi Stok"
        items={[
          { label: "Inventori" },
          { label: "Lokasi Stok" },
        ]}
      />

      <ComponentCard
        title="Tambah Lokasi Stok"
        desc="Buat lokasi penyimpanan baru, mis. gudang atau outlet."
      >
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 rounded-2xl border border-coffee-linen bg-white p-4 dark:border-coffee-night-border dark:bg-coffee-night-soft">
          <label className="flex flex-col gap-1">
            <span className="text-theme-xs font-medium text-coffee-muted">Nama Lokasi</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="mis. Gudang Utama"
              className={inputClass}
              required
            />
          </label>
          {error && (
            <p className="rounded-lg border border-coffee-danger/30 bg-coffee-danger/5 px-3 py-2 text-theme-sm text-coffee-danger sm:col-span-2">
              {error}
            </p>
          )}
          <div className="flex items-end gap-2 sm:col-span-2">
            <button type="submit" disabled={saving} className={primaryButtonClass}>
              {saving ? "Menyimpan..." : "Simpan Lokasi"}
            </button>
            <button
              type="button"
              onClick={() => {
                setName("");
                setError(null);
              }}
              className={secondaryButtonClass}
            >
              Reset
            </button>
          </div>
        </form>
      </ComponentCard>

      <ComponentCard title="Daftar Lokasi Stok" desc="Lokasi penyimpanan stok">
        {locations.loading && !locations.data ? (
          <Skeleton className="h-[300px] w-full" />
        ) : locations.error ? (
          <ErrorBlock message={locations.error} onRetry={locations.reload} />
        ) : (locations.data?.length ?? 0) === 0 ? (
          <EmptyBlock message="Belum ada lokasi stok" />
        ) : (
          <DataTable
            columns={columns}
            data={locations.data ?? []}
            keyExtractor={(row) => row.id}
            emptyMessage="Belum ada lokasi stok"
          />
        )}
      </ComponentCard>
    </div>
  );
}
