"use client";

import DateRangePicker from "@/components/common/DateRangePicker";
import { secondaryButtonClass } from "@/lib/ui";

interface SalesFilterBarProps {
  from: string;
  to: string;
  onRangeChange: (from: string, to: string) => void;
  onReset: () => void;
}

export default function SalesFilterBar({
  from,
  to,
  onRangeChange,
  onReset,
}: SalesFilterBarProps) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-coffee-linen bg-white p-4 dark:border-coffee-night-border dark:bg-coffee-night-soft">
      <label className="flex flex-col gap-1">
        <span className="text-theme-xs font-medium text-coffee-muted">Periode</span>
        <DateRangePicker from={from} to={to} onChange={onRangeChange} />
      </label>

      <button type="button" onClick={onReset} className={`ms-auto ${secondaryButtonClass}`}>
        Reset
      </button>
    </div>
  );
}
