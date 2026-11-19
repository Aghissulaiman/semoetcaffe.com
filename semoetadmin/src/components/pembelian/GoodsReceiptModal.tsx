"use client";

import AppModal from "@/components/common/AppModal";
import { useApi } from "@/hooks/useApi";
import { ApiError, apiPost } from "@/lib/client";
import { formatIdr, formatNumber, toDateInputValue } from "@/lib/format";
import {
  fieldLabelClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
  textareaClass,
} from "@/lib/ui";
import type { PurchaseOrder, PurchaseOrderItem, StockLocation } from "@/types/api";
import { useMemo, useState } from "react";
import { cn } from "@/utils";

interface GoodsReceiptModalProps {
  order: PurchaseOrder;
  items: PurchaseOrderItem[];
  onClose: () => void;
  onSaved: () => void;
}

function pickWarehouse(locations: StockLocation[]): string {
  const found = locations.find((location) => {
    const haystack = location.name.toLowerCase();
    return haystack.includes("gudang") || haystack.includes("warehouse");
  });
  return found?.id ?? locations[0]?.id ?? "";
}

/**
 * Form penerimaan barang fisik. Toggle "Lanjut tambah stok masuk" menjadi
 * pemicu: bila aktif, backend langsung memposting mutasi stok dan menautkan
 * nomor PO pada catatan inventori.
 */
