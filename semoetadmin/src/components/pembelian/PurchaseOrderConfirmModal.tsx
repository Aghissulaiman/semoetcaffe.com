"use client";

import AppModal from "@/components/common/AppModal";
import { ApiError, apiPost } from "@/lib/client";
import { primaryButtonClass, secondaryButtonClass } from "@/lib/ui";
import { useState } from "react";

interface PurchaseOrderConfirmModalProps {
  orderId: string;
  orderNumber: string;
  onClose: () => void;
  onConfirmed: () => void;
}

/** Terbitkan purchase order (draft → ordered) agar bisa diterima. */
export default function PurchaseOrderConfirmModal({
  orderId,
  orderNumber,
  onClose,
  onConfirmed,
}: PurchaseOrderConfirmModalProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setError(null);
    setSaving(true);
    try {
      await apiPost(`/admin/purchase-orders/${orderId}/confirm`, {});
      onConfirmed();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menerbitkan purchase order");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppModal
      isOpen
      onClose={onClose}
      title="Terbitkan Purchase Order"
      desc={`Terbitkan ${orderNumber} ke supplier agar barang bisa diterima dan dicatat ke stok.`}
      size="sm"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass} disabled={saving}>
            Batal
          </button>
          <button type="button" onClick={handleConfirm} className={primaryButtonClass} disabled={saving}>
            {saving ? "Menerbitkan…" : "Terbitkan PO"}
          </button>
        </>
      }
    >
      <div className="space-y-2">
        <p className="text-theme-sm text-coffee-dark dark:text-coffee-cream">
          Setelah diterbitkan, PO tidak bisa diubah. Penerimaan barang tetap dicatat terpisah.
        </p>
        {error && (
          <p className="rounded-lg border border-coffee-danger/30 bg-coffee-danger/5 px-3 py-2 text-theme-sm text-coffee-danger">
            {error}
          </p>
        )}
      </div>
    </AppModal>
  );
}
