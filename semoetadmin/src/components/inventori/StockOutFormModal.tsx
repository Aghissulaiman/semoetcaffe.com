"use client";

import AppModal from "@/components/common/AppModal";
import IngredientPicker from "@/components/common/IngredientPicker";
import { useAllIngredients } from "@/hooks/useAllIngredients";
import { useApi } from "@/hooks/useApi";
import { ApiError, apiPatch, apiPost } from "@/lib/client";
import { toDateInputValue } from "@/lib/format";
import {
  fieldLabelClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
  textareaClass,
} from "@/lib/ui";
import type { StockLocation, StockOutDocument, StockOutItem } from "@/types/api";
import { cn } from "@/utils";
import { useEffect, useMemo, useState } from "react";

interface StockOutLine {
  ingredientId: string;
  quantity: string;
  notes: string;
}

interface StockOutFormModalProps {
  initial?: StockOutDocument | null;
  initialItems?: StockOutItem[];
  onClose: () => void;
  onSaved: () => void;
}

function findByName(locations: StockLocation[], keywords: string[]): string | undefined {
  const found = locations.find((location) => {
    const haystack = location.name.toLowerCase();
    return keywords.some((keyword) => haystack.includes(keyword));
  });
  return found?.id;
}

export default function StockOutFormModal({
  initial,
  initialItems,
  onClose,
  onSaved,
}: StockOutFormModalProps) {
  const isEdit = Boolean(initial);
  const locations = useApi<StockLocation[]>("/admin/stock-locations?limit=100");
  const ingredients = useAllIngredients({ isActive: true });

  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [transferDate, setTransferDate] = useState(() => toDateInputValue(new Date()));
  const [notes, setNotes] = useState("");
  const [postNow, setPostNow] = useState(true);
  const [lines, setLines] = useState<StockOutLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const available = locations.data ?? [];
  const defaultFrom = findByName(available, ["gudang", "warehouse"]) ?? available[0]?.id ?? "";
  const defaultTo =
    findByName(available, ["semoet", "outlet", "cafe"]) ??
    available.find((location) => location.id !== defaultFrom)?.id ??
    "";

  useEffect(() => {
    if (!fromId && defaultFrom) setFromId(defaultFrom);
    if (!toId && defaultTo) setToId(defaultTo);
  }, [defaultFrom, defaultTo, fromId, toId]);

  useEffect(() => {
    if (initial) {
      const initialLines: StockOutLine[] = (initialItems ?? []).map((item) => ({
        ingredientId: item.ingredientId,
        quantity: String(item.quantity),
        notes: item.notes ?? "",
      }));
      setLines(initialLines.length > 0 ? initialLines : [{ ingredientId: "", quantity: "", notes: "" }]);
      setFromId(initial.fromStockLocationId);
      setToId(initial.toStockLocationId);
      setTransferDate(initial.transferDate ? initial.transferDate.slice(0, 10) : toDateInputValue(new Date()));
      setNotes(initial.notes ?? "");
    } else {
      setLines([{ ingredientId: "", quantity: "", notes: "" }]);
      setFromId("");
      setToId("");
      setTransferDate(toDateInputValue(new Date()));
      setNotes("");
      setPostNow(true);
    }
  }, [initial, initialItems]);

  const selectedIngredients = useMemo(
    () => (ingredients.data ?? []).filter((item) => item.isActive),
    [ingredients.data],
  );

  const effectiveFrom = fromId || defaultFrom;
  const effectiveTo = toId || defaultTo;

  const submittedLines = useMemo(
    () =>
      lines
        .map((line) => ({
          ingredientId: line.ingredientId,
          quantity: Number(line.quantity),
          notes: line.notes.trim() || undefined,
        }))
        .filter((line) => line.ingredientId && Number.isFinite(line.quantity) && line.quantity > 0),
    [lines],
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!effectiveFrom || !effectiveTo) return setError("Pilih lokasi asal dan tujuan.");
    if (effectiveFrom === effectiveTo) return setError("Lokasi asal dan tujuan tidak boleh sama.");

    const usableLines = submittedLines;
    if (usableLines.length === 0) return setError("Tambahkan minimal satu bahan yang didistribusikan.");

    for (const line of usableLines) {
      const ingredient = selectedIngredients.find((item) => item.id === line.ingredientId);
      if (!ingredient) return setError("Bahan yang dipilih tidak tersedia.");
    }

    setSaving(true);
    try {
      if (initial) {
        await apiPatch(`/admin/stock-outs/${initial.id}`, {
          fromStockLocationId: effectiveFrom,
          toStockLocationId: effectiveTo,
          transferDate: transferDate || undefined,
          notes: notes.trim() || null,
          items: usableLines.map((line) => ({
            ingredientId: line.ingredientId,
            quantity: line.quantity,
            notes: line.notes,
          })),
        });
      } else {
        await apiPost("/admin/stock-outs", {
          fromStockLocationId: effectiveFrom,
          toStockLocationId: effectiveTo,
          transferDate: transferDate || undefined,
          notes: notes.trim() || undefined,
          postNow,
          items: usableLines.map((line) => ({
            ingredientId: line.ingredientId,
            quantity: line.quantity,
            notes: line.notes,
          })),
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan dokumen stok keluar");
    } finally {
      setSaving(false);
    }
  };

  const updateLine = (index: number, patch: Partial<StockOutLine>) => {
    setLines((prev) => prev.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)));
  };

  return (
    <AppModal
      isOpen
      onClose={onClose}
      title={isEdit ? "Ubah Stok Keluar" : "Stok Keluar (Transfer Gudang → Outlet)"}
      desc={
        isEdit
          ? `Ubah dokumen stok keluar untuk lokasi penyimpanan.`
          : "Catat barang yang dipindahkan dari gudang utama ke outlet."
      }
      size="xl"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass} disabled={saving}>
            Batal
          </button>
          <button
            type="submit"
            form="stock-out-form"
            disabled={saving}
            className={primaryButtonClass}
          >
            {saving ? "Menyimpan..." : isEdit ? "Simpan Draft" : postNow ? "Simpan & Posting" : "Simpan Draft"}
          </button>
        </>
      }
    >
      <form id="stock-out-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className={fieldLabelClass}>Dari Lokasi</span>
            <select
              value={effectiveFrom}
              onChange={(event) => setFromId(event.target.value)}
              className={inputClass}
              required
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
              required
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

        {!isEdit && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPostNow(true)}
              className={cn(
                "flex-1 rounded-lg border px-3 py-2 text-theme-sm font-semibold transition-colors",
                postNow
                  ? "border-coffee-success bg-coffee-success/10 text-coffee-success"
                  : "border-coffee-linen text-coffee-muted dark:border-coffee-night-border",
              )}
            >
              Ya, langsung posting
            </button>
            <button
              type="button"
              onClick={() => setPostNow(false)}
              className={cn(
                "flex-1 rounded-lg border px-3 py-2 text-theme-sm font-semibold transition-colors",
                !postNow
                  ? "border-coffee-warning bg-coffee-warning/10 text-coffee-warning"
                  : "border-coffee-linen text-coffee-muted dark:border-coffee-night-border",
              )}
            >
              Simpan sebagai draft
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className={fieldLabelClass}>Tanggal Transfer</span>
            <input
              type="date"
              value={transferDate}
              onChange={(event) => setTransferDate(event.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={fieldLabelClass}>Catatan Dokumen</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
              placeholder="mis. Distribusi sore ini"
              className={textareaClass}
            />
          </label>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className={fieldLabelClass}>Bahan &amp; Jumlah</p>
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() => setLines((prev) => [...prev, { ingredientId: "", quantity: "", notes: "" }])}
            >
              + Tambah Bahan
            </button>
          </div>

          {lines.map((line, index) => (
            <div
              key={index}
              className="grid grid-cols-1 gap-3 rounded-xl border border-coffee-linen p-3 dark:border-coffee-night-border sm:grid-cols-12"
            >
              <div className="sm:col-span-5">
                <label className="flex flex-col gap-1">
                  <span className="text-theme-xs font-medium text-coffee-muted">Bahan Baku</span>
                  <IngredientPicker
                    ingredients={selectedIngredients}
                    value={line.ingredientId}
                    onChange={(ingredientId) =>
                      setLines((prev) =>
                        prev.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, ingredientId } : item,
                        ),
                      )
                    }
                    showStock
                    loading={ingredients.loading}
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="text-theme-xs font-medium text-coffee-muted">Jumlah</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={line.quantity}
                  onChange={(event) => updateLine(index, { quantity: event.target.value })}
                  placeholder="0"
                  className={`${inputClass} text-end`}
                />
              </label>
              <label className="flex flex-col gap-1 sm:col-span-4">
                <span className="text-theme-xs font-medium text-coffee-muted">Catatan Baris</span>
                <input
                  value={line.notes}
                  onChange={(event) => updateLine(index, { notes: event.target.value })}
                  placeholder="opsional"
                  className={inputClass}
                />
              </label>
              <div className="flex items-end sm:col-span-12 sm:justify-end">
                <button
                  type="button"
                  className={`${secondaryButtonClass} px-3 text-coffee-danger`}
                  onClick={() => setLines((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}
                  disabled={lines.length === 1}
                >
                  Hapus
                </button>
              </div>
            </div>
          ))}
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
