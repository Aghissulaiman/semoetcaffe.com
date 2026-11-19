"use client";

import { CloudOff, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  className?: string;
}

/** Tampilan galat + tombol coba lagi. */
export function ErrorState({ message = "Gagal memuat data", onRetry, className }: ErrorStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2.5 px-8 py-12 text-center", className)}>
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#f7e4e0]">
        <CloudOff size={30} className="text-danger" />
      </div>
      <p className="text-sm font-bold text-ink">Ups, ada masalah</p>
      <p className="max-w-sm text-[13px] leading-relaxed text-muted">{message}</p>
      {onRetry ? (
        <Button
          title="Coba lagi"
          icon={RefreshCw}
          onClick={onRetry}
          fullWidth={false}
          size="sm"
          variant="soft"
          className="mt-2"
        />
      ) : null}
    </div>
  );
}
