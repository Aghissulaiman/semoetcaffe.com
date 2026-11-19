"use client";

import AppModal from "@/components/common/AppModal";
import { ApiError, apiPost } from "@/lib/client";
import { fieldLabelClass, primaryButtonClass, secondaryButtonClass, textareaClass } from "@/lib/ui";
import { useState } from "react";

interface StockOutCancelModalProps {
  documentId: string;
  number: string;
  onClose: () => void;
  onCancelled: () => void;
}

export default function StockOutCancelModal({
  documentId,
  number,
  onClose,
  onCancelled,
}: StockOutCancelModalProps) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await apiPost(`/admin/stock-outs/${documentId}/cancel`, {
        reason: reason.trim() || undefined,
      });
      onCancelled();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal membatalkan dokumen stok keluar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppModal
      isOpen
      onClose={onClose}
      title="Batalkan Stok Keluar"
      desc={`Dokumen ${number} akan ditandai dibatalkan dan tidak memindahkan stok.`}
      size="md"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass} disabled={saving}>
            Kembali
          </button>
          <button type="submit" form="cancel-stock-out-form" className={primaryButtonClass} disabled={saving}>
            {saving ? "Membatalkan..." : "Batalkan Dokumen"}
          </button>
        </>
      }
    >
      <form id="cancel-stock-out-form" onSubmit={handleSubmit} className="space-y-3">
        <label className="flex flex-col gap-1">
          <span className={fieldLabelClass}>Alasan Pembatalan</span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            placeholder="mis. Distribusi belum dipakai"
            className={textareaClass}
          />
        </label>
        <p className="text-theme-xs text-coffee-muted">
          Dokumen yang sudah diposting tidak bisa dibatalkan. Gunakan dokumen baru bila perlunya.
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
