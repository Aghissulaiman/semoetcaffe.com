"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "@/icons";
import { cn } from "@/utils";

interface PaginationProps {
  page: number;
  totalPages: number;
  total?: number;
  onPageChange: (page: number) => void;
  /** Label satuan data, mis. "pengguna". */
  unit?: string;
}

/** Bangun daftar halaman dengan elipsis di sekitar halaman aktif. */
function buildPages(page: number, totalPages: number): (number | "ellipsis")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  const pages: (number | "ellipsis")[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);

  if (start > 2) pages.push("ellipsis");
  for (let current = start; current <= end; current += 1) pages.push(current);
  if (end < totalPages - 1) pages.push("ellipsis");
  pages.push(totalPages);
  return pages;
}

export default function Pagination({
  page,
  totalPages,
  total,
  onPageChange,
  unit = "data",
}: PaginationProps) {
  if (totalPages <= 1) {
    return total !== undefined ? (
      <p className="text-theme-xs text-coffee-muted">
        {total} {unit}
      </p>
    ) : null;
  }

  const pages = buildPages(page, totalPages);

  const navButton = (
    label: string,
    icon: React.ReactNode,
    target: number,
    disabled: boolean,
  ) => (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={() => onPageChange(target)}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-coffee-linen text-coffee-dark transition-colors hover:bg-coffee-milk disabled:cursor-not-allowed disabled:opacity-40 dark:border-coffee-night-border dark:text-coffee-cream/80 dark:hover:bg-white/5 [&>svg]:h-4 [&>svg]:w-4"
    >
      {icon}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {total !== undefined ? (
        <p className="text-theme-xs text-coffee-muted">
          {total} {unit} · halaman {page} dari {totalPages}
        </p>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-1.5">
        {navButton("Sebelumnya", <ChevronLeftIcon />, page - 1, page <= 1)}
        {pages.map((item, index) =>
          item === "ellipsis" ? (
            <span key={`ellipsis-${index}`} className="px-1 text-theme-sm text-coffee-muted">
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => onPageChange(item)}
              className={cn(
                "flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-theme-sm font-medium transition-colors",
                item === page
                  ? "bg-coffee-brown text-coffee-milk dark:bg-coffee-caramel dark:text-coffee-night"
                  : "border border-coffee-linen text-coffee-dark hover:bg-coffee-milk dark:border-coffee-night-border dark:text-coffee-cream/80 dark:hover:bg-white/5",
              )}
            >
              {item}
            </button>
          ),
        )}
        {navButton("Berikutnya", <ChevronRightIcon />, page + 1, page >= totalPages)}
      </div>
    </div>
  );
}
