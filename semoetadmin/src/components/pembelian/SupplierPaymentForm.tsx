"use client";

import { ApiError, apiPost } from "@/lib/client";
import { formatIdr, toDateInputValue } from "@/lib/format";
import { fieldLabelClass, inputClass, primaryButtonClass, textareaClass } from "@/lib/ui";
import type { PurchaseOrder } from "@/types/api";
import { useState } from "react";

interface PaymentTarget {
  id: string;
  number: string;
  totalIdr: number;
  paidAmountIdr: number;
  outstandingIdr: number;
}

interface SupplierPaymentFormProps {
  order: PurchaseOrder | PaymentTarget;
  onSaved: () => void;
}

const METHODS = [
  { value: "transfer", label: "Transfer Bank" },
  { value: "cash", label: "Tunai" },
  { value: "qris", label: "QRIS" },
  { value: "other", label: "Lainnya" },
];

/** Form pencatatan pembayaran supplier (mengurangi hutang PO). */
export default function SupplierPaymentForm({ order, onSaved }: SupplierPaymentFormProps) {
  const [amount, setAmount] = useState(() => String(Math.round(order.outstandingIdr)));
  const [paidAt, setPaidAt] = useState(() => toDateInputValue(new Date()));
  const [method, setMethod] = useState("transfer");
  const [reference, setReference] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const value = Math.round(Number(amount));
    if (!Number.isFinite(value) || value <= 0) {
      return setError("Nominal pembayaran harus lebih dari 0.");
    }
    if (value > order.outstandingIdr) {
      return setError(`Nominal melebihi sisa hutang ${formatIdr(order.outstandingIdr)}.`);
    }

    setSaving(true);
    try {
      await apiPost(`/admin/purchase-orders/${order.id}/payments`, {
        amountIdr: value,
        paidAt: paidAt || undefined,
        method,
        reference: reference.trim() || undefined,
        proofUrl: proofUrl.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mencatat pembayaran");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-3 gap-3 rounded-xl border border-coffee-linen bg-coffee-milk/40 p-3 text-center dark:border-coffee-night-border dark:bg-white/5">
        <div>
          <p className="text-theme-xs text-coffee-muted">Total</p>
          <p className="text-theme-sm font-semibold">{formatIdr(order.totalIdr)}</p>
        </div>
        <div>
          <p className="text-theme-xs text-coffee-muted">Dibayar</p>
          <p className="text-theme-sm font-semibold">{formatIdr(order.paidAmountIdr)}</p>
        </div>
        <div>
          <p className="text-theme-xs text-coffee-muted">Sisa</p>
          <p className="text-theme-sm font-semibold text-coffee-danger">
            {formatIdr(order.outstandingIdr)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className={fieldLabelClass}>Nominal (Rp) *</span>
          <input
            type="number"
            min="1"
            step="1"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className={`${inputClass} text-end`}
            required
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={fieldLabelClass}>Tanggal Bayar</span>
          <input
            type="date"
            value={paidAt}
            onChange={(event) => setPaidAt(event.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={fieldLabelClass}>Metode</span>
          <select
            value={method}
            onChange={(event) => setMethod(event.target.value)}
            className={inputClass}
          >
            {METHODS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={fieldLabelClass}>Nomor Referensi</span>
          <input
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="mis. TRX-2026-001"
            className={inputClass}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className={fieldLabelClass}>URL Bukti Transfer (opsional)</span>
        <input
          type="url"
          value={proofUrl}
          onChange={(event) => setProofUrl(event.target.value)}
          placeholder="https://…"
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className={fieldLabelClass}>Catatan</span>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={2}
          placeholder="Catatan pembayaran (opsional)"
          className={textareaClass}
        />
      </label>

      {error && (
        <p className="rounded-lg border border-coffee-danger/30 bg-coffee-danger/5 px-3 py-2 text-theme-sm text-coffee-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className={primaryButtonClass} disabled={saving}>
          {saving ? "Menyimpan…" : "Simpan Pembayaran"}
        </button>
      </div>
    </form>
  );
}
