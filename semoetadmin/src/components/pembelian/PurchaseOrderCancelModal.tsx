"use client";

import AppModal from "@/components/common/AppModal";
import { ApiError, apiPost } from "@/lib/client";
import {
  fieldLabelClass,
  primaryButtonClass,
  secondaryButtonClass,
  textareaClass,
} from "@/lib/ui";
import { useState } from "react";

interface PurchaseOrderCancelModalProps {
  orderId: string;
  orderNumber: string;
  onClose: () => void;
  onCancelled: () => void;
}

/** Batalkan purchase order beserta alasan pembatalan (opsional). */
export default function PurchaseOrderCancelModal({
  orderId,
  orderNumber,
  onClose,
  onCancelled,
}: PurchaseOrderCancelModalProps) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await apiPost(`/admin/purchase-orders/${orderId}/cancel`, {
        reason: reason.trim() || undefined,
      });
      onCancelled();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal membatalkan purchase order");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppModal
      isOpen
      onClose={onClose}
      title="Batalkan Purchase Order"
      desc={`PO ${orderNumber} akan ditandai dibatalkan dan tidak bisa diterima lagi.`}
      size="md"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass} disabled={saving}>
            Kembali
          </button>
          <button
            type="submit"
            form="cancel-purchase-order-form"
            className={primaryButtonClass}
            disabled={saving}
          >
            {saving ? "Membatalkan…" : "Batalkan PO"}
          </button>
        </>
      }
    >
      <form id="cancel-purchase-order-form" onSubmit={handleSubmit} className="space-y-3">
        <label className="flex flex-col gap-1">
          <span className={fieldLabelClass}>Alasan Pembatalan</span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            placeholder="mis. Supplier tidak bisa memenuhi pesanan"
            className={textareaClass}
          />
        </label>
        <p className="text-theme-xs text-coffee-muted">
          PO yang sudah memiliki penerimaan diposting tidak dapat dibatalkan. Gunakan penyesuaian
          stok bila barang sudah masuk.
        </p>
        {error && (
          <p className="rounded-lg border border-coffee-danger/30 bg-coffee-danger/5 px-3 py-2 text-theme-sm text-coffee-danger">
            {error}
          </p>
        )}
      </form>
    </AppModal>
  );
}
