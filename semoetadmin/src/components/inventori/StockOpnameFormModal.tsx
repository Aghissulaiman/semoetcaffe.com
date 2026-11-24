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
  secondaryButtonClass,
  textareaClass,
} from "@/lib/ui";
import type { StockLocation, StockOpnameDocument, StockOpnameItem, StockSnapshot } from "@/types/api";
import { cn } from "@/utils";
import { useEffect, useMemo, useState } from "react";

const EMPTY_LOCATIONS: StockLocation[] = [];

interface StockOpnameLine {
  ingredientId: string;
  countedQuantity: string;
  notes: string;
}

interface StockOpnameFormModalProps {
  initial?: StockOpnameDocument | null;
  initialItems?: StockOpnameItem[];
  onClose: () => void;
  onSaved: () => void;
}

export default function StockOpnameFormModal({
  initial,
  initialItems,
  onClose,
  onSaved,
}: StockOpnameFormModalProps) {
  const isEdit = Boolean(initial);
  const locations = useApi<StockLocation[]>("/admin/stock-locations?limit=100");
  const ingredients = useAllIngredients();
  const [locationId, setLocationId] = useState("");
  const [opnameDate, setOpnameDate] = useState(() => toDateInputValue(new Date()));
  const [notes, setNotes] = useState("");
  const [postNow, setPostNow] = useState(true);
  const [lines, setLines] = useState<StockOpnameLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const available = locations.data ?? EMPTY_LOCATIONS;
  const effectiveLocation = locationId || available[0]?.id || "";

  const selectedLocation = useMemo(
    () => available.find((location) => location.id === effectiveLocation) ?? null,
    [available, effectiveLocation],
  );
  const snapshotPath = selectedLocation
    ? `/admin/stock/snapshot?stockLocationId=${effectiveLocation}`
    : null;
  const snapshot = useApi<StockSnapshot>(snapshotPath);

  useEffect(() => {
    if (!locationId && effectiveLocation) setLocationId(effectiveLocation);
  }, [effectiveLocation, locationId]);

  useEffect(() => {
    if (initial) {
      setLines(
        (initialItems ?? []).map((item) => ({
          ingredientId: item.ingredientId,
          countedQuantity: String(item.countedQuantity),
          notes: item.notes ?? "",
        })),
      );
      setLocationId(initial.stockLocationId);
      setOpnameDate(initial.opnameDate ? initial.opnameDate.slice(0, 10) : toDateInputValue(new Date()));
      setNotes(initial.notes ?? "");
    } else {
      setLines([{ ingredientId: "", countedQuantity: "", notes: "" }]);
      setLocationId("");
      setOpnameDate(toDateInputValue(new Date()));
      setNotes("");
      setPostNow(true);
    }
  }, [initial, initialItems]);

  const ingredientsWithStock = ingredients.data ?? [];

  const snapshotQuantity = (ingredientId: string, fallback: number): number => {
    const ingredient = ingredientsWithStock.find((item) => item.id === ingredientId);
    const byIngredient = snapshot.data?.items.find((item) => item.ingredientId === ingredientId);
    const byLocation = byIngredient?.byLocation.find(
      (location) => location.stockLocationId === effectiveLocation,
    );
    const onHand = byLocation?.onHand ?? byIngredient?.onHand ?? ingredient?.onHand ?? fallback;
    return Number(onHand ?? 0);
  };

  const submittedLines = useMemo(
    () =>
      lines
        .map((line) => ({
          ingredientId: line.ingredientId,
          countedQuantity: Number(line.countedQuantity),
          notes: line.notes.trim() || undefined,
        }))
        .filter(
          (line) =>
            line.ingredientId && Number.isFinite(line.countedQuantity) && line.countedQuantity >= 0,
        ),
    [lines],
  );

  const totalDifference = submittedLines.reduce((total, line) => {
    const system = snapshotQuantity(line.ingredientId, 0);
    return total + (Number.isFinite(line.countedQuantity) ? line.countedQuantity - system : 0);
  }, 0);

  const handleIngredientChange = (index: number, ingredientId: string) => {
    const system = ingredientId ? snapshotQuantity(ingredientId, 0) : 0;
    setLines((prev) =>
      prev.map((line, lineIndex) => {
        if (lineIndex !== index) return line;
        if (!ingredientId) return { ...line, ingredientId: "", countedQuantity: "", notes: "" };
        const preserve = line.ingredientId === ingredientId;
        return {
          ...line,
          ingredientId,
          countedQuantity: preserve ? line.countedQuantity : String(system),
          notes: preserve ? line.notes : "",
        };
      }),
    );
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!effectiveLocation) return setError("Pilih lokasi stok.");
    const usableLines = submittedLines;
    if (usableLines.length === 0) return setError("Tambahkan minimal satu bahan untuk dihitung stok.");

    setSaving(true);
    try {
      if (initial) {
        await apiPatch(`/admin/stock-opnames/${initial.id}`, {
          stockLocationId: effectiveLocation,
          opnameDate: opnameDate || undefined,
          notes: notes.trim() || null,
          items: usableLines.map((line) => ({
            ingredientId: line.ingredientId,
            countedQuantity: line.countedQuantity,
            notes: line.notes,
          })),
        });
      } else {
        await apiPost("/admin/stock-opnames", {
          stockLocationId: effectiveLocation,
          opnameDate: opnameDate || undefined,
          notes: notes.trim() || undefined,
          postNow,
          items: usableLines.map((line) => ({
            ingredientId: line.ingredientId,
            countedQuantity: line.countedQuantity,
            notes: line.notes,
          })),
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan dokumen stok opname");
    } finally {
      setSaving(false);
    }
  };

  const updateLine = (index: number, patch: Partial<StockOpnameLine>) => {
    setLines((prev) => prev.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)));
  };

  return (
    <AppModal
      isOpen
      onClose={onClose}
      title={isEdit ? "Ubah Stok Opname" : "Stok Opname (Penyesuaian Fisik)"}
      desc={
        isEdit
          ? `Ubah dokumen stok opname untuk lokasi penimbangan.`
          : "Hitung jumlah fisik bahan di satu lokasi dan perbaiki saldo stok."
      }
      size="xl"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass} disabled={saving}>
            Batal
          </button>
          <button
            type="submit"
            form="stock-opname-form"
            disabled={saving}
          >
            {saving ? "Menyimpan..." : isEdit ? "Simpan Draft" : postNow ? "Simpan & Posting" : "Simpan Draft"}
          </button>
        </>
      }
    >
      <form id="stock-opname-form" onSubmit={handleSubmit} className="space-y-4">
        <label className="flex flex-col gap-1">
          <span className={fieldLabelClass}>Lokasi Stok</span>
          <select
            value={effectiveLocation}
            onChange={(event) => setLocationId(event.target.value)}
            className={inputClass}
            required
          >
            <option value="">Pilih lokasi stok</option>
            {available.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className={fieldLabelClass}>Tanggal Opname</span>
            <input type="date" value={opnameDate} onChange={(event) => setOpnameDate(event.target.value)} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={fieldLabelClass}>Catatan Opname</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
              placeholder="mis. Pemeriksaan gudang pagi"
              className={textareaClass}
            />
          </label>
        </div>

        {!isEdit && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPostNow(true)}
              className={cn(
                "flex-1 rounded-lg border px-3 py-2 text-theme-sm font-semibold transition-colors",
                postNow ? "border-coffee-success bg-coffee-success/10 text-coffee-success" : "border-coffee-linen text-coffee-muted dark:border-coffee-night-border",
              )}
            >
              Ya, langsung posting
            </button>
            <button
              type="button"
              onClick={() => setPostNow(false)}
              className={cn(
                "flex-1 rounded-lg border px-3 py-2 text-theme-sm font-semibold transition-colors",
                !postNow ? "border-coffee-warning bg-coffee-warning/10 text-coffee-warning" : "border-coffee-linen text-coffee-muted dark:border-coffee-night-border",
              )}
            >
              Simpan sebagai draft
            </button>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className={fieldLabelClass}>Bahan &amp; Jumlah Fisik</p>
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() => setLines((prev) => [...prev, { ingredientId: "", countedQuantity: "", notes: "" }])}
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
                    ingredients={ingredientsWithStock}
                    value={line.ingredientId}
                    onChange={(ingredientId) => handleIngredientChange(index, ingredientId)}
                    showStock
                    loading={ingredients.loading}
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="text-theme-xs font-medium text-coffee-muted">Jumlah Fisik</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={line.countedQuantity}
                  onChange={(event) => updateLine(index, { countedQuantity: event.target.value })}
                  placeholder="0"
                  className={`${inputClass} text-end`}
                />
              </label>
              <label className="flex flex-col gap-1 sm:col-span-3">
                <span className="text-theme-xs font-medium text-coffee-muted">Catatan</span>
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

        <div className="rounded-xl border border-coffee-linen bg-coffee-milk/40 p-4 dark:border-coffee-night-border dark:bg-white/5">
          <div className="flex justify-between text-theme-sm">
            <span className="text-coffee-muted">Bahan yang dihitung</span>
            <span className="font-medium">{submittedLines.length}</span>
          </div>
          <div className="flex justify-between text-theme-sm">
            <span className="text-coffee-muted">Estimasi selisih</span>
            <span className="font-semibold text-coffee-warning">{submittedLines.length > 0 ? `± ${totalDifference}` : "-"}</span>
          </div>
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
