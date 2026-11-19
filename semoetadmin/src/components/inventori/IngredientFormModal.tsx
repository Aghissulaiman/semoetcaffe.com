"use client";

import AppModal from "@/components/common/AppModal";
import { ApiError, apiPatch, apiPost } from "@/lib/client";
import { fieldLabelClass, inputClass, primaryButtonClass, secondaryButtonClass } from "@/lib/ui";
import { useState } from "react";

type IngredientFormValues = {
  sku: string;
  name: string;
  baseUnit: string;
  reorderLevel: number;
  isActive: boolean;
};

type IngredientFormProps = {
  visible: boolean;
  onClose: () => void;
  ingredient?: {
    id: string;
    sku: string;
    name: string;
    baseUnit: string;
    reorderLevel: number;
    isActive: boolean;
  };
  onSave: (data: IngredientFormValues) => void;
};

/** Modal tambah/ubah bahan baku. */
export default function IngredientFormModal({
  visible,
  onClose,
  ingredient,
  onSave,
}: IngredientFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<IngredientFormValues>({
    sku: ingredient?.sku ?? "",
    name: ingredient?.name ?? "",
    baseUnit: ingredient?.baseUnit ?? "",
    reorderLevel: ingredient?.reorderLevel ?? 0,
    isActive: ingredient?.isActive ?? true,
  });

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!ingredient?.id && !form.sku.trim()) {
      return setError("SKU wajib diisi.");
    }
    if (form.name.trim().length < 2) {
      return setError("Nama bahan minimal 2 karakter.");
    }
    if (!form.baseUnit.trim()) {
      return setError("Satuan wajib diisi.");
    }

    setLoading(true);
    try {
      const payload = {
        ...form,
        sku: form.sku.trim().toUpperCase(),
        name: form.name.trim(),
        baseUnit: form.baseUnit.trim(),
      };
      if (ingredient?.id) {
        await apiPatch(`/admin/ingredients/${ingredient.id}`, payload);
      } else {
        await apiPost("/admin/ingredients", payload);
      }
      onSave(payload);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan bahan baku");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppModal
      isOpen={visible}
      onClose={onClose}
      title={ingredient ? "Ubah Bahan Baku" : "Tambah Bahan Baku"}
      desc="Lengkapi data bahan baku yang dipakai resep dan stok."
      size="md"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass} disabled={loading}>
            Batal
          </button>
          <button
            type="submit"
            form="ingredient-form"
            className={primaryButtonClass}
            disabled={loading}
          >
            {loading ? "Menyimpan…" : "Simpan"}
          </button>
        </>
      }
    >
      <form id="ingredient-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className={fieldLabelClass}>SKU *</span>
            <input
              value={form.sku}
              onChange={(event) => setForm({ ...form, sku: event.target.value })}
              placeholder="mis. COF-BEAN"
              className={inputClass}
              disabled={Boolean(ingredient?.id)}
              required={!ingredient?.id}
            />
            {ingredient?.id && (
              <span className="text-theme-xs text-coffee-muted">SKU tidak bisa diubah.</span>
            )}
          </label>
          <label className="flex flex-col gap-1">
            <span className={fieldLabelClass}>Satuan *</span>
            <input
              value={form.baseUnit}
              onChange={(event) => setForm({ ...form, baseUnit: event.target.value })}
              placeholder="mis. kg, liter, pcs"
              className={inputClass}
              required
            />
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className={fieldLabelClass}>Nama Bahan *</span>
          <input
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="mis. Biji Kopi Arabica"
            className={inputClass}
            required
          />
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className={fieldLabelClass}>Batas Restock</span>
            <input
              type="number"
              value={form.reorderLevel}
              onChange={(event) =>
                setForm({ ...form, reorderLevel: Number(event.target.value) })
              }
              min={0}
              step="any"
              className={`${inputClass} text-end`}
              placeholder="mis. 5"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={fieldLabelClass}>Status</span>
            <select
              value={form.isActive ? "true" : "false"}
              onChange={(event) => setForm({ ...form, isActive: event.target.value === "true" })}
              className={inputClass}
            >
              <option value="true">Aktif</option>
              <option value="false">Nonaktif</option>
            </select>
          </label>
        </div>

        {error && (
          <p className="rounded-lg border border-coffee-danger/30 bg-coffee-danger/5 px-3 py-2 text-theme-sm text-coffee-danger">
            {error}
          </p>
        )}
      </form>
    </AppModal>
  );
}
