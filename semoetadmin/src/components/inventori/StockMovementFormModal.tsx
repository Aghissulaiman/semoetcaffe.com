"use client";

import AppModal from "@/components/common/AppModal";
import IngredientPicker from "@/components/common/IngredientPicker";
import { useApi } from "@/hooks/useApi";
import { ApiError, apiPost } from "@/lib/client";
import { toDateInputValue } from "@/lib/format";
import { movementTypeLabel } from "@/lib/labels";
import {
  fieldLabelClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
  textareaClass,
} from "@/lib/ui";
import type { Ingredient, StockLocation } from "@/types/api";
import { useState } from "react";

const MOVEMENT_TYPES = ["purchase", "order_consumption", "waste", "adjustment"];

interface StockMovementFormModalProps {
  onClose: () => void;
  onSaved: () => void;
  defaultLocationId?: string;
}

/** Form pencatatan pergerakan stok manual (dengan tanggal transaksi). */
export default function StockMovementFormModal({
  onClose,
  onSaved,
  defaultLocationId,
}: StockMovementFormModalProps) {
  const ingredients = useApi<Ingredient[]>("/admin/ingredients?limit=100&isActive=true");
  const locations = useApi<StockLocation[]>("/admin/stock-locations?limit=100");

  const [stockLocationId, setStockLocationId] = useState(defaultLocationId ?? "");
  const [ingredientId, setIngredientId] = useState("");
  const [movementType, setMovementType] = useState("purchase");
  const [quantity, setQuantity] = useState("");
  const [movementDate, setMovementDate] = useState(() => toDateInputValue(new Date()));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveLocation =
    stockLocationId || defaultLocationId || locations.data?.[0]?.id || "";

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const amount = Number(quantity);
    if (!effectiveLocation) return setError("Pilih lokasi stok terlebih dulu.");
    if (!ingredientId) return setError("Pilih bahan baku.");
    if (!Number.isFinite(amount) || amount === 0) {
      return setError("Jumlah harus diisi dan tidak boleh 0.");
    }

    setSaving(true);
    try {
      await apiPost("/admin/stock/movements", {
        stockLocationId: effectiveLocation,
        ingredientId,
        quantityDelta: amount,
        movementType,
        movementDate: movementDate || undefined,
        notes: notes.trim() || undefined,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan pergerakan stok");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppModal
      isOpen
      onClose={onClose}
      title="Tambah Pergerakan Stok"
      desc="Catat stok masuk/keluar beserta tanggal transaksinya."
      size="lg"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            Batal
          </button>
          <button
            type="submit"
            form="movement-form"
            disabled={saving}
            className={primaryButtonClass}
          >
            {saving ? "Menyimpan..." : "Simpan"}
          </button>
        </>
      }
    >
      <form id="movement-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className={fieldLabelClass}>Lokasi Stok</span>
            <select
              value={effectiveLocation}
              onChange={(event) => setStockLocationId(event.target.value)}
              className={inputClass}
            >
              <option value="">Pilih lokasi</option>
              {(locations.data ?? []).map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={fieldLabelClass}>Jenis Mutasi</span>
            <select
              value={movementType}
              onChange={(event) => setMovementType(event.target.value)}
              className={inputClass}
            >
              {MOVEMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {movementTypeLabel(type)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className={fieldLabelClass}>Bahan Baku</span>
          <IngredientPicker
            ingredients={ingredients.data ?? []}
            value={ingredientId}
            onChange={setIngredientId}
            showStock
          />
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className={fieldLabelClass}>Jumlah</span>
            <input
              type="number"
              step="any"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              placeholder="mis. 2.5"
              className={`${inputClass} text-end`}
            />
            <span className="text-theme-xs text-coffee-muted">
              Untuk penyesuaian boleh negatif (mis. -1.5).
            </span>
          </label>
          <label className="flex flex-col gap-1">
            <span className={fieldLabelClass}>Tanggal Transaksi</span>
            <input
              type="date"
              value={movementDate}
              onChange={(event) => setMovementDate(event.target.value)}
              className={inputClass}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className={fieldLabelClass}>Catatan (opsional)</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={2}
            placeholder="mis. Pembelian dari supplier, nomor nota..."
            className={textareaClass}
          />
        </label>

        {error && (
          <p className="rounded-lg border border-coffee-danger/30 bg-coffee-danger/5 px-3 py-2 text-theme-sm text-coffee-danger">
            {error}
          </p>
        )}
      </form>
    </AppModal>
  );
}
