"use client";

import { Loader2 } from "lucide-react";

import { cn } from "@/lib/cn";

interface LoaderProps {
  label?: string;
  /** Tampil memenuhi area induk. */
  fullscreen?: boolean;
  className?: string;
}

/** Indikator pemuatan bertema kopi. */
export function Loader({ label = "Memuat…", fullscreen = true, className }: LoaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2.5 text-center",
        fullscreen ? "min-h-[50vh] flex-1 py-16" : "py-6",
        className,
      )}>
      <Loader2 className="animate-spin text-primary" size={fullscreen ? 30 : 22} />
      <p className="text-[13px] text-muted">{label}</p>
    </div>
  );
}
