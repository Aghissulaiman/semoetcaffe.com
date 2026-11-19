"use client";

import ComponentCard from "@/components/common/ComponentCard";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { EmptyBlock, ErrorBlock, Skeleton } from "@/components/common/DataState";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ToneBadge from "@/components/common/ToneBadge";
import CategoryFormModal from "@/components/katalog/CategoryFormModal";
import { useApi } from "@/hooks/useApi";
import { apiDelete } from "@/lib/client";
import { formatNumber } from "@/lib/format";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "@/lib/ui";
import { PencilIcon, PlusIcon, TrashBinIcon } from "@/icons";
import type { ProductCategory } from "@/types/api";
import { useMemo, useState } from "react";

export default function KategoriPage() {
  const categories = useApi<ProductCategory[]>("/categories");
  const [draft, setDraft] = useState({ q: "", isActive: "" });
  const [applied, setApplied] = useState({ q: "", isActive: "" });
  const [form, setForm] = useState<{ open: boolean; category: ProductCategory | null }>({
    open: false,
    category: null,
  });
  const [deleteTarget, setDeleteTarget] = useState<ProductCategory | null>(null);

  const allCategories = useMemo(() => categories.data ?? [], [categories.data]);
  const nameById = useMemo(
    () => new Map(allCategories.map((category) => [category.id, category.name])),
    [allCategories],
  );

  const filtered = useMemo(() => {
    const keyword = applied.q.trim().toLowerCase();
    return allCategories.filter((category) => {
      if (applied.isActive === "true" && !category.isActive) return false;
      if (applied.isActive === "false" && category.isActive) return false;
      if (!keyword) return true;
      return (
        category.name.toLowerCase().includes(keyword) ||
        category.slug.toLowerCase().includes(keyword)
      );
    });
  }, [allCategories, applied]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await apiDelete(`/admin/categories/${deleteTarget.id}`);
    setDeleteTarget(null);
    categories.reload();
  };

  return (
    <div className="space-y-6">
      <PageBreadcrumb pageTitle="Kategori" items={[{ label: "Menu" }, { label: "Kategori" }]} />

      <form
        onSubmit={(event) => {
          event.preventDefault();
          setApplied(draft);
        }}
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-coffee-linen bg-white p-4 dark:border-coffee-night-border dark:bg-coffee-night-soft"
      >
        <label className="flex min-w-[220px] flex-1 flex-col gap-1">
          <span className="text-theme-xs font-medium text-coffee-muted">Cari kategori</span>
          <input
            value={draft.q}
            onChange={(event) => setDraft((prev) => ({ ...prev, q: event.target.value }))}
            placeholder="Nama atau slug kategori"
            className={inputClass}
          />
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
        <button type="submit" className={primaryButtonClass}>
          Terapkan
        </button>
        <button
          type="button"
          onClick={() => {
            const reset = { q: "", isActive: "" };
            setDraft(reset);
            setApplied(reset);
          }}
          className={secondaryButtonClass}
        >
          Reset
        </button>
      </form>

      <ComponentCard
        title="Kategori Menu"
        desc={`${formatNumber(filtered.length)} dari ${formatNumber(allCategories.length)} kategori`}
        action={
          <button
            type="button"
            onClick={() => setForm({ open: true, category: null })}
            className={primaryButtonClass}
          >
            <PlusIcon className="h-4 w-4" /> Tambah Kategori
          </button>
        }
      >
        {categories.loading && !categories.data ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : categories.error ? (
          <ErrorBlock message={categories.error} onRetry={categories.reload} />
        ) : filtered.length === 0 ? (
          <EmptyBlock message="Belum ada kategori yang cocok" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left">
              <thead>
                <tr className="border-b border-coffee-linen text-theme-xs uppercase tracking-wide text-coffee-muted dark:border-coffee-night-border">
                  <th className="px-3 py-2 font-semibold">Kategori</th>
                  <th className="px-3 py-2 font-semibold">Slug</th>
                  <th className="px-3 py-2 font-semibold">Induk</th>
                  <th className="px-3 py-2 text-center font-semibold">Produk</th>
                  <th className="px-3 py-2 text-center font-semibold">Urutan</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 text-end font-semibold">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((category) => (
                  <tr
                    key={category.id}
                    className="border-b border-coffee-linen/70 text-theme-sm last:border-0 dark:border-coffee-night-border/70"
                  >
                    <td className="px-3 py-3">
                      <div
                        className="flex items-center gap-2"
                        style={{ paddingInlineStart: (category.depth ?? 0) * 14 }}
                      >
                        {(category.depth ?? 0) > 0 && (
                          <span className="text-coffee-muted">└</span>
                        )}
                        <span className="font-medium text-coffee-espresso dark:text-coffee-cream">
                          {category.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 font-mono text-theme-xs text-coffee-muted">
                      {category.slug}
                    </td>
                    <td className="px-3 py-3 text-coffee-muted">
                      {category.parentId ? (nameById.get(category.parentId) ?? "-") : "—"}
                    </td>
                    <td className="px-3 py-3 text-center text-coffee-muted">
                      {formatNumber(category.productCount)}
                    </td>
                    <td className="px-3 py-3 text-center text-coffee-muted">
                      {formatNumber(category.sortOrder)}
                    </td>
                    <td className="px-3 py-3">
                      {category.isActive ? (
                        <ToneBadge tone="success">Aktif</ToneBadge>
                      ) : (
                        <ToneBadge tone="muted">Nonaktif</ToneBadge>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setForm({ open: true, category })}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-coffee-linen px-2.5 py-1.5 text-theme-xs font-medium text-coffee-dark transition-colors hover:bg-coffee-milk dark:border-coffee-night-border dark:text-coffee-cream dark:hover:bg-white/5"
                        >
                          <PencilIcon className="h-3.5 w-3.5" /> Ubah
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(category)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-coffee-danger/40 px-2.5 py-1.5 text-theme-xs font-medium text-coffee-danger transition-colors hover:bg-coffee-danger/10"
                        >
                          <TrashBinIcon className="h-3.5 w-3.5" /> Hapus
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ComponentCard>

      {form.open && (
        <CategoryFormModal
          key={form.category?.id ?? "new"}
          category={form.category}
          categories={allCategories}
          onClose={() => setForm({ open: false, category: null })}
          onSaved={() => {
            setForm({ open: false, category: null });
            categories.reload();
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          isOpen
          key={deleteTarget.id}
          title="Hapus Kategori"
          message={`Hapus kategori "${deleteTarget.name}"? Kategori yang masih dipakai produk atau punya subkategori tidak dapat dihapus.`}
          confirmLabel="Hapus"
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
