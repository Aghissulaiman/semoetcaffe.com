"use client";

import ComponentCard from "@/components/common/ComponentCard";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import DateRangePicker from "@/components/common/DateRangePicker";
import { EmptyBlock, ErrorBlock, Skeleton } from "@/components/common/DataState";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import Pagination from "@/components/common/Pagination";
import StockOpnameCancelModal from "@/components/inventori/StockOpnameCancelModal";
import StockOpnameDetailModal from "@/components/inventori/StockOpnameDetailModal";
import StockOpnameFormModal from "@/components/inventori/StockOpnameFormModal";
import StockOpnameTable from "@/components/inventori/StockOpnameTable";
import { useApi } from "@/hooks/useApi";
import { apiDelete, apiGet, apiPost, buildQuery } from "@/lib/client";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "@/lib/ui";
import type { StockLocation, StockOpnameDetail, StockOpnameDocument } from "@/types/api";
import { useState } from "react";

const LIMIT = 20;

export default function StockOpnamePage() {
  const locations = useApi<StockLocation[]>("/admin/stock-locations?limit=100");
  const defaultLocationId = locations.data?.[0]?.id ?? "";

  const [page, setPage] = useState(1);
  const [locationId, setLocationId] = useState("");
  const [applied, setApplied] = useState({ status: "", from: "", to: "" });

  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<StockOpnameDetail | null>(null);
  const [cancelTarget, setCancelTarget] = useState<StockOpnameDocument | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StockOpnameDocument | null>(null);

  const effectiveLocationId = locationId || defaultLocationId;
  const documents = useApi<StockOpnameDocument[]>(
    `/admin/stock-opnames${buildQuery({
      page,
      limit: LIMIT,
      status: applied.status,
      stockLocationId: effectiveLocationId,
      from: applied.from,
      to: applied.to,
    })}`,
  );

  const openDetail = async (row: StockOpnameDocument) => {
    const envelope = await apiGet<StockOpnameDetail>(`/admin/stock-opnames/${row.id}`);
    if (envelope.success) {
      setDetail(envelope.data);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await apiDelete(`/admin/stock-opnames/${deleteTarget.id}`);
    setDeleteTarget(null);
    documents.reload();
  };

  const handlePost = async (row: StockOpnameDocument) => {
    await apiPost(`/admin/stock-opnames/${row.id}/post`);
    documents.reload();
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    await apiPost(`/admin/stock-opnames/${cancelTarget.id}/cancel`, { reason: "Pemeriksaan ulang" });
    setCancelTarget(null);
    documents.reload();
  };

  return (
    <div className="space-y-6">
      <PageBreadcrumb pageTitle="Stok Opname" items={[{ label: "Inventori" }, { label: "Stok Opname" }]} />

      <ComponentCard
        title="Daftar Stok Opname"
        desc="Dokumen penyesuaian fisik stok per lokasi"
        action={
          <button type="button" onClick={() => setCreateOpen(true)} className={primaryButtonClass}>
            + Stok Opname
          </button>
        }
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
          }}
          className="mb-6 grid grid-cols-1 gap-3 rounded-2xl border border-coffee-linen bg-white p-4 dark:border-coffee-night-border dark:bg-coffee-night-soft sm:grid-cols-4"
        >
          <label className="flex flex-col gap-1">
            <span className="text-theme-xs font-medium text-coffee-muted">Lokasi Stok</span>
            <select value={effectiveLocationId} onChange={(event) => setLocationId(event.target.value)} className={inputClass}>
              {(locations.data ?? []).map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-theme-xs font-medium text-coffee-muted">Status</span>
            <select value={applied.status} onChange={(event) => setApplied((prev) => ({ ...prev, status: event.target.value }))} className={inputClass}>
              <option value="">Semua</option>
              <option value="draft">Draft</option>
              <option value="posted">Posted</option>
              <option value="cancelled">Dibatalkan</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-theme-xs font-medium text-coffee-muted">Dari Tanggal</span>
            <DateRangePicker from={applied.from} to={applied.to} onChange={(from, to) => { setApplied((prev) => ({ ...prev, from, to })); setPage(1); }} allowAll={false} />
          </label>
          <div className="flex items-end gap-2">
            <button type="submit" className={primaryButtonClass}>
              Terapkan
            </button>
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() => {
                setApplied({ status: "", from: "", to: "" });
                setPage(1);
              }}
            >
              Reset
            </button>
          </div>
        </form>

        {documents.loading && !documents.data ? (
          <Skeleton className="h-[420px] w-full" />
        ) : documents.error ? (
          <ErrorBlock message={documents.error} onRetry={documents.reload} />
        ) : (documents.data?.length ?? 0) === 0 ? (
          <EmptyBlock message="Belum ada dokumen stok opname" />
        ) : (
          <StockOpnameTable
            documents={documents.data ?? []}
            onSelect={openDetail}
            onPost={handlePost}
            onCancel={setCancelTarget}
            onDelete={setDeleteTarget}
          />
        )}

        {documents.data && documents.data.length > 0 && (
          <div className="mt-6">
            <Pagination
              page={documents.meta?.page ?? page}
              totalPages={documents.meta?.totalPages ?? 1}
              total={documents.meta?.total ?? 0}
              unit="dokumen"
              onPageChange={setPage}
            />
          </div>
        )}
      </ComponentCard>

      {createOpen && (
        <StockOpnameFormModal onClose={() => setCreateOpen(false)} onSaved={() => documents.reload()} />
      )}

      {detail && (
        <StockOpnameDetailModal
          document={detail.document}
          items={detail.items}
          onClose={() => setDetail(null)}
          onPost={handlePost}
          onCancel={handleCancel}
        />
      )}

      {cancelTarget && (
        <StockOpnameCancelModal
          documentId={cancelTarget.id}
          number={cancelTarget.number}
          onClose={() => setCancelTarget(null)}
          onCancelled={() => {
            documents.reload();
          }}
        />
      )}

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Hapus Stok Opname"
        message={`Hapus dokumen stok opname ${deleteTarget?.number}? Dokumen draft saja yang bisa dihapus.`}
        confirmLabel="Hapus"
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
