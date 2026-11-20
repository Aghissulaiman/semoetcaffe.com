"use client";

import ComponentCard from "@/components/common/ComponentCard";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { EmptyBlock, ErrorBlock, Skeleton } from "@/components/common/DataState";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import Pagination from "@/components/common/Pagination";
import IngredientFormModal from "@/components/inventori/IngredientFormModal";
import IngredientsTable from "@/components/inventori/IngredientsTable";
import { useApi } from "@/hooks/useApi";
import { apiDelete, buildQuery } from "@/lib/client";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "@/lib/ui";
import type { Ingredient } from "@/types/api";
import { useState } from "react";

const LIMIT = 20;

export default function BahanBakuPage() {
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState({ q: "", isActive: "", lowStockOnly: "" });
  const [applied, setApplied] = useState({ q: "", isActive: "", lowStockOnly: "" });

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Ingredient | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Ingredient | null>(null);

  const ingredients = useApi<Ingredient[]>(
    `/admin/ingredients${buildQuery({
      page,
      limit: LIMIT,
      q: applied.q,
      isActive: applied.isActive,
      lowStockOnly: applied.lowStockOnly,
    })}`,
  );

  const handleDeleteIngredient = async () => {
    if (!deleteTarget) return;
    await apiDelete(`/admin/ingredients/${deleteTarget.id}`);
    setDeleteTarget(null);
    ingredients.reload();
  };

  return (
    <div className="space-y-6">
      <PageBreadcrumb
        pageTitle="Bahan Baku"
        items={[{ label: "Inventori" }, { label: "Bahan Baku" }]}
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
          <span className="text-theme-xs font-medium text-coffee-muted">Cari bahan</span>
          <input
            value={draft.q}
            onChange={(event) => setDraft((prev) => ({ ...prev, q: event.target.value }))}
            placeholder="Nama atau SKU"
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
        <label className="flex min-w-[150px] flex-col gap-1">
          <span className="text-theme-xs font-medium text-coffee-muted">Stok</span>
          <select
            value={draft.lowStockOnly}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, lowStockOnly: event.target.value }))
            }
            className={inputClass}
          >
            <option value="">Semua</option>
            <option value="true">Hanya menipis</option>
          </select>
        </label>
        <button type="submit" className={primaryButtonClass}>
          Terapkan
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft({ q: "", isActive: "", lowStockOnly: "" });
            setApplied({ q: "", isActive: "", lowStockOnly: "" });
            setPage(1);
          }}
          className={secondaryButtonClass}
        >
          Reset
        </button>
      </form>

      <ComponentCard
        title="Bahan Baku"
        desc="Daftar bahan beserta stok & batas restock"
        action={
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className={primaryButtonClass}
          >
            + Tambah Bahan
          </button>
        }
      >
        {ingredients.loading && !ingredients.data ? (
          <Skeleton className="h-[420px] w-full" />
        ) : ingredients.error ? (
          <ErrorBlock message={ingredients.error} onRetry={ingredients.reload} />
        ) : (ingredients.data?.length ?? 0) === 0 ? (
          <EmptyBlock message="Belum ada bahan baku" />
        ) : (
          <div className="space-y-4">
            <IngredientsTable
              ingredients={ingredients.data!}
              onEdit={setEditTarget}
              onDelete={setDeleteTarget}
            />
            <Pagination
              page={ingredients.meta?.page ?? page}
              totalPages={ingredients.meta?.totalPages ?? 1}
              total={ingredients.meta?.total}
              unit="bahan"
              onPageChange={setPage}
            />
          </div>
        )}
      </ComponentCard>

      {createOpen && (
        <IngredientFormModal
          visible
          onClose={() => setCreateOpen(false)}
          ingredient={undefined}
          onSave={() => {
            setCreateOpen(false);
            ingredients.reload();
          }}
        />
      )}

      {editTarget && (
        <IngredientFormModal
          key={editTarget.id}
          visible
          onClose={() => setEditTarget(null)}
          ingredient={{
            id: editTarget.id,
            sku: editTarget.sku,
            name: editTarget.name,
            baseUnit: editTarget.baseUnit,
            reorderLevel: editTarget.reorderLevel,
            isActive: editTarget.isActive,
            supplierId: editTarget.supplierId,
            supplierContact: editTarget.supplierContact,
            purchaseLink: editTarget.purchaseLink,
            lastPurchasePriceIdr: editTarget.lastPurchasePriceIdr,
            lastPurchaseQty: editTarget.lastPurchaseQty,
            lastPurchaseUom: editTarget.lastPurchaseUom,
            lastYieldAmount: editTarget.lastYieldAmount,
            lastUnitCostIdr: editTarget.lastUnitCostIdr,
          }}
          onSave={() => {
            setEditTarget(null);
            ingredients.reload();
          }}
        />
      )}

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Hapus Bahan Baku"
        message={`Hapus bahan "${deleteTarget?.name}"? Tindakan ini tidak bisa dibatalkan.`}
        confirmLabel="Hapus"
        onConfirm={handleDeleteIngredient}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
