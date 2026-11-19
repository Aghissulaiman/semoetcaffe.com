"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import { useState } from "react";

import { CartIconButton } from "@/components/cart-item-row";
import { cn } from "@/lib/cn";

interface TopBarProps {
  /** Mode input: nilai & handler pencarian. Bila kosong, kolom jadi tombol. */
  searchValue?: string;
  onChangeSearch?: (text: string) => void;
  onSubmitSearch?: () => void;
  /** Mode tombol: kolom pencarian ditekan (mis. buka tab Menu). */
  onPressSearch?: () => void;
  onPressFilter: () => void;
  /** Tandai ada filter aktif (ikon terisi). */
  filterActive?: boolean;
  cartCount: number;
  onPressCart: () => void;
  placeholder?: string;
  className?: string;
}

export function TopBar({
  searchValue,
  onChangeSearch,
  onSubmitSearch,
  onPressSearch,
  onPressFilter,
  filterActive = false,
  cartCount,
  onPressCart,
  placeholder = "Cari menu…",
  className,
}: TopBarProps) {
  const [focused, setFocused] = useState(false);
  const editable = typeof onChangeSearch === "function";

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 border-b border-line bg-surface px-4 py-2.5",
        className,
      )}>
      <button
        type="button"
        onClick={onPressFilter}
        aria-label="Filter"
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition focus-ring",
          filterActive
            ? "bg-primary text-white"
            : "bg-primary-soft text-primary hover:bg-cream",
        )}>
        <SlidersHorizontal size={20} />
      </button>

      {editable ? (
        <div
          className={cn(
            "flex min-h-[42px] flex-1 items-center gap-2 rounded-full border bg-primary-soft px-3.5 transition",
            focused ? "border-primary" : "border-line",
          )}>
          <Search size={18} className={focused ? "text-primary" : "text-muted"} />
          <input
            value={searchValue}
            onChange={(event) => onChangeSearch?.(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSubmitSearch?.();
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={placeholder}
            autoCorrect="off"
            autoCapitalize="none"
            className="min-w-0 flex-1 bg-transparent py-2 text-sm text-ink outline-none placeholder:text-muted/80"
          />
          {searchValue ? (
            <button
              type="button"
              onClick={() => onChangeSearch?.("")}
              aria-label="Hapus pencarian"
              className="shrink-0 text-muted transition hover:text-ink">
              <X size={17} />
            </button>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={onPressSearch}
          aria-label="Cari menu"
          className="flex min-h-[42px] flex-1 items-center gap-2 rounded-full border border-line bg-primary-soft px-3.5 text-left transition hover:border-primary/40">
          <Search size={18} className="text-muted" />
          <span className="truncate text-sm text-muted">{placeholder}</span>
        </button>
      )}

      <CartIconButton count={cartCount} onPress={onPressCart} />
    </div>
  );
}
