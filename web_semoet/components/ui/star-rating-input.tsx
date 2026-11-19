"use client";

import { Star } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/cn";

interface StarRatingInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  hint?: string;
}

/** Input bintang 1–5 dengan hover dan status aksesibel. */
export function StarRatingInput({ label, value, onChange, hint }: StarRatingInputProps) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-semibold text-ink">{label}</span>
        <span className="text-xs font-bold text-muted">{value > 0 ? `${value}/5` : "Belum dinilai"}</span>
      </div>
      <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            onMouseEnter={() => setHover(star)}
            aria-label={`${label} ${star} bintang`}
            aria-pressed={value === star}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full transition focus-ring",
              star <= shown ? "text-gold" : "text-muted",
              "hover:bg-primary-soft",
            )}>
            <Star size={26} fill={star <= shown ? "currentColor" : "none"} />
          </button>
        ))}
      </div>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
