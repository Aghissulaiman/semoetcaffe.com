"use client";

import { useClickOutside } from "@/hooks/useClickOutside";
import { inputClass } from "@/lib/ui";
import type { Ingredient } from "@/types/api";
import { cn } from "@/utils";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

interface IngredientPickerProps {
  ingredients: Ingredient[];
  value: string;
  onChange: (ingredientId: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Tampilkan stok berjalan di setiap opsi. */
  showStock?: boolean;
  /** Tampilkan pesan memuat saat daftar bahan masih diambil dari backend. */
  loading?: boolean;
}

/**
 * Pemilih bahan baku yang bisa langsung diketik. Pengguna mengetik nama/SKU,
 * daftar opsi otomatis tersaring — tidak perlu menggulir select panjang.
 */
export default function IngredientPicker({
  ingredients,
  value,
  onChange,
  placeholder = "Ketik nama atau SKU bahan...",
  disabled = false,
  className,
  showStock = false,
  loading = false,
}: IngredientPickerProps) {
  const selected = ingredients.find((item) => item.id === value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [placement, setPlacement] = useState<"bottom" | "top">("bottom");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  /**
   * Modal panel memakai `overflow-y-auto`, jadi dropdown yang jatuh ke bawah
   * bisa terpotong saat input berada di dekat bawah (mis. seksi Resep Bahan di
   * form produk). Balik ke atas bila ruang bawah tidak cukup.
   */
  const syncPlacement = useCallback(() => {
    const rect = inputRef.current?.getBoundingClientRect();
    if (!rect) return;
    const spaceBelow = window.innerHeight - rect.bottom;
    setPlacement(spaceBelow < 280 ? "top" : "bottom");
  }, []);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", syncPlacement, true);
    window.addEventListener("resize", syncPlacement);
    return () => {
      window.removeEventListener("scroll", syncPlacement, true);
      window.removeEventListener("resize", syncPlacement);
    };
  }, [open, syncPlacement]);

  useClickOutside(wrapperRef, close);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return ingredients;
    return ingredients.filter(
      (item) =>
        item.name.toLowerCase().includes(needle) ||
        (item.sku ?? "").toLowerCase().includes(needle),
    );
  }, [ingredients, query]);

  const displayValue = open ? query : selected ? selected.name : "";

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        disabled={disabled}
        value={displayValue}
        placeholder={selected ? `${selected.name} (${selected.baseUnit})` : placeholder}
        onFocus={() => {
          syncPlacement();
          setOpen(true);
          setQuery("");
        }}
        onChange={(event) => {
          syncPlacement();
          setQuery(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") close();
          if (event.key === "Enter" && open && filtered.length > 0) {
            event.preventDefault();
            onChange(filtered[0].id);
            close();
          }
        }}
        className={cn(inputClass, selected && !open && "font-medium")}
      />
      {open && (
        <div
          id={listId}
          role="listbox"
          className={cn(
            "absolute z-30 max-h-64 w-full overflow-y-auto rounded-xl border border-coffee-linen bg-white p-1 shadow-lg dark:border-coffee-night-border dark:bg-coffee-night-soft",
            placement === "top" ? "bottom-full mb-1" : "top-full mt-1",
          )}
        >
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-theme-xs text-coffee-muted">
              {loading
                ? "Memuat daftar bahan baku…"
                : "Bahan tidak ditemukan. Tambahkan dulu di menu Inventori."}
            </p>
          ) : (
            filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={item.id === value}
                onClick={() => {
                  onChange(item.id);
                  close();
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-start text-theme-sm transition-colors hover:bg-coffee-milk dark:hover:bg-white/5",
                  item.id === value && "bg-coffee-milk/70 dark:bg-white/5",
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-coffee-espresso dark:text-coffee-cream">
                    {item.name}
                  </span>
                  <span className="block font-mono text-theme-xs text-coffee-muted">
                    {item.sku} · {item.baseUnit}
                  </span>
                </span>
                {showStock && (
                  <span className="shrink-0 text-theme-xs text-coffee-muted">
                    stok {item.onHand ?? 0}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
