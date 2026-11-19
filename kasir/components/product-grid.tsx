"use client";

import { PackageOpen, Plus, Search } from "lucide-react";
import { useMemo } from "react";

import { cn } from "@/lib/cn";
import { formatRupiah } from "@/lib/format";
import type { Category, Product } from "@/lib/types";

interface ProductGridProps {
  products: Product[];
  categories: Category[];
  search: string;
  onSearchChange: (value: string) => void;
  activeCategory: string;
  onCategoryChange: (value: string) => void;
  onAdd: (product: Product) => void;
}

export function ProductGrid({
  products,
  categories,
  search,
  onSearchChange,
  activeCategory,
  onCategoryChange,
  onAdd,
}: ProductGridProps) {
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter((product) => {
      const matchCategory =
        activeCategory === "all" || product.categoryId === activeCategory;
      const matchSearch =
        !query ||
        product.name.toLowerCase().includes(query) ||
        product.description?.toLowerCase().includes(query);
      return matchCategory && matchSearch;
    });
  }, [products, search, activeCategory]);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search
            size={17}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Cari menu…"
            className="h-11 w-full rounded-xl border border-line bg-surface pl-10 pr-3 text-sm text-ink outline-none transition placeholder:text-muted/70 focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </div>
        <p className="text-xs font-semibold text-muted">
          {filtered.length} menu tersedia
        </p>
      </div>

      <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-0.5">
        <button
          type="button"
          onClick={() => onCategoryChange("all")}
          className={cn(
            "focus-ring flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold transition",
            activeCategory === "all"
              ? "bg-primary text-white shadow-sm"
              : "border border-line bg-surface text-ink-soft hover:border-primary/40 hover:text-primary",
          )}
        >
          Semua
        </button>
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => onCategoryChange(category.id)}
            className={cn(
              "focus-ring flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold transition",
              activeCategory === category.id
                ? "bg-primary text-white shadow-sm"
                : "border border-line bg-surface text-ink-soft hover:border-primary/40 hover:text-primary",
            )}
          >
            <span aria-hidden>{category.emoji}</span>
            {category.name}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-milk/60 px-6 py-14 text-center">
          <PackageOpen size={28} className="text-muted" />
          <p className="text-sm font-extrabold text-ink">Menu tidak ditemukan</p>
          <p className="text-xs text-muted">
            Coba kata kunci lain atau pilih kategori berbeda.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {filtered.map((product) => (
            <button
              key={product.id}
              type="button"
              disabled={!product.available}
              onClick={() => onAdd(product)}
              className="focus-ring group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface p-2.5 text-left transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
            >
              <div className="relative flex h-20 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-cream via-milk to-cream text-4xl">
                {product.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={product.imageUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span aria-hidden>{product.emoji}</span>
                )}
                {product.popular ? (
                  <span className="absolute left-1.5 top-1.5 rounded-full bg-gold px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white">
                    Favorit
                  </span>
                ) : null}
                {!product.available ? (
                  <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-espresso/55 text-[10px] font-black uppercase tracking-widest text-white">
                    Habis
                  </span>
                ) : null}
              </div>
              <p className="mt-2 line-clamp-2 min-h-[2.1rem] text-xs font-extrabold leading-tight text-ink">
                {product.name}
              </p>
              <div className="mt-1 flex items-center justify-between gap-1">
                <span className="text-xs font-black text-primary tabular">
                  {formatRupiah(product.price)}
                </span>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-white transition group-hover:scale-110">
                  <Plus size={14} />
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
