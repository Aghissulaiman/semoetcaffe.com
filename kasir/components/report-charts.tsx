"use client";

import { cn } from "@/lib/cn";
import { formatRupiah } from "@/lib/format";
import type { DayPoint, HourPoint } from "@/lib/reports";

function compactRupiah(value: number): string {
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return `${millions >= 10 ? Math.round(millions) : millions.toFixed(1)}jt`;
  }
  if (value >= 1_000) return `${Math.round(value / 1_000)}rb`;
  return String(Math.round(value));
}

function MiniBarChart({
  data,
  maxHeightClass = "h-36",
}: {
  data: { key: string; label: string; value: number; hint: string }[];
  maxHeightClass?: string;
}) {
  const max = Math.max(1, ...data.map((point) => point.value));
  const step = Math.max(1, Math.ceil(data.length / 10));

  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-xs text-muted">
        Belum ada data pada rentang ini.
      </p>
    );
  }

  return (
    <div className="no-scrollbar flex items-end gap-1 overflow-x-auto pb-1">
      {data.map((point, index) => {
        const height = Math.max(3, Math.round((point.value / max) * 100));
        const showLabel = index % step === 0 || index === data.length - 1;
        return (
          <div
            key={point.key}
            className="flex min-w-[24px] flex-1 flex-col items-center gap-1"
            title={point.hint}
          >
            <span className="h-3 text-[8px] font-bold leading-3 text-muted tabular">
              {point.value > 0 ? compactRupiah(point.value) : ""}
            </span>
            <div className={cn("flex w-full items-end", maxHeightClass)}>
              <div
                className={cn(
                  "w-full rounded-t-md transition-all",
                  point.value > 0
                    ? "bg-gradient-to-t from-primary to-caramel"
                    : "bg-line",
                )}
                style={{ height: `${height}%` }}
              />
            </div>
            <span
              className={cn(
                "whitespace-nowrap text-[9px] font-semibold text-muted",
                !showLabel && "invisible",
              )}
            >
              {point.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function SalesBarChart({ data }: { data: DayPoint[] }) {
  return (
    <MiniBarChart
      data={data.map((point) => ({
        key: point.key,
        label: point.label,
        value: point.revenue,
        hint: `${point.label}: ${formatRupiah(point.revenue)} · ${point.count} transaksi`,
      }))}
    />
  );
}

export function HourlyChart({ data }: { data: HourPoint[] }) {
  return (
    <MiniBarChart
      data={data.map((point) => ({
        key: String(point.hour),
        label: point.label,
        value: point.revenue,
        hint: `Jam ${point.label}: ${formatRupiah(point.revenue)} · ${point.count} transaksi`,
      }))}
      maxHeightClass="h-28"
    />
  );
}

export function BreakdownBars({
  data,
  barClassName = "bg-primary",
  emptyLabel = "Belum ada data.",
}: {
  data: { label: string; amount: number; count?: number; emoji?: string }[];
  barClassName?: string;
  emptyLabel?: string;
}) {
  const total = data.reduce((sum, item) => sum + item.amount, 0);
  const max = Math.max(1, ...data.map((item) => item.amount));

  if (data.length === 0) {
    return <p className="py-8 text-center text-xs text-muted">{emptyLabel}</p>;
  }

  return (
    <div className="flex flex-col gap-2.5">
      {data.map((item) => {
        const percent = total > 0 ? Math.round((item.amount / total) * 100) : 0;
        return (
          <div key={item.label}>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate font-bold text-ink-soft">
                {item.emoji ? `${item.emoji} ` : ""}
                {item.label}
                {item.count !== undefined ? (
                  <span className="ml-1 text-[10px] font-semibold text-muted">
                    ({item.count}x)
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 font-black text-ink tabular">
                {formatRupiah(item.amount)}
                <span className="ml-1 text-[10px] font-bold text-muted">
                  {percent}%
                </span>
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-milk">
              <div
                className={cn("h-full rounded-full", barClassName)}
                style={{ width: `${Math.max(2, (item.amount / max) * 100)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
