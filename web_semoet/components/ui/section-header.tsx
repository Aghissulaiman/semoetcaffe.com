import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
  children?: ReactNode;
}

/** Judul bagian dengan tautan aksi di kanan ("Lihat semua"). */
export function SectionHeader({
  title,
  subtitle,
  actionLabel,
  onAction,
  className,
  children,
}: SectionHeaderProps) {
  return (
    <div className={cn("mb-3 flex items-end justify-between gap-3", className)}>
      <div className="min-w-0 flex-1">
        <h2 className="text-[17px] font-extrabold text-ink">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-muted">{subtitle}</p> : null}
      </div>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="shrink-0 text-[13px] font-bold text-primary transition hover:text-primary-dark focus-ring">
          {actionLabel}
        </button>
      ) : null}
      {children}
    </div>
  );
}
