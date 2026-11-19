"use client";

import { useClickOutside } from "@/hooks/useClickOutside";
import { buildCsv, downloadCsv, type CsvColumn } from "@/lib/csv";
import {
  EXPORT_FORMATS,
  downloadExcel,
  downloadPdf,
  downloadWord,
  type ExportFormat,
} from "@/lib/export";
import { secondaryButtonClass } from "@/lib/ui";
import { DownloadIcon } from "@/icons";
import { useCallback, useRef, useState } from "react";

interface ExportCsvButtonProps<T> {
  filename: string;
  rows: T[];
  columns: CsvColumn<T>[];
  label?: string;
  disabled?: boolean;
  /** Judul dokumen pada Excel/Word/PDF. Default: nama berkas. */
  title?: string;
}

/**
 * Tombol unduh dengan pilihan format. Sebelum mengunduh, pengguna memilih
 * Excel (.xls), PDF, Word (.doc), atau CSV.
 */
export default function ExportCsvButton<T>({
  filename,
  rows,
  columns,
  label = "Unduh Data",
  disabled = false,
  title,
}: ExportCsvButtonProps<T>) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(wrapperRef, close);

  const isDisabled = disabled || rows.length === 0;

  const handleDownload = (format: ExportFormat) => {
    if (format === "csv") {
      downloadCsv(filename, buildCsv(rows, columns));
    } else if (format === "xlsx") {
      downloadExcel(filename, rows, columns, title);
    } else if (format === "docx") {
      downloadWord(filename, rows, columns, title);
    } else {
      downloadPdf(filename, rows, columns, title);
    }
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        disabled={isDisabled}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`${secondaryButtonClass} [&>svg]:h-4 [&>svg]:w-4`}
      >
        <DownloadIcon />
        {label}
        <span aria-hidden className="text-[10px]">
          ▾
        </span>
      </button>
      {open && !isDisabled && (
        <div
          role="menu"
          className="absolute end-0 z-40 mt-1 w-56 overflow-hidden rounded-xl border border-coffee-linen bg-white py-1 shadow-lg dark:border-coffee-night-border dark:bg-coffee-night-soft"
        >
          <p className="px-3 py-1.5 text-theme-xs font-semibold text-coffee-muted">
            Pilih format unduhan
          </p>
          {EXPORT_FORMATS.map((option) => (
            <button
              key={option.format}
              type="button"
              role="menuitem"
              onClick={() => handleDownload(option.format)}
              className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-start transition-colors hover:bg-coffee-milk dark:hover:bg-white/5"
            >
              <span className="text-theme-sm font-medium text-coffee-espresso dark:text-coffee-cream">
                {option.label}
              </span>
              <span className="text-theme-xs text-coffee-muted">{option.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
