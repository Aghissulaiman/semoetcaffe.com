"use client";

import ComponentCard from "@/components/common/ComponentCard";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { EmptyBlock, ErrorBlock, Skeleton } from "@/components/common/DataState";
import ExportCsvButton from "@/components/common/ExportCsvButton";
import Pagination from "@/components/common/Pagination";
import ToneBadge from "@/components/common/ToneBadge";
import { useApi } from "@/hooks/useApi";
import { ApiError, apiDelete, apiPost, buildQuery } from "@/lib/client";
import type { CsvColumn } from "@/lib/csv";
import { formatDate, formatNumber } from "@/lib/format";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "@/lib/ui";
import { tdClass, thClass, trClass } from "@/lib/ui";
import type { DeletedProduct } from "@/types/api";
import { useState } from "react";

const LIMIT = 10;

const TRASH_COLUMNS: CsvColumn<DeletedProduct>[] = [
  { header: "Nama Produk", value: (row) => row.name },
  { header: "Kategori", value: (row) => row.categoryName ?? "" },
  { header: "Jenis", value: (row) => row.productKind },
  { header: "Jumlah Varian", value: (row) => row.variantCount },
  { header: "Dihapus", value: (row) => formatDate(row.deletedAt) },
  { header: "Oleh", value: (row) => row.deletedByName ?? "Sistem" },
  { header: "Sisa Hari", value: (row) => row.daysLeft },
];

interface DeletedProductsPanelProps {
  onClose: () => void;
  onChanged: () => void;
}

/**
 * Riwayat produk terhapus. Produk bisa dipulihkan maksimal 30 hari; setelah itu
 * backend menghapusnya permanen secara otomatis saat panel ini dibuka.
 */
export default function DeletedProductsPanel({ onClose, onChanged }: DeletedProductsPanelProps) {
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState("");
  const [applied, setApplied] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<DeletedProduct | null>(null);

  const trash = useApi<DeletedProduct[]>(
    `/admin/products/trash${buildQuery({ page, limit: LIMIT, q: applied })}`,
  );

  const handleRestore = async (item: DeletedProduct) => {
    setBusyId(item.id);
    setError(null);
    try {
      await apiPost(`/admin/products/${item.id}/restore`);
      trash.reload();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memulihkan produk");
    } finally {
      setBusyId(null);
    }
  };

  const handlePurge = async () => {
    if (!purgeTarget) return;
    setBusyId(purgeTarget.id);
    setError(null);
    try {
      await apiDelete(`/admin/products/${purgeTarget.id}/permanent`);
      setPurgeTarget(null);
      trash.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menghapus permanen");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ComponentCard
      title="Riwayat Produk Dihapus"
      desc="Produk disimpan 30 hari dan bisa dipulihkan. Setelah itu terhapus permanen otomatis."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <ExportCsvButton
            filename="produk-terhapus.csv"
            rows={trash.data ?? []}
            columns={TRASH_COLUMNS}
            title="Riwayat Produk Dihapus"
          />
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            Tutup
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setApplied(draft);
            setPage(1);
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Cari nama produk..."
            className={`${inputClass} max-w-sm`}
          />
          <button type="submit" className={primaryButtonClass}>
            Cari
          </button>
          {applied && (
            <button
              type="button"
              onClick={() => {
                setDraft("");
                setApplied("");
                setPage(1);
              }}
              className={secondaryButtonClass}
            >
              Reset
            </button>
          )}
        </form>

        {error && (
          <p className="rounded-lg border border-coffee-danger/30 bg-coffee-danger/5 px-3 py-2 text-theme-sm text-coffee-danger">
            {error}
          </p>
        )}

        {trash.loading && !trash.data ? (
          <Skeleton className="h-64 w-full" />
        ) : trash.error ? (
          <ErrorBlock message={trash.error} onRetry={trash.reload} />
        ) : (trash.data?.length ?? 0) === 0 ? (
          <EmptyBlock message="Tidak ada produk di riwayat hapus" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-coffee-linen dark:border-coffee-night-border">
                    <th className={`${thClass} text-start`}>Produk</th>
                    <th className={`${thClass} text-start`}>Kategori</th>
                    <th className={`${thClass} text-start`}>Dihapus</th>
                    <th className={`${thClass} text-start`}>Oleh</th>
                    <th className={`${thClass} text-start`}>Batas Pulih</th>
                    <th className={`${thClass} text-end`}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {(trash.data ?? []).map((item) => (
                    <tr key={item.id} className={trClass}>
                      <td className={tdClass}>
                        <span className="block font-medium text-coffee-espresso dark:text-coffee-cream">
                          {item.name}
                        </span>
                        <span className="block text-theme-xs text-coffee-muted">
                          {formatNumber(item.variantCount)} varian · {item.slug}
                        </span>
                      </td>
                      <td className={tdClass}>{item.categoryName ?? "-"}</td>
                      <td className={`${tdClass} whitespace-nowrap text-theme-xs`}>
                        {formatDate(item.deletedAt)}
                      </td>
                      <td className={`${tdClass} text-theme-xs`}>
                        {item.deletedByName ?? "Sistem"}
                      </td>
                      <td className={tdClass}>
                        <ToneBadge tone={item.daysLeft <= 3 ? "danger" : "warning"}>
                          {item.daysLeft} hari lagi
                        </ToneBadge>
                      </td>
                      <td className={`${tdClass} text-end`}>
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            disabled={busyId === item.id}
                            onClick={() => handleRestore(item)}
                            className="rounded-lg border border-coffee-success/40 px-3 py-1.5 text-theme-xs font-semibold text-coffee-success transition-colors hover:bg-coffee-success/10 disabled:opacity-50"
                          >
                            Pulihkan
                          </button>
                          <button
                            type="button"
                            disabled={busyId === item.id}
                            onClick={() => setPurgeTarget(item)}
                            className="rounded-lg border border-coffee-danger/40 px-3 py-1.5 text-theme-xs font-semibold text-coffee-danger transition-colors hover:bg-coffee-danger/10 disabled:opacity-50"
                          >
                            Hapus Permanen
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={trash.meta?.page ?? page}
              totalPages={trash.meta?.totalPages ?? 1}
              total={trash.meta?.total}
              unit="produk"
              onPageChange={setPage}
            />
          </>
        )}
      </div>

      <ConfirmDialog
        isOpen={Boolean(purgeTarget)}
        title="Hapus Permanen"
        message={`Hapus permanen "${purgeTarget?.name}"? Tindakan ini tidak bisa dibatalkan.`}
        confirmLabel="Hapus Permanen"
        onConfirm={handlePurge}
        onClose={() => setPurgeTarget(null)}
      />
    </ComponentCard>
  );
}
