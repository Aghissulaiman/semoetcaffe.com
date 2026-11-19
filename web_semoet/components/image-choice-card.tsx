"use client";

import { Check, Image as ImageIcon, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/cn";

/** Ukuran gambar pada kartu pilihan. */
export type ImageChoiceVariant = "banner" | "tile";

interface ImageChoiceCardProps {
  title: string;
  /** Baris kecil di bawah judul (mis. tipe area, kapasitas). */
  subtitle?: string;
  /** URL gambar dari data admin; bila kosong tampil placeholder ikon. */
  imageUrl?: string | null;
  /** Ikon fallback ketika gambar belum diisi admin. */
  fallbackIcon?: LucideIcon;
  /** Label kecil di pojok (mis. "Aktif"). */
  badgeLabel?: string;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
  variant?: ImageChoiceVariant;
  className?: string;
}

/**
 * Kartu pilihan bergambar (cabang / area). Dipakai di form reservasi supaya
 * user memilih tempat dari foto yang diunggah admin, bukan sekadar teks.
 */
export function ImageChoiceCard({
  title,
  subtitle,
  imageUrl,
  fallbackIcon: FallbackIcon = ImageIcon,
  badgeLabel,
  selected = false,
  disabled = false,
  onPress,
  variant = "banner",
  className,
}: ImageChoiceCardProps) {
  const isTile = variant === "tile";

  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={`${title}${subtitle ? `, ${subtitle}` : ""}`}
      className={cn(
        "overflow-hidden rounded-2xl border bg-surface text-left transition focus-ring",
        selected ? "border-2 border-primary" : "border-line hover:border-primary/40",
        disabled ? "opacity-50" : "hover:-translate-y-0.5 hover:shadow-md",
        className,
      )}>
      <div
        className={cn(
          "relative flex w-full items-center justify-center bg-primary-soft",
          isTile ? "aspect-[4/3]" : "aspect-video",
        )}>
        {imageUrl ? (
          <img src={imageUrl} alt={title} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <FallbackIcon size={isTile ? 28 : 36} className="text-muted" />
        )}

        {badgeLabel ? (
          <span className="absolute right-2 top-2 rounded-full bg-surface px-2 py-[3px] text-[10px] font-bold text-muted">
            {badgeLabel}
          </span>
        ) : null}

        {selected ? (
          <span className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white">
            <Check size={15} />
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-0.5 p-3">
        <p className="truncate text-sm font-extrabold text-ink">{title}</p>
        {subtitle ? <p className="truncate text-xs text-muted">{subtitle}</p> : null}
      </div>
    </button>
  );
}
