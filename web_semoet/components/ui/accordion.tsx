"use client";

import { ChevronDown, ChevronUp, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";

interface AccordionProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  /** Buka otomatis saat pertama dirender. */
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Item QnA: judul yang bisa dibuka-tutup untuk menampilkan jawaban/detail.
 * Dipakai halaman Reservasi supaya konten panjang tetap ringkas.
 */
export function Accordion({
  title,
  subtitle,
  icon: Icon,
  defaultOpen = false,
  children,
  className,
}: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border bg-surface transition",
        open ? "border-primary" : "border-line",
        className,
      )}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-3.5 text-left transition hover:bg-primary-soft/40 focus-ring">
        {Icon ? (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Icon size={18} />
          </span>
        ) : null}

        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold text-ink">{title}</span>
          {subtitle ? (
            <span className="mt-0.5 block line-clamp-2 text-xs text-muted">{subtitle}</span>
          ) : null}
        </span>

        {open ? (
          <ChevronUp size={18} className="shrink-0 text-muted" />
        ) : (
          <ChevronDown size={18} className="shrink-0 text-muted" />
        )}
      </button>

      {open ? (
        <div className="border-t border-line px-3.5 pb-3.5 pt-2.5">{children}</div>
      ) : null}
    </div>
  );
}
