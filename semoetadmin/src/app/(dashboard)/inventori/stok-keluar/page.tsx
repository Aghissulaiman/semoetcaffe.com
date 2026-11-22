"use client";

import ComponentCard from "@/components/common/ComponentCard";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import DateRangePicker from "@/components/common/DateRangePicker";
import { EmptyBlock, ErrorBlock, Skeleton } from "@/components/common/DataState";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import Pagination from "@/components/common/Pagination";
import StockOutCancelModal from "@/components/inventori/StockOutCancelModal";
import StockOutDetailModal from "@/components/inventori/StockOutDetailModal";
import StockOutFormModal from "@/components/inventori/StockOutFormModal";
import StockOutTable from "@/components/inventori/StockOutTable";
import { useApi } from "@/hooks/useApi";
import { apiDelete, apiGet, apiPost, buildQuery } from "@/lib/client";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "@/lib/ui";
import type { StockLocation, StockOutDetail, StockOutDocument } from "@/types/api";
import { useState } from "react";

const LIMIT = 20;

export default function StockOutPage() {
  const locations = useApi<StockLocation[]>("/admin/stock-locations?limit=100");
  const defaultLocationId = locations.data?.[0]?.id ?? "";

  const [page, setPage] = useState(1);
  const [locationId, setLocationId] = useState("");
  const [applied, setApplied] = useState({ status: "", from: "", to: "", q: "" });
  const [searchDraft, setSearchDraft] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<StockOutDetail | null>(null);
  const [cancelTarget, setCancelTarget] = useState<StockOutDocument | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StockOutDocument | null>(null);

  const effectiveLocationId = locationId || defaultLocationId;
  const documents = useApi<StockOutDocument[]>(
    `/admin/stock-outs${buildQuery({
      page,
      limit: LIMIT,
      status: applied.status,
      fromStockLocationId: effectiveLocationId,
      from: applied.from,
      to: applied.to,
      q: applied.q || undefined,
    })}`,
  );

  const openDetail = async (row: StockOutDocument) => {
    const envelope = await apiGet<StockOutDetail>(`/admin/stock-outs/${row.id}`);
    if (envelope.success) {
      setDetail(envelope.data);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await apiDelete(`/admin/stock-outs/${deleteTarget.id}`);
    setDeleteTarget(null);
    documents.reload();
  };

  const handlePost = async (row: StockOutDocument) => {
    await apiPost(`/admin/stock-outs/${row.id}/post`);
    documents.reload();
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    await apiPost(`/admin/stock-outs/${cancelTarget.id}/cancel`, { reason: "Salah data transfer" });
    setCancelTarget(null);
    documents.reload();
  };

  return (
    <div className="space-y-6">
      <PageBreadcrumb pageTitle="Stok Keluar" items={[{ label: "Inventori" }, { label: "Stok Keluar" }]} />

      <ComponentCard
        title="Daftar Stok Keluar"
        desc="Dokumen pengeluaran barang dari gudang utama ke outlet"
        action={
          <button type="button" onClick={() => setCreateOpen(true)} className={primaryButtonClass}>
            + Stok Keluar
          </button>
        }
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setApplied((prev) => ({ ...prev, q: searchDraft }));
            setPage(1);
          }}
          className="mb-6 grid grid-cols-1 gap-3 rounded-2xl border border-coffee-linen bg-white p-4 sm:grid-cols-5 dark:border-coffee-night-border dark:bg-coffee-night-soft"
        >
          <label className="flex flex-col gap-1">
            <span className="text-theme-xs font-medium text-coffee-muted">Lokasi Stok</span>
            <select
              value={effectiveLocationId}
              onChange={(event) => setLocationId(event.target.value)}
              className={inputClass}
            >
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
          <label className="flex flex-col gap-1">
            <span className="text-theme-xs font-medium text-coffee-muted">Cari</span>
            <input
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="No dok / catatan"
              className={inputClass}
            />
          </label>
          <div className="flex items-end gap-2">
            <button type="submit" className={primaryButtonClass}>
              Terapkan
            </button>
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() => {
                setApplied({ status: "", from: "", to: "", q: "" });
                setSearchDraft("");
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
          <EmptyBlock message="Belum ada dokumen stok keluar" />
        ) : (
          <StockOutTable
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
        <StockOutFormModal onClose={() => setCreateOpen(false)} onSaved={() => documents.reload()} />
      )}

      {detail && (
        <StockOutDetailModal
          document={detail.document}
          items={detail.items}
          onClose={() => setDetail(null)}
          onPost={handlePost}
          onCancel={handleCancel}
        />
      )}

      {cancelTarget && (
        <StockOutCancelModal
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
        title="Hapus Stok Keluar"
        message={`Hapus dokumen stok keluar ${deleteTarget?.number}? Dokumen draft saja yang bisa dihapus.`}
        confirmLabel="Hapus"
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
