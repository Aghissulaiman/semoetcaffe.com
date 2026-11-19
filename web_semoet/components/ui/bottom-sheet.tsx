"use client";

import { X, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/**
 * Sheet bawah untuk form singkat (ulasan, laporan, mulai chat).
 * Konten dapat di-scroll bila lebih tinggi dari layar.
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  subtitle,
  icon: Icon,
  children,
  footer,
  className,
}: BottomSheetProps) {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[75] flex items-end justify-center bg-black/45 animate-fade-in">
      <button
        type="button"
        aria-label="Tutup"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />

      <div
        className={cn(
          "relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col rounded-t-[24px] border border-line bg-surface px-5 pb-7 pt-4 animate-slide-up",
          className,
        )}>
        <div className="mx-auto h-1 w-11 rounded-full bg-line" />

        <div className="flex items-center gap-2.5 pt-3.5">
          {Icon ? (
            <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
              <Icon size={20} />
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-black text-ink">{title}</h2>
            {subtitle ? <p className="text-xs text-muted">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="text-muted transition hover:text-ink focus-ring">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pt-4">{children}</div>

        {footer ? <div className="border-t border-line pt-3.5">{footer}</div> : null}
      </div>
    </div>
  );
}
