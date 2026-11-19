/**
 * Helper ekspor CSV. Hanya panggil `downloadCsv` dari event handler di klien
 * (memakai Blob + URL API browser).
 */

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

/** Pemisah `;` supaya langsung rapi saat dibuka di Excel locale Indonesia. */
const SEPARATOR = ";";

function escapeCell(input: string | number | null | undefined): string {
  const text = input === null || input === undefined ? "" : String(input);
  if (/["\n;,]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((column) => escapeCell(column.header)).join(SEPARATOR);
  const body = rows.map((row) =>
    columns.map((column) => escapeCell(column.value(row))).join(SEPARATOR),
  );
  return [header, ...body].join("\r\n");
}

export function downloadCsv(filename: string, csv: string): void {
  // BOM agar Excel membaca UTF-8 dengan benar.
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
