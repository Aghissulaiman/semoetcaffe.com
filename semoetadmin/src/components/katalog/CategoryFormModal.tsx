"use client";

import AppModal from "@/components/common/AppModal";
import { ApiError, apiPatch, apiPost } from "@/lib/client";
import {
  fieldLabelClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/lib/ui";
import type { ProductCategory } from "@/types/api";
import { useState } from "react";

interface CategoryFormModalProps {
  /** Kosong/undefined berarti mode tambah. */
  category?: ProductCategory | null;
  /** Seluruh kategori untuk pilihan induk. */
  categories: ProductCategory[];
  /** Induk yang langsung terpilih saat menambah dari halaman lain. */
  defaultParentId?: string;
  onClose: () => void;
  onSaved: (category: ProductCategory) => void;
}

export default function CategoryFormModal({
  category,
  categories,
  defaultParentId,
  onClose,
  onSaved,
}: CategoryFormModalProps) {
  const isEdit = Boolean(category);

  const [name, setName] = useState(category?.name ?? "");
  const [slug, setSlug] = useState(category?.slug ?? "");
  const [parentId, setParentId] = useState(
    category ? (category.parentId ?? "") : (defaultParentId ?? ""),
  );
  const [sortOrder, setSortOrder] = useState(String(category?.sortOrder ?? 0));
  const [isActive, setIsActive] = useState(category?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Kategori ini dan turunannya tidak boleh menjadi induk dirinya sendiri. */
  const parentOptions = categories.filter((item) => {
    if (!category) return true;
    if (item.id === category.id) return false;
    return true;
  });

  const handleSave = async () => {
    if (name.trim().length < 2) {
      setError("Nama kategori minimal 2 karakter.");
      return;
    }

    const body: Record<string, unknown> = {
      name: name.trim(),
      parentId: parentId || null,
      sortOrder: Math.max(0, Math.round(Number(sortOrder) || 0)),
      isActive,
    };
    if (slug.trim()) body.slug = slug.trim();

    setSaving(true);
    setError(null);
    try {
      const result = category
        ? await apiPatch<ProductCategory>(`/admin/categories/${category.id}`, body)
        : await apiPost<ProductCategory>("/admin/categories", body);
      onSaved(result.data);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan kategori");
      setSaving(false);
    }
  };

  return (
    <AppModal
      isOpen
      onClose={onClose}
      title={isEdit ? "Ubah Kategori" : "Tambah Kategori"}
      desc="Kategori dipakai untuk mengelompokkan menu di katalog."
      size="md"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass} disabled={saving}>
            Batal
          </button>
          <button type="button" onClick={handleSave} className={primaryButtonClass} disabled={saving}>
            {saving ? "Menyimpan…" : "Simpan"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-xl border border-coffee-danger/30 bg-coffee-danger/5 px-4 py-3 text-theme-sm text-coffee-danger">
            {error}
          </div>
        )}

        <label className="flex flex-col gap-1.5">
          <span className={fieldLabelClass}>Nama Kategori *</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="mis. Kopi, Makanan, Dessert"
            className={inputClass}
            autoFocus
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={fieldLabelClass}>Slug</span>
          <input
            value={slug}
            onChange={(event) => setSlug(event.target.value.toLowerCase())}
            placeholder="Otomatis dari nama bila dikosongkan"
            className={`${inputClass} font-mono`}
          />
          <span className="text-theme-xs text-coffee-muted">
            Huruf kecil, angka, dan tanda minus. Contoh: kopi-susu.
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={fieldLabelClass}>Kategori Induk</span>
          <select
            value={parentId}
            onChange={(event) => setParentId(event.target.value)}
            className={inputClass}
          >
            <option value="">Tanpa induk (kategori utama)</option>
            {parentOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {"— ".repeat(item.depth ?? 0)}
                {item.name}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className={fieldLabelClass}>Urutan Tampil</span>
            <input
              type="number"
              min={0}
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex items-center gap-2 self-end pb-2 text-theme-sm text-coffee-dark dark:text-coffee-cream/80">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
              className="h-4 w-4 accent-coffee-brown"
            />
            Aktif
          </label>
        </div>
      </div>
    </AppModal>
  );
}
