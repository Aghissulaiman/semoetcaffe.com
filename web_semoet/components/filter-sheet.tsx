"use client";

import { SlidersHorizontal, X } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";

export interface FilterOption {
  label: string;
  value: string | null;
}

interface FilterSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** Bagian kategori (value `null` = semua). */
  categories?: FilterOption[];
  activeCategory?: string | null;
  onSelectCategory?: (value: string | null) => void;
  /** Bagian urutan. */
  sorts?: FilterOption[];
  activeSort?: string;
  onSelectSort?: (value: string) => void;
  onReset?: () => void;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-xs font-extrabold uppercase tracking-wide text-muted">{title}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

/** Sheet filter bawah (kategori & urutan). */
export function FilterSheet({
  visible,
  onClose,
  title = "Filter",
  categories,
  activeCategory = null,
  onSelectCategory,
  sorts,
  activeSort,
  onSelectSort,
  onReset,
}: FilterSheetProps) {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 animate-fade-in">
      <button
        type="button"
        aria-label="Tutup filter"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />

      <div className="relative z-10 flex max-h-[84vh] w-full max-w-2xl flex-col rounded-t-[24px] border border-line bg-surface px-5 pb-7 pt-4 animate-slide-up">
        <div className="mx-auto h-1 w-11 rounded-full bg-line" />

        <div className="flex items-center gap-2.5 pt-3.5">
          <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-primary-soft text-primary">
            <SlidersHorizontal size={20} />
          </span>
          <h2 className="flex-1 text-[17px] font-black text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="text-muted transition hover:text-ink focus-ring">
            <X size={24} />
          </button>
        </div>

        <div className="flex flex-col gap-5 overflow-y-auto pt-4">
          {categories && categories.length > 0 ? (
            <Section title="Kategori">
              {categories.map((option) => (
                <Chip
                  key={option.value ?? "all"}
                  label={option.label}
                  active={option.value === activeCategory}
                  onClick={() => onSelectCategory?.(option.value)}
                />
              ))}
            </Section>
          ) : null}

          {sorts && sorts.length > 0 ? (
            <Section title="Urutkan">
              {sorts.map((option) => (
                <Chip
                  key={option.value ?? "default"}
                  label={option.label}
                  size="sm"
                  active={option.value === activeSort}
                  onClick={() => option.value && onSelectSort?.(option.value)}
                />
              ))}
            </Section>
          ) : null}
        </div>

        {onReset ? (
          <div className="pt-4">
            <Button title="Reset filter" variant="soft" onClick={onReset} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
