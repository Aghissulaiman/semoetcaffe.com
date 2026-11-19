"use client";

import ComponentCard from "@/components/common/ComponentCard";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { EmptyBlock, ErrorBlock, Skeleton } from "@/components/common/DataState";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import Pagination from "@/components/common/Pagination";
import SupplierFormModal from "@/components/pembelian/SupplierFormModal";
import SuppliersTable from "@/components/pembelian/SuppliersTable";
import { useApi } from "@/hooks/useApi";
import { apiDelete, buildQuery } from "@/lib/client";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "@/lib/ui";
import type { Supplier } from "@/types/api";
import { useState } from "react";

const LIMIT = 20;

export default function SupplierPage() {
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState({ q: "", isActive: "" });
  const [applied, setApplied] = useState({ q: "", isActive: "" });
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Supplier | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);

  const suppliers = useApi<Supplier[]>(
    `/admin/suppliers${buildQuery({
      page,
      limit: LIMIT,
      q: applied.q,
      isActive: applied.isActive,
    })}`,
  );

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await apiDelete(`/admin/suppliers/${deleteTarget.id}`);
    setDeleteTarget(null);
    suppliers.reload();
  };

  return (
    <div className="space-y-6">
      <PageBreadcrumb
        pageTitle="Supplier"
        items={[{ label: "Pembelian" }, { label: "Supplier" }]}
      />

      <form
        onSubmit={(event) => {
          event.preventDefault();
          setApplied(draft);
          setPage(1);
        }}
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-coffee-linen bg-white p-4 dark:border-coffee-night-border dark:bg-coffee-night-soft"
      >
        <label className="flex min-w-[220px] flex-1 flex-col gap-1">
          <span className="text-theme-xs font-medium text-coffee-muted">Cari supplier</span>
          <input
            value={draft.q}
            onChange={(event) => setDraft((prev) => ({ ...prev, q: event.target.value }))}
            placeholder="Nama, kode, atau kontak"
            className={inputClass}
          />
        </label>
        <label className="flex min-w-[150px] flex-col gap-1">
          <span className="text-theme-xs font-medium text-coffee-muted">Status</span>
          <select
            value={draft.isActive}
            onChange={(event) => setDraft((prev) => ({ ...prev, isActive: event.target.value }))}
            className={inputClass}
          >
            <option value="">Semua</option>
            <option value="true">Aktif</option>
            <option value="false">Nonaktif</option>
          </select>
        </label>
        <button type="submit" className={primaryButtonClass}>
          Terapkan
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft({ q: "", isActive: "" });
            setApplied({ q: "", isActive: "" });
            setPage(1);
          }}
          className={secondaryButtonClass}
        >
          Reset
        </button>
      </form>

      <ComponentCard
        title="Master Supplier"
        desc="Data supplier dipakai pada purchase order dan pembayaran hutang"
        action={
          <button type="button" onClick={() => setCreateOpen(true)} className={primaryButtonClass}>
            + Tambah Supplier
          </button>
        }
      >
        {suppliers.loading && !suppliers.data ? (
          <Skeleton className="h-[420px] w-full" />
        ) : suppliers.error ? (
          <ErrorBlock message={suppliers.error} onRetry={suppliers.reload} />
        ) : (suppliers.data?.length ?? 0) === 0 ? (
          <EmptyBlock message="Belum ada supplier" />
        ) : (
          <div className="space-y-4">
            <SuppliersTable
              suppliers={suppliers.data!}
              onEdit={setEditTarget}
              onDelete={setDeleteTarget}
            />
            <Pagination
              page={suppliers.meta?.page ?? page}
              totalPages={suppliers.meta?.totalPages ?? 1}
              total={suppliers.meta?.total}
              unit="supplier"
              onPageChange={setPage}
            />
          </div>
        )}
      </ComponentCard>

      {createOpen && (
        <SupplierFormModal
          onClose={() => setCreateOpen(false)}
          onSaved={() => {
            setCreateOpen(false);
            suppliers.reload();
          }}
        />
      )}

      {editTarget && (
        <SupplierFormModal
          key={editTarget.id}
          supplier={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            suppliers.reload();
          }}
        />
      )}

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Hapus Supplier"
        message={`Hapus supplier "${deleteTarget?.name}"? Supplier yang sudah dipakai purchase order tidak bisa dihapus.`}
        confirmLabel="Hapus"
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
