"use client";

import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  size?: "sm" | "md";
}

/** Chip filter (kategori, status pesanan, sortir). */
export function Chip({ label, active = false, size = "md", className, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      {...rest}
      aria-pressed={active}
      className={cn(
        "shrink-0 rounded-full border font-semibold transition focus-ring",
        size === "sm" ? "px-3 py-[7px] text-xs" : "px-4 py-[9px] text-[13px]",
        active
          ? "border-primary bg-primary text-white"
          : "border-line bg-surface text-ink-soft hover:border-primary/40 hover:bg-primary-soft",
        className,
      )}>
      {label}
    </button>
  );
}
