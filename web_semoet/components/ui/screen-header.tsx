"use client";

import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  /** Sembunyikan tombol kembali (mis. saat bukan hasil push). */
  hideBack?: boolean;
  right?: ReactNode;
  className?: string;
}

/** Header custom tema kopi untuk layar stack. */
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  hideBack,
  right,
  className,
}: ScreenHeaderProps) {
  return (
    <header
      className={cn(
        "flex items-center gap-3 border-b border-line bg-surface px-4 py-3",
        className,
      )}>
      {!hideBack && onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label="Kembali"
          className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary transition hover:bg-cream focus-ring">
          <ChevronLeft size={20} />
        </button>
      ) : null}

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-bold text-ink">{title}</h1>
        {subtitle ? <p className="truncate text-xs text-muted">{subtitle}</p> : null}
      </div>

      {right ? <div className="shrink-0">{right}</div> : null}
    </header>
  );
}
