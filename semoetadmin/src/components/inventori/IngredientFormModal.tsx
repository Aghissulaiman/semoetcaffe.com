"use client";

import AppModal from "@/components/common/AppModal";
import { ApiError, apiPatch, apiPost } from "@/lib/client";
import { useApi } from "@/hooks/useApi";
import { fieldLabelClass, inputClass, primaryButtonClass, secondaryButtonClass } from "@/lib/ui";
import type { Supplier } from "@/types/api";
import { useEffect, useMemo, useState } from "react";

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

function formatRupiahInput(value: number): string {
  if (!Number.isFinite(value)) return "";
  return new Intl.NumberFormat("id-ID").format(Math.round(value));
}

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

  // Extended fields (UI only for now, not sent to backend unless API supports)
  const [supplierId, setSupplierId] = useState<string>("");
  const [supplierContact, setSupplierContact] = useState<string>("");
  const [supplierLink, setSupplierLink] = useState<string>("");
  const [purchasePrice, setPurchasePrice] = useState<string>("");
  const [purchaseQty, setPurchaseQty] = useState<string>("");
  const [purchaseUom, setPurchaseUom] = useState<string>("");
  const [yieldAmount, setYieldAmount] = useState<string>("");
  const [unitCost, setUnitCost] = useState<string>("");
  const [unitCostEdited, setUnitCostEdited] = useState(false);

  const suppliers = useApi<Supplier[]>("/admin/suppliers?limit=100");

  const supplierOptions = useMemo(() => suppliers.data ?? [], [suppliers.data]);

  useEffect(() => {
    if (!visible) return;
    // reset extended fields when opening
    setSupplierId("");
    setSupplierContact("");
    setSupplierLink("");
    setPurchasePrice("");
    setPurchaseQty("");
    setPurchaseUom(ingredient?.baseUnit ?? "");
    setYieldAmount("");
    setUnitCost("");
    setUnitCostEdited(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    // keep purchaseUom in sync with baseUnit if empty
    if (!purchaseUom && form.baseUnit) setPurchaseUom(form.baseUnit);
  }, [form.baseUnit, purchaseUom]);

  useEffect(() => {
    if (unitCostEdited) return;
    const price = Number(purchasePrice);
    const qty = Number(purchaseQty);
    const yld = Number(yieldAmount);
    let calc = NaN;
    if (Number.isFinite(price) && price >= 0) {
      if (Number.isFinite(yld) && yld > 0) {
        calc = price / yld;
      } else if (Number.isFinite(qty) && qty > 0) {
        calc = price / qty;
      }
    }
    if (Number.isFinite(calc)) {
      setUnitCost(String(Math.round(calc)));
    } else {
      setUnitCost("");
    }
  }, [purchasePrice, purchaseQty, yieldAmount, unitCostEdited]);

  const handleSupplierChange = (id: string) => {
    setSupplierId(id);
    const s = supplierOptions.find((x) => x.id === id);
    if (s) {
      const contact = [s.contactName, s.phone].filter(Boolean).join(" / ");
      setSupplierContact(contact);
    } else {
      setSupplierContact("");
    }
  };

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
      // NOTE: extended fields (supplier, purchase, yield, unitCost) are collected in UI
      // but not persisted by current backend API. Hook them up when API supports it.
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
      desc="Lengkapi data bahan baku. Unit Cost otomatis dari Harga Beli / Yield (jika ada), jika Yield kosong pakai Harga Beli / Qty Beli; tetap bisa diubah manual."
      size="lg"
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
            <span className={fieldLabelClass}>Satuan (Base) *</span>
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
          <span className={fieldLabelClass}>Nama Bahan (Item Ingredients) *</span>
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
            <span className={fieldLabelClass}>Supplier Utama</span>
            <select
              value={supplierId}
              onChange={(e) => handleSupplierChange(e.target.value)}
              className={inputClass}
              disabled={suppliers.loading}
            >
              <option value="">
                {suppliers.loading ? "Memuat supplier…" : "— Pilih supplier —"}
              </option>
              {supplierOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.code ? ` (${s.code})` : ""}
                </option>
              ))}
            </select>
            {suppliers.error && (
              <span className="text-theme-xs text-coffee-danger">Gagal memuat supplier: {suppliers.error}</span>
            )}
          </label>
          <label className="flex flex-col gap-1">
            <span className={fieldLabelClass}>Kontak Supplier</span>
            <input
              value={supplierContact}
              onChange={(e) => setSupplierContact(e.target.value)}
              placeholder="Otomatis dari supplier, bisa diedit"
              className={inputClass}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className={fieldLabelClass}>Link (opsional)</span>
          <input
            value={supplierLink}
            onChange={(e) => setSupplierLink(e.target.value)}
            placeholder="https://..."
            className={inputClass}
          />
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className={fieldLabelClass}>Purchase Price (Rp)</span>
            <input
              type="number"
              value={purchasePrice}
              onChange={(e) => { setUnitCostEdited(false); setPurchasePrice(e.target.value); }}
              min={0}
              className={`${inputClass} text-end`}
              placeholder="mis. 130000"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={fieldLabelClass}>Purchase Qty</span>
            <input
              type="number"
              value={purchaseQty}
              onChange={(e) => { setUnitCostEdited(false); setPurchaseQty(e.target.value); }}
              min={0}
              step="any"
              className={`${inputClass} text-end`}
              placeholder="mis. 1000"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={fieldLabelClass}>UoM (satuan beli)</span>
            <input
              value={purchaseUom}
              onChange={(e) => setPurchaseUom(e.target.value)}
              placeholder="mengikuti satuan beli (mis. g, ml)"
              className={inputClass}
            />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className={fieldLabelClass}>Yield (satuan mengikuti UoM)</span>
            <input
              type="number"
              value={yieldAmount}
              onChange={(e) => { setUnitCostEdited(false); setYieldAmount(e.target.value); }}
              min={0}
              step="any"
              className={`${inputClass} text-end`}
              placeholder="Isi jika ada susut; kosong = pakai Qty Beli"
            />
           
          </label>
          <label className="flex flex-col gap-1">
            <span className={fieldLabelClass}>Unit Cost (Rp) — otomatis, bisa diubah</span>
            <input
              type="number"
              value={unitCost}
              onChange={(e) => { setUnitCostEdited(true); setUnitCost(e.target.value); }}
              min={0}
              className={`${inputClass} text-end`}
              placeholder="Auto: Harga Beli ÷ Yield (atau ÷ Qty jika Yield kosong)"
            />
          
          </label>
        </div>

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
