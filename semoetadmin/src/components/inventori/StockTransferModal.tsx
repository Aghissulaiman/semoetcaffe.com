"use client";

import AppModal from "@/components/common/AppModal";
import IngredientPicker from "@/components/common/IngredientPicker";
import { useApi } from "@/hooks/useApi";
import { ApiError, apiPost } from "@/lib/client";
import { toDateInputValue } from "@/lib/format";
import {
  fieldLabelClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
  textareaClass,
} from "@/lib/ui";
import type { Ingredient, StockLocation } from "@/types/api";
import { useState } from "react";

interface StockTransferModalProps {
  onClose: () => void;
  onSaved: () => void;
}

function findByName(locations: StockLocation[], keywords: string[]): string {
  const found = locations.find((location) => {
    const haystack = location.name.toLowerCase();
    return keywords.some((keyword) => haystack.includes(keyword));
  });
  return found?.id ?? "";
}

/**
 * Transfer bahan baku antar lokasi, mis. Gudang → Outlet Semoet. Satu transfer
 * otomatis membuat mutasi keluar & masuk yang saling terhubung.
 */
export default function StockTransferModal({ onClose, onSaved }: StockTransferModalProps) {
  const ingredients = useApi<Ingredient[]>("/admin/ingredients?limit=100&isActive=true");
  const locations = useApi<StockLocation[]>("/admin/stock-locations?limit=100");

  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [ingredientId, setIngredientId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [movementDate, setMovementDate] = useState(() => toDateInputValue(new Date()));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const available = locations.data ?? [];
  const defaultFrom =
    findByName(available, ["gudang", "warehouse"]) || available[0]?.id || "";
  const defaultTo =
    findByName(available, ["semoet", "outlet", "cafe"]) ||
    available.find((location) => location.id !== defaultFrom)?.id ||
    "";
  const effectiveFrom = fromId || defaultFrom;
  const effectiveTo = toId || defaultTo;
  const selectedIngredient = (ingredients.data ?? []).find((item) => item.id === ingredientId);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const amount = Number(quantity);

    if (!effectiveFrom || !effectiveTo) return setError("Pilih lokasi asal dan tujuan.");
    if (effectiveFrom === effectiveTo) return setError("Lokasi asal dan tujuan tidak boleh sama.");
    if (!ingredientId) return setError("Pilih bahan yang akan dipindahkan.");
    if (!Number.isFinite(amount) || amount <= 0) {
      return setError("Jumlah transfer harus lebih dari 0.");
    }

    setSaving(true);
    try {
      await apiPost("/admin/stock/transfers", {
        fromStockLocationId: effectiveFrom,
        toStockLocationId: effectiveTo,
        ingredientId,
        quantity: amount,
        movementDate: movementDate || undefined,
        notes: notes.trim() || undefined,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memindahkan stok");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppModal
      isOpen
      onClose={onClose}
      title="Transfer Stok Antar Lokasi"
      desc="Pindahkan bahan baku dari gudang ke outlet Semoet (atau sebaliknya)."
      size="lg"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            Batal
          </button>
          <button
            type="submit"
            form="transfer-form"
            disabled={saving}
            className={primaryButtonClass}
          >
            {saving ? "Memindahkan..." : "Transfer Stok"}
          </button>
        </>
      }
    >
      <form id="transfer-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className={fieldLabelClass}>Dari Lokasi</span>
            <select
              value={effectiveFrom}
              onChange={(event) => setFromId(event.target.value)}
              className={inputClass}
            >
              <option value="">Pilih lokasi asal</option>
              {available.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={fieldLabelClass}>Ke Lokasi</span>
            <select
              value={effectiveTo}
              onChange={(event) => setToId(event.target.value)}
              className={inputClass}
            >
              <option value="">Pilih lokasi tujuan</option>
              {available.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
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
            <span className={fieldLabelClass}>
              Jumlah {selectedIngredient ? `(${selectedIngredient.baseUnit})` : ""}
            </span>
            <input
              type="number"
              min="0"
              step="any"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              placeholder="mis. 5"
              className={`${inputClass} text-end`}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={fieldLabelClass}>Tanggal Transfer</span>
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
            placeholder="mis. Restock outlet pagi"
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
