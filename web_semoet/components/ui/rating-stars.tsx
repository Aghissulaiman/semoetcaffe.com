"use client";

import { Star } from "lucide-react";

import { cn } from "@/lib/cn";

interface RatingStarsProps {
  rating: number | null;
  size?: number;
  /** Tampilkan angka rata-rata di sebelah bintang. */
  showValue?: boolean;
  count?: number;
  className?: string;
}

/** Bintang rating (1–5). */
export function RatingStars({ rating, size = 14, showValue = true, count, className }: RatingStarsProps) {
  const value = rating ?? 0;
  const rounded = Math.round(value);

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          size={size}
          className={star <= rounded ? "text-gold" : "text-muted"}
          fill={star <= rounded ? "currentColor" : "none"}
        />
      ))}
      {showValue && rating !== null ? (
        <span className="ml-0.5 font-bold text-ink" style={{ fontSize: size - 1 }}>
          {rating.toFixed(1)}
        </span>
      ) : null}
      {count !== undefined ? (
        <span className="text-muted" style={{ fontSize: size - 1 }}>
          ({count})
        </span>
      ) : null}
    </div>
  );
}
