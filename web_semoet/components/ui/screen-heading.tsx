"use client";

import { BackButton } from "@/components/ui/back-button";
import { cn } from "@/lib/cn";

interface ScreenHeadingProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  className?: string;
}

/** Judul halaman + tombol kembali tanpa navbar. */
export function ScreenHeading({ title, subtitle, onBack, className }: ScreenHeadingProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      {onBack ? <BackButton onPress={onBack} /> : null}
      <div className="min-w-0 flex-1">
        <h1 className="text-[23px] font-black tracking-tight text-ink">{title}</h1>
        {subtitle ? <p className="text-[13px] text-muted">{subtitle}</p> : null}
      </div>
    </div>
  );
}
