import React from "react";

/** Kerangka pemuatan (skeleton). */
export function Skeleton({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-coffee-linen/60 dark:bg-white/5 ${className}`}
      style={style}
    />
  );
}

export function CardSkeleton({ height = 120 }: { height?: number }) {
  return <Skeleton className="w-full" style={{ height }} />;
}

/** Blok pemuatan sederhana dengan pesan. */
export function LoadingBlock({ message = "Memuat data…" }: { message?: string }) {
  return (
    <div className="flex min-h-32 flex-col items-center justify-center gap-3 rounded-xl border border-coffee-linen px-6 py-10 text-center dark:border-coffee-night-border">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-coffee-linen border-t-coffee-brown dark:border-coffee-night-border dark:border-t-coffee-caramel" />
      <p className="text-theme-sm text-coffee-muted">{message}</p>
    </div>
  );
}

/** Pesan galat yang konsisten. */
export function ErrorBlock({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-coffee-danger/30 bg-coffee-danger/5 px-6 py-10 text-center">
      <p className="text-theme-sm font-medium text-coffee-danger">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg border border-coffee-danger/40 px-4 py-2 text-theme-xs font-semibold text-coffee-danger transition-colors hover:bg-coffee-danger/10"
        >
          Coba lagi
        </button>
      )}
    </div>
  );
}

/** Pesan saat data kosong. */
export function EmptyBlock({ message = "Belum ada data" }: { message?: string }) {
  return (
    <div className="flex min-h-32 items-center justify-center rounded-xl border border-dashed border-coffee-linen px-6 py-10 text-center text-theme-sm text-coffee-muted dark:border-coffee-night-border">
      {message}
    </div>
  );
}

export function KpiSkeleton() {
  return (
    <div className="rounded-2xl border border-coffee-linen bg-white p-5 dark:border-coffee-night-border dark:bg-coffee-night-soft">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-4 h-7 w-32" />
      <Skeleton className="mt-3 h-3 w-20" />
    </div>
  );
}
