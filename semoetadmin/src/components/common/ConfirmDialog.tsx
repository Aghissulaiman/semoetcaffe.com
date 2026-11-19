"use client";

import AppModal from "@/components/common/AppModal";
import { ApiError } from "@/lib/client";
import { dangerButtonClass, primaryButtonClass, secondaryButtonClass } from "@/lib/ui";
import { useState } from "react";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  /** Label tombol konfirmasi, default "Hapus". */
  confirmLabel?: string;
  /** Tone tombol konfirmasi: bahaya (merah) atau netral (cokelat). */
  tone?: "danger" | "neutral";
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}

/**
 * Dialog konfirmasi untuk aksi penting (hapus/pulihkan). Pemanggil bertanggung
 * jawab menutup dialog setelah `onConfirm` berhasil; bila gagal dialog tetap
 * terbuka dan menampilkan pesan galat.
 */
export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = "Hapus",
  tone = "danger",
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setWorking(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memproses permintaan");
      setWorking(false);
    }
  };

  return (
    <AppModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass} disabled={working}>
            Batal
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className={tone === "danger" ? dangerButtonClass : primaryButtonClass}
            disabled={working}
          >
            {working ? "Memproses…" : confirmLabel}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-xl border border-coffee-danger/30 bg-coffee-danger/5 px-4 py-3 text-theme-sm text-coffee-danger">
            {error}
          </div>
        )}
        <p className="text-theme-sm text-coffee-dark dark:text-coffee-cream/80">{message}</p>
      </div>
    </AppModal>
  );
}
