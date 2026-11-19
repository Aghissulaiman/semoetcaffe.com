"use client";

import { useIsClient } from "@/hooks/useIsClient";
import { useClickOutside } from "@/hooks/useClickOutside";
import {
  DATE_PRESETS,
  type DatePreset,
  type MonthRef,
  addMonths,
  buildMonthGrid,
  compareValue,
  monthLabel,
  monthOfValue,
  presetRange,
  todayValue,
  weekdayLabels,
} from "@/lib/date-range";
import { formatDate } from "@/lib/format";
import { CalenderIcon, ChevronLeftIcon, ChevronRightIcon } from "@/icons";
import { cn } from "@/utils";
import { useEffect, useRef, useState } from "react";

interface DateRangePickerProps {
  from: string;
  to: string;
  /** Dipanggil saat rentang berubah (selesai memilih). */
  onChange: (from: string, to: string) => void;
  /** Kelas tambahan untuk tombol pemicu. */
  className?: string;
  /** Perataan popover terhadap tombol. */
  align?: "start" | "end";
  label?: string;
  /**
   * Tampilkan opsi "Semua tanggal" (mengirim `from`/`to` kosong).
   * Dipakai halaman yang mendukung filter tanggal opsional.
   */
  allowAll?: boolean;
}

const FALLBACK_MONTH: MonthRef = { year: 2026, month: 0 };

/**
 * Pemilih rentang tanggal gaya Semoet: tombol preset cepat + kalender popover.
 * Nilai tidak diketik manual — pengguna memilih dari daftar atau kalender.
 */
