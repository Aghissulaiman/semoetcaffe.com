"use client";

import { cn } from "@/utils";
import type { ReactNode } from "react";

export interface Column<T = Record<string, unknown>> {
  key: string;
  header: string;
  width?: string;
  align?: "left" | "center" | "right";
  render?: (row: T, index: number) => ReactNode;
}

export interface DataTableProps<T = Record<string, unknown>> {
  columns: Column<T>[];
  data: T[];
  keyExtractor?: (row: T) => string;
  emptyMessage?: string;
  stickyHeader?: boolean;
  className?: string;
  /** Bila diisi, baris tabel bisa diklik (mis. membuka detail). */
  onRowClick?: (row: T, index: number) => void;
}

function DataTable<T>({
  columns,
  data,
  keyExtractor = (row) => String((row as { id?: unknown }).id ?? JSON.stringify(row)),
  emptyMessage = "Tidak ada data",
  stickyHeader = true,
  className,
  onRowClick,
}: DataTableProps<T>) {
  if (data.length === 0) {
    return (
      <div className={cn("py-12 text-center text-coffee-muted", className)}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={cn("overflow-x-auto rounded-xl border border-coffee-linen dark:border-coffee-night-border", className)}>
      <table className="w-full border-collapse">
        <thead className={cn(stickyHeader && "sticky top-0 z-10")}>
          <tr className="bg-coffee-milk/50 dark:bg-coffee-night-border/50">
            {columns.map((column) => (
              <th
                key={column.key}
                style={{ width: column.width, textAlign: column.align ?? "left" }}
                className={cn(
                  "px-4 py-3 text-left text-theme-xs font-semibold uppercase tracking-wider text-coffee-muted border-b border-coffee-linen dark:border-coffee-night-border",
                  column.align === "center" && "text-center",
                  column.align === "right" && "text-right",
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => (
            <tr
              key={keyExtractor(row)}
              onClick={onRowClick ? () => onRowClick(row, rowIndex) : undefined}
              onKeyDown={
                onRowClick
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onRowClick(row, rowIndex);
                      }
                    }
                  : undefined
              }
              tabIndex={onRowClick ? 0 : undefined}
              role={onRowClick ? "button" : undefined}
              className={cn(
                "border-b border-coffee-linen/50 dark:border-coffee-night-border/50 hover:bg-coffee-milk/30 dark:hover:bg-white/5 transition-colors",
                onRowClick && "cursor-pointer",
              )}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  style={{ textAlign: column.align ?? "left" }}
                  className={cn(
                    "px-4 py-3 text-theme-sm text-coffee-espresso dark:text-coffee-cream",
                    column.align === "center" && "text-center",
                    column.align === "right" && "text-right",
                  )}
                >
                  {column.render
                    ? column.render(row, rowIndex)
                    : String((row as Record<string, unknown>)[column.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default DataTable;