export default function GoodsReceiptModal({
  order,
  items,
  onClose,
  onSaved,
}: GoodsReceiptModalProps) {
  const locations = useApi<StockLocation[]>("/admin/stock-locations?limit=100");
  const receivableItems = useMemo(
    () => items.filter((item) => item.remainingQuantity > 0),
    [items],
  );

  const [locationId, setLocationId] = useState("");
  const [receivedDate, setReceivedDate] = useState(() => toDateInputValue(new Date()));
  const [postToStock, setPostToStock] = useState(true);
  const [notes, setNotes] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      receivableItems.map((item) => [item.id, String(item.remainingQuantity)]),
    ),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveLocation = locationId || pickWarehouse(locations.data ?? []);
  const lines = receivableItems
    .map((item) => ({ item, quantity: Number(quantities[item.id] ?? 0) }))
    .filter((line) => Number.isFinite(line.quantity) && line.quantity > 0);
  const totalQuantity = lines.reduce((total, line) => total + line.quantity, 0);
  const totalValue = lines.reduce(
    (total, line) => total + Math.round(line.quantity * line.item.unitPriceIdr),
    0,
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!effectiveLocation) return setError("Pilih lokasi penyimpanan stok.");
    if (lines.length === 0) return setError("Isi kuantitas minimal satu bahan yang diterima.");

    for (const line of lines) {
      if (line.quantity - line.item.remainingQuantity > 0.0005) {
        return setError(
          `Kuantitas ${line.item.ingredientName} melebihi sisa pesanan (${line.item.remainingQuantity} ${line.item.baseUnit ?? ""}).`,
        );
      }
    }

    setSaving(true);
    try {
      await apiPost(`/admin/purchase-orders/${order.id}/receipts`, {
        stockLocationId: effectiveLocation,
        receivedDate: receivedDate || undefined,
        postToStock,
        notes: notes.trim() || undefined,
        items: lines.map((line) => ({
          purchaseOrderItemId: line.item.id,
          quantity: line.quantity,
        })),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan penerimaan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppModal
      isOpen
      onClose={onClose}
      title="Penerimaan Barang"
      desc={`Catat barang fisik yang tiba untuk ${order.number} dari ${order.supplierName ?? "supplier"}.`}
      size="xl"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass} disabled={saving}>
            Batal
          </button>
          <button
            type="submit"
            form="goods-receipt-form"
            className={primaryButtonClass}
            disabled={saving || lines.length === 0}
          >
            {saving ? "Menyimpan…" : postToStock ? "Simpan & Tambah Stok" : "Simpan Draft"}
          </button>
        </>
      }
    >
      <form id="goods-receipt-form" onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className={fieldLabelClass}>Lokasi Stok *</span>
            <select
              value={effectiveLocation}
              onChange={(event) => setLocationId(event.target.value)}
              className={inputClass}
              required
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
            <span className={fieldLabelClass}>Tanggal Terima</span>
            <input
              type="date"
              value={receivedDate}
              onChange={(event) => setReceivedDate(event.target.value)}
              className={inputClass}
            />
          </label>
          <div className="flex flex-col gap-1">
            <span className={fieldLabelClass}>Status Dokumen</span>
            <div className="flex h-10 items-center rounded-lg border border-coffee-linen px-3 text-theme-sm dark:border-coffee-night-border">
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-theme-xs font-medium",
                  postToStock
                    ? "bg-coffee-success/15 text-coffee-success"
                    : "bg-coffee-warning/20 text-coffee-warning",
                )}
              >
                {postToStock ? "Posted" : "Draft"}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-coffee-linen dark:border-coffee-night-border">
          <div className="border-b border-coffee-linen px-4 py-3 dark:border-coffee-night-border">
            <p className="text-theme-sm font-semibold text-coffee-dark dark:text-coffee-cream">
              Bahan Diterima
            </p>
            <p className="text-theme-xs text-coffee-muted">
              Kosongkan bahan yang belum datang. Sisa pesanan tetap bisa diterima kemudian.
            </p>
          </div>
          <div className="divide-y divide-coffee-linen/70 dark:divide-coffee-night-border/70">
            {receivableItems.length === 0 ? (
              <p className="px-4 py-6 text-center text-theme-sm text-coffee-muted">
                Semua bahan pada PO ini sudah diterima.
              </p>
            ) : (
              receivableItems.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-1 items-end gap-3 px-4 py-3 sm:grid-cols-12"
                >
                  <div className="sm:col-span-5">
                    <p className="text-theme-sm font-medium text-coffee-dark dark:text-coffee-cream">
                      {item.ingredientName}
                    </p>
                    <p className="text-theme-xs text-coffee-muted">
                      {item.ingredientSku} · sisa {formatNumber(item.remainingQuantity)}{" "}
                      {item.baseUnit}
                    </p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-theme-xs text-coffee-muted">Dipesan</p>
                    <p className="text-theme-sm">
                      {formatNumber(item.quantity)} {item.baseUnit}
                    </p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-theme-xs text-coffee-muted">Harga Satuan</p>
                    <p className="text-theme-sm">{formatIdr(item.unitPriceIdr)}</p>
                  </div>
                  <label className="flex flex-col gap-1 sm:col-span-3">
                    <span className={fieldLabelClass}>Jumlah Diterima</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        max={item.remainingQuantity}
                        value={quantities[item.id] ?? ""}
                        onChange={(event) =>
                          setQuantities((prev) => ({ ...prev, [item.id]: event.target.value }))
                        }
                        className={`${inputClass} text-end`}
                      />
                      <span className="text-theme-xs text-coffee-muted">{item.baseUnit}</span>
                    </div>
                  </label>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <p className={fieldLabelClass}>Lanjut tambah stok masuk?</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPostToStock(true)}
                className={cn(
                  "flex-1 rounded-lg border px-3 py-2 text-theme-sm font-semibold transition-colors",
                  postToStock
                    ? "border-coffee-success bg-coffee-success/10 text-coffee-success"
                    : "border-coffee-linen text-coffee-muted dark:border-coffee-night-border",
                )}
              >
                Ya, tambah stok
              </button>
              <button
                type="button"
                onClick={() => setPostToStock(false)}
                className={cn(
                  "flex-1 rounded-lg border px-3 py-2 text-theme-sm font-semibold transition-colors",
                  !postToStock
                    ? "border-coffee-warning bg-coffee-warning/10 text-coffee-warning"
                    : "border-coffee-linen text-coffee-muted dark:border-coffee-night-border",
                )}
              >
                Tidak, simpan draft
              </button>
            </div>
            <p className="text-theme-xs text-coffee-muted">
              {postToStock
                ? "Stok bahan langsung bertambah dan mutasi inventori ditautkan ke nomor PO ini."
                : "Dokumen disimpan sebagai draft. Stok baru bertambah setelah diposting dari tab Penerimaan."}
            </p>
            <label className="flex flex-col gap-1 pt-1">
              <span className={fieldLabelClass}>Catatan Penerimaan</span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={2}
                placeholder="mis. Barang datang lengkap, kondisi baik"
                className={textareaClass}
              />
            </label>
          </div>

          <div className="h-fit space-y-2 rounded-xl border border-coffee-linen bg-coffee-milk/40 p-4 dark:border-coffee-night-border dark:bg-white/5">
            <div className="flex justify-between text-theme-sm">
              <span className="text-coffee-muted">Baris diterima</span>
              <span className="font-medium">{formatNumber(lines.length)}</span>
            </div>
            <div className="flex justify-between text-theme-sm">
              <span className="text-coffee-muted">Total kuantitas</span>
              <span className="font-medium">{formatNumber(totalQuantity)}</span>
            </div>
            <div className="flex justify-between border-t border-coffee-linen pt-2 text-theme-sm font-semibold dark:border-coffee-night-border">
              <span>Nilai penerimaan</span>
              <span className="text-coffee-brown dark:text-coffee-caramel">
                {formatIdr(totalValue)}
              </span>
            </div>
            <p className="pt-1 text-theme-xs text-coffee-muted">
              Referensi PO {order.number} akan tersimpan pada catatan log inventori.
            </p>
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
