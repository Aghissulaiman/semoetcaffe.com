/**
 * Helper rentang tanggal berbasis string `yyyy-mm-dd`.
 * Semua fungsi murni (kecuali `todayValue`) agar aman dipakai saat render.
 */

export interface MonthRef {
  /** Tahun penuh, mis. 2026. */
  year: number;
  /** Bulan 0-11 (mengikuti Date). */
  month: number;
}

export interface DateParts {
  year: number;
  month: number;
  day: number;
}

const WEEKDAY_LABELS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

export function weekdayLabels(): string[] {
  return WEEKDAY_LABELS;
}

/** Dua digit dengan nol di depan. */
export function pad2(value: number): string {
  return `${value}`.padStart(2, "0");
}

/** Bangun string `yyyy-mm-dd`. */
export function toValue(year: number, month: number, day: number): string {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

/** Urai `yyyy-mm-dd` menjadi bagian tanggal, atau null bila tidak valid. */
export function parseValue(value: string | null | undefined): DateParts | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/** Bulan dari sebuah nilai tanggal; pakai `fallback` bila kosong/tidak valid. */
export function monthOfValue(value: string | null | undefined, fallback: MonthRef): MonthRef {
  const parts = parseValue(value);
  return parts ? { year: parts.year, month: parts.month } : fallback;
}

export function addMonths(ref: MonthRef, delta: number): MonthRef {
  const date = new Date(ref.year, ref.month + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Sel kalender satu bulan (mulai Senin), berisi `yyyy-mm-dd` atau null untuk sel kosong. */
export function buildMonthGrid(ref: MonthRef): (string | null)[] {
  const firstWeekday = (new Date(ref.year, ref.month, 1).getDay() + 6) % 7; // Senin = 0
  const total = daysInMonth(ref.year, ref.month);
  const cells: (string | null)[] = [];
  for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
  for (let day = 1; day <= total; day += 1) cells.push(toValue(ref.year, ref.month, day));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** Bandingkan dua nilai tanggal secara leksikografis (aman untuk format ISO). */
export function compareValue(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Label bulan Indonesia, mis. "Oktober 2026". */
export function monthLabel(ref: MonthRef): string {
  return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(
    new Date(ref.year, ref.month, 1),
  );
}

/** Tanggal hari ini (lokal) sebagai `yyyy-mm-dd`. Hanya panggil di klien / event handler. */
export function todayValue(): string {
  const now = new Date();
  return toValue(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Geser sebuah nilai tanggal beberapa hari. */
export function shiftDays(value: string, days: number): string {
  const parts = parseValue(value);
  if (!parts) return value;
  const date = new Date(parts.year, parts.month, parts.day + days);
  return toValue(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Awal & akhir sebuah bulan. */
export function monthBounds(ref: MonthRef): { start: string; end: string } {
  return {
    start: toValue(ref.year, ref.month, 1),
    end: toValue(ref.year, ref.month, daysInMonth(ref.year, ref.month)),
  };
}

export type DatePreset = "today" | "last7" | "last30" | "thisMonth" | "lastMonth";

export interface PresetOption {
  key: DatePreset;
  label: string;
}

export const DATE_PRESETS: PresetOption[] = [
  { key: "today", label: "Hari ini" },
  { key: "last7", label: "7 hari terakhir" },
  { key: "last30", label: "30 hari terakhir" },
  { key: "thisMonth", label: "Bulan ini" },
  { key: "lastMonth", label: "Bulan lalu" },
];

/** Hitung rentang tanggal untuk sebuah preset. Panggil hanya di klien. */
export function presetRange(key: DatePreset, today: string): { from: string; to: string } {
  const parts = parseValue(today);
  const ref: MonthRef = parts ? { year: parts.year, month: parts.month } : { year: 2026, month: 0 };
  switch (key) {
    case "today":
      return { from: today, to: today };
    case "last7":
      return { from: shiftDays(today, -6), to: today };
    case "last30":
      return { from: shiftDays(today, -29), to: today };
    case "thisMonth": {
      const bounds = monthBounds(ref);
      return { from: bounds.start, to: today };
    }
    case "lastMonth": {
      const bounds = monthBounds(addMonths(ref, -1));
      return { from: bounds.start, to: bounds.end };
    }
    default:
      return { from: today, to: today };
  }
}

/**
 * Rentang periode sebelumnya dengan panjang hari yang sama, tepat sebelum `from`.
 * Dipakai untuk membandingkan kinerja periode terpilih dengan periode sebelumnya.
 */
export function previousRange(from: string, to: string): { from: string; to: string } | null {
  const start = parseValue(from);
  const end = parseValue(to);
  if (!start || !end) return null;
  const startMs = Date.UTC(start.year, start.month, start.day);
  const endMs = Date.UTC(end.year, end.month, end.day);
  const lengthDays = Math.round((endMs - startMs) / 86_400_000) + 1;
  if (lengthDays <= 0) return null;
  return { from: shiftDays(from, -lengthDays), to: shiftDays(from, -1) };
}

/** Persentase perubahan (dibulatkan 1 desimal); null bila pembanding <= 0. */
export function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
