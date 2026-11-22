"use client";

import ComponentCard from "@/components/common/ComponentCard";
import DateRangePicker from "@/components/common/DateRangePicker";
import { EmptyBlock, ErrorBlock, Skeleton } from "@/components/common/DataState";
import ExportCsvButton from "@/components/common/ExportCsvButton";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import Pagination from "@/components/common/Pagination";
import StockMovementFormModal from "@/components/inventori/StockMovementFormModal";
import StockMovementsTable from "@/components/inventori/StockMovementsTable";
import { useApi } from "@/hooks/useApi";
import { buildQuery } from "@/lib/client";
import { formatDate } from "@/lib/format";
import { movementTypeLabel } from "@/lib/labels";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "@/lib/ui";
import type { CsvColumn } from "@/lib/csv";
import type { StockLocation, StockMovement } from "@/types/api";
import { useMemo, useState } from "react";

const LIMIT = 20;
const MOVEMENT_TYPES = [
  "purchase",
  "order_consumption",
  "waste",
  "adjustment",
  "transfer_in",
  "transfer_out",
];

const MOVEMENT_EXPORT_COLUMNS: CsvColumn<StockMovement>[] = [
  { header: "Tanggal", value: (row) => formatDate(row.movementDate ?? row.createdAt) },
  { header: "Bahan", value: (row) => row.ingredientName ?? "" },
  { header: "SKU", value: (row) => row.ingredientSku ?? "" },
  { header: "Lokasi", value: (row) => row.stockLocationName ?? "" },
  { header: "Jenis", value: (row) => movementTypeLabel(row.movementType) },
  { header: "Perubahan", value: (row) => row.quantityDelta },
  { header: "Satuan", value: (row) => row.baseUnit ?? "" },
  { header: "Saldo", value: (row) => row.balanceAfter },
  { header: "Oleh", value: (row) => row.createdByName ?? "Sistem" },
  { header: "Catatan", value: (row) => row.notes ?? "" },
  { header: "Dicatat", value: (row) => formatDate(row.createdAt) },
];

export default function StockMovementsPage() {
  const [movementPage, setMovementPage] = useState(1);
  const [movementFilter, setMovementFilter] = useState({
    movementType: "",
    stockLocationId: "",
    from: "",
    to: "",
  });
  const [movementApplied, setMovementApplied] = useState({
    movementType: "",
    stockLocationId: "",
    from: "",
    to: "",
  });
  const [movementOpen, setMovementOpen] = useState(false);
  const [search, setSearch] = useState("");

  const locations = useApi<StockLocation[]>("/admin/stock-locations?limit=100");

  const movements = useApi<StockMovement[]>(
    `/admin/stock/movements${buildQuery({
      page: movementPage,
      limit: LIMIT,
      movementType: movementApplied.movementType,
      stockLocationId: movementApplied.stockLocationId,
      from: movementApplied.from,
      to: movementApplied.to,
    })}`,
  );

  const filteredMovements = useMemo(() => {
    const list = movements.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (m) =>
        (m.ingredientName ?? "").toLowerCase().includes(q) ||
        (m.ingredientSku ?? "").toLowerCase().includes(q) ||
        (m.stockLocationName ?? "").toLowerCase().includes(q),
    );
  }, [movements.data, search]);

  return (
    <div className="space-y-6">
      <PageBreadcrumb
        pageTitle="Pergerakan Stok"
        items={[{ label: "Inventori" }, { label: "Pergerakan Stok" }]}
      />

      <form
        onSubmit={(event) => {
          event.preventDefault();
          setMovementApplied(movementFilter);
          setMovementPage(1);
        }}
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-coffee-linen bg-white p-4 dark:border-coffee-night-border dark:bg-coffee-night-soft"
      >
        <label className="flex min-w-[200px] flex-col gap-1">
          <span className="text-theme-xs font-medium text-coffee-muted">Jenis Mutasi</span>
          <select
            value={movementFilter.movementType}
            onChange={(event) =>
              setMovementFilter((prev) => ({ ...prev, movementType: event.target.value }))
            }
            className={inputClass}
          >
            <option value="">Semua</option>
            {MOVEMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {movementTypeLabel(type)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[200px] flex-col gap-1">
          <span className="text-theme-xs font-medium text-coffee-muted">Lokasi Stok</span>
          <select
            value={movementFilter.stockLocationId}
            onChange={(event) =>
              setMovementFilter((prev) => ({ ...prev, stockLocationId: event.target.value }))
            }
            className={inputClass}
          >
            <option value="">Semua Lokasi</option>
            {(locations.data ?? []).map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-theme-xs font-medium text-coffee-muted">Tanggal</span>
          <DateRangePicker
            from={movementFilter.from}
            to={movementFilter.to}
            onChange={(from, to) => setMovementFilter((prev) => ({ ...prev, from, to }))}
            allowAll
          />
        </div>
        <label className="flex min-w-[200px] flex-1 flex-col gap-1">
          <span className="text-theme-xs font-medium text-coffee-muted">Cari</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Bahan, SKU, atau lokasi"
            className={inputClass}
          />
        </label>
        <button type="submit" className={primaryButtonClass}>
          Terapkan
        </button>
        <button
          type="button"
          onClick={() => {
            setMovementFilter({ movementType: "", stockLocationId: "", from: "", to: "" });
            setMovementApplied({ movementType: "", stockLocationId: "", from: "", to: "" });
            setSearch("");
            setMovementPage(1);
          }}
          className={secondaryButtonClass}
        >
          Reset
        </button>
      </form>

      <ComponentCard
        title="Pergerakan Stok"
        desc="Riwayat masuk/keluar bahan beserta tanggal transaksi"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ExportCsvButton
              filename="pergerakan-stok.csv"
              rows={filteredMovements}
              columns={MOVEMENT_EXPORT_COLUMNS}
              title="Pergerakan Stok"
            />
            <button
              type="button"
              onClick={() => setMovementOpen(true)}
              className={primaryButtonClass}
            >
              + Tambah Pergerakan
            </button>
          </div>
        }
      >
        {movements.loading && !movements.data ? (
          <Skeleton className="h-[420px] w-full" />
        ) : movements.error ? (
          <ErrorBlock message={movements.error} onRetry={movements.reload} />
        ) : filteredMovements.length === 0 ? (
          <EmptyBlock message="Belum ada pergerakan stok" />
        ) : (
          <div className="space-y-4">
            <StockMovementsTable movements={filteredMovements} />
            <Pagination
              page={movements.meta?.page ?? movementPage}
              totalPages={movements.meta?.totalPages ?? 1}
              total={movements.meta?.total}
              unit="mutasi"
              onPageChange={setMovementPage}
            />
          </div>
        )}
      </ComponentCard>

      {movementOpen && (
        <StockMovementFormModal
          defaultLocationId={locations.data?.[0]?.id}
          onClose={() => setMovementOpen(false)}
          onSaved={() => {
            movements.reload();
          }}
        />
      )}
    </div>
  );
}
