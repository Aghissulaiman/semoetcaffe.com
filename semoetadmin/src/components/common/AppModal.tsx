"use client";

import { CloseLineIcon } from "@/icons";
import { cn } from "@/utils";
import { useEffect } from "react";

interface AppModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  desc?: string;
  children: React.ReactNode;
  /** Lebar maksimum panel, default `max-w-lg`. */
  size?: "sm" | "md" | "lg" | "xl";
  footer?: React.ReactNode;
}

const sizeClasses: Record<NonNullable<AppModalProps["size"]>, string> = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

/**
 * Modal bergaya Semoet (putih + aksen cokelat, dukungan dark mode).
 * Fokus pada konten, tutup lewat tombol, klik latar, atau tombol Esc.
 */
export default function AppModal({
  isOpen,
  onClose,
  title,
  desc,
  children,
  size = "md",
  footer,
}: AppModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-99999 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
      <div
        className="fixed inset-0 h-full w-full bg-coffee-night/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative my-8 w-full rounded-2xl border border-coffee-linen bg-white shadow-theme-lg dark:border-coffee-night-border dark:bg-coffee-night-soft",
          sizeClasses[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-coffee-linen px-6 py-4 dark:border-coffee-night-border">
          <div>
            <h3 className="text-base font-semibold text-coffee-espresso dark:text-coffee-cream">
              {title}
            </h3>
            {desc && <p className="mt-0.5 text-theme-xs text-coffee-muted">{desc}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-coffee-muted transition-colors hover:bg-coffee-milk hover:text-coffee-espresso dark:hover:bg-white/5 dark:hover:text-coffee-cream [&>svg]:h-4 [&>svg]:w-4"
          >
            <CloseLineIcon />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-3 border-t border-coffee-linen px-6 py-4 dark:border-coffee-night-border">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
