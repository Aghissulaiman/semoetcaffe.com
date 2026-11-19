"use client";

import { Coffee, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

/** Kondisi kosong / belum login. */
export function EmptyState({
  icon: Icon = Coffee,
  title,
  description,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-8 py-16 text-center", className)}>
      <div className="mb-1 flex h-[76px] w-[76px] items-center justify-center rounded-full bg-primary-soft">
        <Icon size={34} className="text-primary" />
      </div>
      <h3 className="text-base font-extrabold text-ink">{title}</h3>
      {description ? (
        <p className="max-w-sm text-[13px] leading-relaxed text-muted">{description}</p>
      ) : null}
      {actionLabel && onAction ? (
        <Button title={actionLabel} onClick={onAction} fullWidth={false} size="sm" className="mt-3" />
      ) : null}
    </div>
  );
}