export default function DateRangePicker({
  from,
  to,
  onChange,
  className,
  align = "start",
  label,
  allowAll = false,
}: DateRangePickerProps) {
  const isClient = useIsClient();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<MonthRef>(() => monthOfValue(from, FALLBACK_MONTH));
  const [pendingStart, setPendingStart] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const today = isClient ? todayValue() : "";

  useClickOutside(containerRef, () => {
    setOpen(false);
    setPendingStart(null);
  });

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setPendingStart(null);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  const openPicker = () => {
    if (open) {
      setOpen(false);
      setPendingStart(null);
      return;
    }
    setView(monthOfValue(from, monthOfValue(today, FALLBACK_MONTH)));
    setPendingStart(null);
    setHovered(null);
    setOpen(true);
  };

  const applyPreset = (key: DatePreset) => {
    const range = presetRange(key, today || from);
    onChange(range.from, range.to);
    setOpen(false);
    setPendingStart(null);
  };

  const pickDay = (value: string) => {
    if (!pendingStart) {
      setPendingStart(value);
      return;
    }
    const [start, end] =
      compareValue(pendingStart, value) <= 0 ? [pendingStart, value] : [value, pendingStart];
    onChange(start, end);
    setPendingStart(null);
    setOpen(false);
  };

  const rangeStart = pendingStart ?? from;
  const rangeEnd = pendingStart ? (hovered ?? pendingStart) : to;
  const [lo, hi] =
    rangeStart && rangeEnd && compareValue(rangeStart, rangeEnd) <= 0
      ? [rangeStart, rangeEnd]
      : [rangeEnd, rangeStart];

  const cells = buildMonthGrid(view);

  const allDates = !from && !to;

  const triggerLabel = allDates
    ? allowAll
      ? "Semua tanggal"
      : "Pilih rentang tanggal"
    : from && to
      ? from === to
        ? formatDate(from)
        : `${formatDate(from)} – ${formatDate(to)}`
      : "Pilih rentang tanggal";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={openPicker}
        className={cn(
          "inline-flex h-10 items-center gap-2 rounded-lg border border-coffee-linen bg-white px-3 text-theme-sm font-medium text-coffee-espresso outline-hidden transition focus:border-coffee-brown focus:ring-3 focus:ring-coffee-brown/15 dark:border-coffee-night-border dark:bg-coffee-night dark:text-coffee-cream",
          open && "border-coffee-brown ring-3 ring-coffee-brown/15",
          className,
        )}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <CalenderIcon className="h-4 w-4 text-coffee-muted" />
        <span className="whitespace-nowrap">{triggerLabel}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={label ?? "Pilih rentang tanggal"}
          className={cn(
            "absolute z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-coffee-linen bg-white p-3 shadow-theme-lg dark:border-coffee-night-border dark:bg-coffee-night-soft",
            align === "end" ? "end-0" : "start-0",
          )}
        >
          {/* Preset cepat */}
          <div className="flex flex-wrap gap-1.5 border-b border-coffee-linen pb-3 dark:border-coffee-night-border">
            {allowAll && (
              <button
                type="button"
                onClick={() => {
                  onChange("", "");
                  setOpen(false);
                  setPendingStart(null);
                }}
                className={cn(
                  "rounded-lg border px-2.5 py-1.5 text-theme-xs font-medium transition-colors",
                  allDates
                    ? "border-coffee-brown bg-coffee-brown text-coffee-milk dark:border-coffee-caramel dark:bg-coffee-caramel dark:text-coffee-night"
                    : "border-coffee-linen text-coffee-dark hover:bg-coffee-milk dark:border-coffee-night-border dark:text-coffee-cream/80 dark:hover:bg-white/5",
                )}
              >
                Semua tanggal
              </button>
            )}
            {DATE_PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => applyPreset(preset.key)}
                className="rounded-lg border border-coffee-linen px-2.5 py-1.5 text-theme-xs font-medium text-coffee-dark transition-colors hover:bg-coffee-milk dark:border-coffee-night-border dark:text-coffee-cream/80 dark:hover:bg-white/5"
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Kalender */}
          <div className="pt-3">
            <div className="flex items-center justify-between px-1">
              <button
                type="button"
                aria-label="Bulan sebelumnya"
                onClick={() => setView((current) => addMonths(current, -1))}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-coffee-dark transition-colors hover:bg-coffee-milk dark:text-coffee-cream/80 dark:hover:bg-white/5 [&>svg]:h-4 [&>svg]:w-4"
              >
                <ChevronLeftIcon />
              </button>
              <p className="text-theme-sm font-semibold text-coffee-espresso dark:text-coffee-cream">
                {monthLabel(view)}
              </p>
              <button
                type="button"
                aria-label="Bulan berikutnya"
                onClick={() => setView((current) => addMonths(current, 1))}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-coffee-dark transition-colors hover:bg-coffee-milk dark:text-coffee-cream/80 dark:hover:bg-white/5 [&>svg]:h-4 [&>svg]:w-4"
              >
                <ChevronRightIcon />
              </button>
            </div>

            <div className="mt-2 grid grid-cols-7 gap-1">
              {weekdayLabels().map((day, index) => (
                <span
                  key={day}
                  className={cn(
                    "flex h-7 items-center justify-center text-[11px] font-semibold uppercase text-coffee-muted",
                    index >= 5 && "text-coffee-gold/80",
                  )}
                >
                  {day}
                </span>
              ))}
              {cells.map((value, index) => {
                if (!value) return <span key={`empty-${index}`} className="h-8" />;
                const selected = value === from || value === to;
                const inRange = Boolean(lo && hi && compareValue(value, lo) >= 0 && compareValue(value, hi) <= 0);
                const isToday = value === today;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => pickDay(value)}
                    onMouseEnter={() => setHovered(value)}
                    className={cn(
                      "flex h-8 items-center justify-center rounded-lg text-theme-xs font-medium transition-colors",
                      selected
                        ? "bg-coffee-brown text-coffee-milk dark:bg-coffee-caramel dark:text-coffee-night"
                        : inRange
                          ? "bg-coffee-brown/10 text-coffee-espresso dark:bg-coffee-caramel/15 dark:text-coffee-cream"
                          : "text-coffee-dark hover:bg-coffee-milk dark:text-coffee-cream/80 dark:hover:bg-white/5",
                      isToday && !selected && "ring-1 ring-coffee-gold/60",
                    )}
                  >
                    {Number(value.slice(8, 10))}
                  </button>
                );
              })}
            </div>

            <p className="mt-3 px-1 text-[11px] text-coffee-muted">
              {pendingStart
                ? "Pilih tanggal akhir."
                : "Pilih tanggal mulai, lalu tanggal akhir."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
