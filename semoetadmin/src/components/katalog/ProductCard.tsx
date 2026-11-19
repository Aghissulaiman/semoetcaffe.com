"use client";

import ToneBadge from "@/components/common/ToneBadge";
import { formatIdr, formatNumber } from "@/lib/format";
import { productKindLabel } from "@/lib/labels";
import type { Product } from "@/types/api";

interface ProductCardProps {
  product: Product;
  onSelect: (product: Product) => void;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
}

/** Rentang harga dasar–maks (maks bisa sama dengan dasar). */
function priceRange(product: Product): string {
  if (product.maxPriceIdr && product.maxPriceIdr !== product.basePriceIdr) {
    return `${formatIdr(product.basePriceIdr)} – ${formatIdr(product.maxPriceIdr)}`;
  }
  return formatIdr(product.basePriceIdr);
}

export default function ProductCard({ product, onSelect, onEdit, onDelete }: ProductCardProps) {
  const available = product.isAvailable !== false;

  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-coffee-linen bg-white transition-colors hover:border-coffee-brown/50 dark:border-coffee-night-border dark:bg-coffee-night-soft dark:hover:border-coffee-caramel/50">
      <button
        type="button"
        onClick={() => onSelect(product)}
        className="flex flex-1 flex-col text-start"
      >
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-coffee-milk dark:bg-white/5">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- gambar produk dari CDN eksternal
            <img
              src={product.imageUrl}
              alt={product.name}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-coffee-muted/40">
              {product.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="absolute start-2 top-2 flex flex-wrap gap-1">
            {product.isFeatured && <ToneBadge tone="coffee">Unggulan</ToneBadge>}
            {!product.isActive && <ToneBadge tone="muted">Nonaktif</ToneBadge>}
          </div>
        </div>

        <div className="flex flex-1 flex-col p-4">
          <p className="text-theme-sm font-semibold text-coffee-espresso dark:text-coffee-cream">
            {product.name}
          </p>
          <p className="text-theme-xs text-coffee-muted">
            {product.category?.name ?? "Tanpa Kategori"} · {productKindLabel(product.productKind)}
          </p>

          <p className="mt-2 text-theme-sm font-bold text-coffee-brown dark:text-coffee-caramel">
            {priceRange(product)}
          </p>

          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-theme-xs text-coffee-muted">
              {product.rating && product.rating.count > 0
                ? `★ ${product.rating.average.toFixed(1)} (${formatNumber(product.rating.count)})`
                : "Belum ada ulasan"}
            </span>
            <ToneBadge tone={available ? "success" : "danger"}>
              {available ? "Tersedia" : "Habis"}
            </ToneBadge>
          </div>
        </div>
      </button>

      <div className="flex items-center justify-end gap-2 border-t border-coffee-linen px-4 py-3 dark:border-coffee-night-border">
        <button
          type="button"
          onClick={() => onEdit(product)}
          className="rounded-lg border border-coffee-linen px-3 py-1.5 text-theme-xs font-semibold text-coffee-dark transition-colors hover:bg-coffee-milk dark:border-coffee-night-border dark:text-coffee-cream/80 dark:hover:bg-white/5"
        >
          Ubah
        </button>
        <button
          type="button"
          onClick={() => onDelete(product)}
          className="rounded-lg border border-coffee-danger/40 px-3 py-1.5 text-theme-xs font-semibold text-coffee-danger transition-colors hover:bg-coffee-danger/10"
        >
          Hapus
        </button>
      </div>
    </div>
  );
}
