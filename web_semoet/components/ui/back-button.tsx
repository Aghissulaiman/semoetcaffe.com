"use client";

import { ChevronLeft } from "lucide-react";

import { cn } from "@/lib/cn";

interface BackButtonProps {
  onPress: () => void;
  className?: string;
  label?: string;
}

/** Lingkaran kembali mengambang tanpa navbar (dipakai layar stack). */
export function BackButton({ onPress, className, label = "Kembali" }: BackButtonProps) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={label}
      className={cn(
        "flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full border border-line bg-surface text-primary transition hover:bg-primary-soft focus-ring",
        className,
      )}>
      <ChevronLeft size={20} />
    </button>
  );
}
