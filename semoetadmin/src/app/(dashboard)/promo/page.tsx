"use client";

import ComponentCard from "@/components/common/ComponentCard";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { EmptyBlock, ErrorBlock, Skeleton } from "@/components/common/DataState";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import Pagination from "@/components/common/Pagination";
import PromoCard from "@/components/promo/PromoCard";
import PromoFormModal from "@/components/promo/PromoFormModal";
import { useApi } from "@/hooks/useApi";
import { apiDelete, buildQuery } from "@/lib/client";
import { formatNumber } from "@/lib/format";
import { discountTypeLabel } from "@/lib/labels";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "@/lib/ui";
import { PlusIcon } from "@/icons";
import type { Promo } from "@/types/api";
import { useState } from "react";

const LIMIT = 12;
const DISCOUNT_TYPES = ["percentage", "fixed", "free_item"];

export default function PromoPage() {
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState({
    q: "",
    isActive: "",
    discountType: "",
    mode: "",
  });
  const [applied, setApplied] = useState({
    q: "",
    isActive: "",
    discountType: "",
    mode: "",
  });
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Promo | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Promo | null>(null);

  const promos = useApi<Promo[]>(
    `/admin/promos${buildQuery({
      page,
      limit: LIMIT,
      q: applied.q,
      isActive: applied.isActive,
      discountType: applied.discountType,
      mode: applied.mode,
    })}`,
  );

  const meta = promos.meta;

  const openCreate = () => {
    setEditTarget(null);
    setFormOpen(true);
  };

  const openEdit = (promo: Promo) => {
    setEditTarget(promo);
    setFormOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await apiDelete(`/admin/promos/${deleteTarget.id}`);
    setDeleteTarget(null);
    promos.reload();
  };

  return (
    <div className="space-y-6">
      <PageBreadcrumb pageTitle="Promo" items={[{ label: "Menu" }, { label: "Promo" }]} />

      <form
        onSubmit={(event) => {
          event.preventDefault();
          setApplied(draft);
          setPage(1);
        }}
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-coffee-linen bg-white p-4 dark:border-coffee-night-border dark:bg-coffee-night-soft"
      >
        <label className="flex min-w-[200px] flex-1 flex-col gap-1">
          <span className="text-theme-xs font-medium text-coffee-muted">Cari promo</span>
          <input
            value={draft.q}
            onChange={(event) => setDraft((prev) => ({ ...prev, q: event.target.value }))}
            placeholder="Nama atau kode promo"
            className={inputClass}
          />
        </label>
        <label className="flex min-w-[170px] flex-col gap-1">
          <span className="text-theme-xs font-medium text-coffee-muted">Jenis Promo</span>
          <select
            value={draft.mode}
            onChange={(event) => setDraft((prev) => ({ ...prev, mode: event.target.value }))}
            className={inputClass}
          >
            <option value="">Semua</option>
            <option value="voucher">Kode Voucher</option>
            <option value="direct">Diskon Menu</option>
          </select>
        </label>
        <label className="flex min-w-[160px] flex-col gap-1">
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
        <label className="flex min-w-[170px] flex-col gap-1">
          <span className="text-theme-xs font-medium text-coffee-muted">Jenis Diskon</span>
          <select
            value={draft.discountType}
            onChange={(event) => setDraft((prev) => ({ ...prev, discountType: event.target.value }))}
            className={inputClass}
          >
            <option value="">Semua</option>
            {DISCOUNT_TYPES.map((type) => (
              <option key={type} value={type}>
                {discountTypeLabel(type)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={primaryButtonClass}>
          Terapkan
        </button>
        <button
          type="button"
          onClick={() => {
            const reset = { q: "", isActive: "", discountType: "", mode: "" };
            setDraft(reset);
            setApplied(reset);
            setPage(1);
          }}
          className={secondaryButtonClass}
        >
          Reset
        </button>
      </form>

      <ComponentCard
        title="Daftar Promo"
        desc={`${formatNumber(meta?.total ?? promos.data?.length ?? 0)} promo`}
        action={
          <button type="button" onClick={openCreate} className={primaryButtonClass}>
            <PlusIcon className="h-4 w-4" /> Tambah Promo
          </button>
        }
      >
        {promos.loading && !promos.data ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-[280px] w-full" />
            ))}
          </div>
        ) : promos.error ? (
          <ErrorBlock message={promos.error} onRetry={promos.reload} />
        ) : (promos.data?.length ?? 0) === 0 ? (
          <EmptyBlock message="Tidak ada promo yang cocok" />
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {promos.data!.map((promo) => (
                <PromoCard
                  key={promo.id}
                  promo={promo}
                  onEdit={openEdit}
                  onDelete={setDeleteTarget}
                />
              ))}
            </div>
            <Pagination
              page={meta?.page ?? page}
              totalPages={meta?.totalPages ?? 1}
              total={meta?.total}
              unit="promo"
              onPageChange={setPage}
            />
          </div>
        )}
      </ComponentCard>

      <PromoFormModal
        isOpen={formOpen}
        promo={editTarget}
        onClose={() => {
          setFormOpen(false);
          setEditTarget(null);
        }}
        onSaved={promos.reload}
      />

      {deleteTarget && (
        <ConfirmDialog
          isOpen
          key={deleteTarget.id}
          title="Hapus Promo"
          message={`Hapus promo "${deleteTarget.name}"? Promo yang sudah pernah dipakai tidak dapat dihapus; nonaktifkan saja.`}
          confirmLabel="Hapus"
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
