"use client";

/**
 * Dialog bertema aplikasi (pengganti Alert bawaan sistem).
 *
 * Kartu putih di tengah layar dengan ikon, judul, pesan, tombol aksi, dan
 * tombol X di kanan atas untuk membatalkan/menutup.
 */
import { AlertCircle, CheckCircle2, Info, X, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export type DialogTone = "primary" | "success" | "danger" | "warning";

interface AppDialogProps {
  visible: boolean;
  /** Dipanggil saat X, latar, tombol batal, atau tombol utama (tanpa onConfirm) ditekan. */
  onClose: () => void;
  title: string;
  message?: ReactNode;
  icon?: LucideIcon;
  tone?: DialogTone;
  /** Tombol utama. Bila kosong, hanya tombol tutup yang tampil. */
  confirmLabel?: string;
  confirmVariant?: "primary" | "danger" | "soft";
  onConfirm?: () => void;
  confirmLoading?: boolean;
  /** Label tombol sekunder/tutup. */
  cancelLabel?: string;
}

const ACCENT: Record<DialogTone, string> = {
  primary: "text-primary",
  success: "text-success",
  danger: "text-danger",
  warning: "text-warning",
};

const SOFT: Record<DialogTone, string> = {
  primary: "bg-primary-soft",
  success: "bg-[#e7f1ea]",
  danger: "bg-[#f7e4e0]",
  warning: "bg-[#fbeedd]",
};

export function AppDialog({
  visible,
  onClose,
  title,
  message,
  icon: Icon = Info,
  tone = "primary",
  confirmLabel,
  confirmVariant,
  onConfirm,
  confirmLoading,
  cancelLabel = "Tutup",
}: AppDialogProps) {
  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-6 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label={title}>
      <button
        type="button"
        aria-label="Tutup dialog"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />

      <div className="relative z-10 flex w-full max-w-[340px] flex-col gap-4 rounded-[24px] border border-line bg-surface p-5 shadow-[0_12px_24px_rgba(42,26,17,0.18)]">
        <button
          type="button"
          onClick={onClose}
          aria-label="Batalkan dan tutup"
          className="absolute right-3 top-3 flex h-[34px] w-[34px] items-center justify-center rounded-full bg-primary-soft text-muted transition hover:text-ink focus-ring">
          <X size={18} />
        </button>

        <div className="flex flex-col items-center gap-2.5 pt-1.5 text-center">
          <div className={cn("flex h-[60px] w-[60px] items-center justify-center rounded-full", SOFT[tone])}>
            <Icon size={30} className={ACCENT[tone]} />
          </div>
          <h2 className="text-lg font-black text-ink">{title}</h2>
          {message ? <p className="text-[13px] leading-5 text-muted">{message}</p> : null}
        </div>

        <div className="flex flex-col gap-2 pt-0.5">
          {confirmLabel && onConfirm ? (
            <Button
              title={confirmLabel}
              variant={confirmVariant ?? "primary"}
              onClick={onConfirm}
              loading={confirmLoading}
            />
          ) : null}
          <Button title={cancelLabel} variant="ghost" onClick={onClose} />
        </div>
      </div>
    </div>
  );
}

export { AlertCircle, CheckCircle2 };
