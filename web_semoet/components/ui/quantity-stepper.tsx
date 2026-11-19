"use client";

import { Minus, Plus, Trash2 } from "lucide-react";

import { cn } from "@/lib/cn";

interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  size?: "sm" | "md";
  className?: string;
}

/** Tombol tambah/kurang jumlah item. */
export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  size = "md",
  className,
}: QuantityStepperProps) {
  const dimension = size === "sm" ? 28 : 34;
  const iconSize = size === "sm" ? 15 : 17;
  const atMin = value <= min;
  const atMax = value >= max;

  const buttonClass =
    "flex shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary transition hover:bg-cream focus-ring disabled:opacity-40";

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <button
        type="button"
        onClick={() => onChange(Math.max(min - 1, value - 1))}
        disabled={atMin}
        aria-label={atMin ? "Hapus item" : "Kurangi"}
        className={buttonClass}
        style={{ width: dimension, height: dimension }}>
        {atMin ? <Trash2 size={iconSize} /> : <Minus size={iconSize} />}
      </button>
      <span
        className={cn(
          "min-w-[22px] text-center font-extrabold text-ink",
          size === "sm" ? "text-sm" : "text-[15px]",
        )}>
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={atMax}
        aria-label="Tambah"
        className={buttonClass}
        style={{ width: dimension, height: dimension }}>
        <Plus size={iconSize} />
      </button>
    </div>
  );
}
