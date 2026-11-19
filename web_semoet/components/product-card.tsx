"use client";

import { Heart } from "lucide-react";
import { useRouter } from "next/navigation";

import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/cn";

import type { FavoriteProduct, HomeProduct, Product } from "@/types/api";

/** Bentuk yang diterima kartu: item /products, baris beranda, atau item favorit. */
export type CardProduct = Product | HomeProduct | FavoriteProduct;

interface ProductCardProps {
  product: CardProduct;
  /** Lebar kartu untuk tampilan horizontal; `full` mengikuti grid induk. */
  width?: number | "full";
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  /** Ganti aksi ketuk kartu (default: buka detail produk biasa). */
  onPressOverride?: () => void;
  /** Sembunyikan harga promo untuk konteks reservasi. */
  showPromo?: boolean;
  className?: string;
}

/** Gambar utama: dari array images (bila ada) atau imageUrl baris ringkas. */
function primaryImage(product: CardProduct): string | null {
  if ("images" in product && Array.isArray(product.images) && product.images.length > 0) {
    const sorted = [...product.images].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
    return sorted[0]?.url ?? null;
  }
  return "imageUrl" in product ? product.imageUrl ?? null : null;
}

/** Harga tampil: basePriceIdr (/products), minPriceIdr (favorit), priceIdr (beranda). */
function displayPrice(product: CardProduct): number | null {
  if ("basePriceIdr" in product && typeof product.basePriceIdr === "number") return product.basePriceIdr;
  if ("minPriceIdr" in product && typeof product.minPriceIdr === "number") return product.minPriceIdr;
  if ("priceIdr" in product && typeof product.priceIdr === "number") return product.priceIdr;
  return null;
}

/** Hanya produk dari /products yang membawa info diskon menu otomatis. */
function productPromo(product: CardProduct) {
  return "promo" in product ? product.promo ?? null : null;
}

/** Kartu produk: gambar, nama, harga mulai, tombol favorit. */
export function ProductCard({
  product,
  width = "full",
  isFavorite,
  onToggleFavorite,
  onPressOverride,
  showPromo = true,
  className,
}: ProductCardProps) {
  const router = useRouter();
  const imageUrl = primaryImage(product);
  const promo = showPromo ? productPromo(product) : null;
  const price = promo ? promo.promoPriceIdr : displayPrice(product);
  const favorite =
    isFavorite ?? ("isFavorite" in product ? Boolean(product.isFavorite) : false);

  const openDetail =
    onPressOverride ??
    (() => router.push(`/product/${encodeURIComponent(product.slug)}`));

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openDetail}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openDetail();
        }
      }}
      className={cn(
        "group cursor-pointer overflow-hidden rounded-[18px] border border-line bg-surface text-left shadow-[0_4px_10px_rgba(42,26,17,0.07)] transition hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(42,26,17,0.10)] focus-ring",
        className,
      )}
      style={width === "full" ? undefined : { width }}>
      <div className="relative">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={product.name}
            loading="lazy"
            className="aspect-[4/3] w-full bg-primary-soft object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="aspect-[4/3] w-full bg-primary-soft" />
        )}

        {promo ? (
          <span className="absolute left-2 top-2 rounded-full bg-danger px-2 py-[3px] text-[10px] font-extrabold text-white">
            Promo
          </span>
        ) : product.isFeatured ? (
          <span className="absolute left-2 top-2 rounded-full bg-gold px-2 py-[3px] text-[10px] font-extrabold text-espresso">
            Favorit
          </span>
        ) : null}

        {onToggleFavorite ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleFavorite();
            }}
            aria-label={favorite ? "Hapus dari favorit" : "Tambah ke favorit"}
            className="absolute right-2 top-2 flex h-[30px] w-[30px] items-center justify-center rounded-full bg-surface shadow-sm transition hover:scale-105 focus-ring">
            <Heart
              size={16}
              className={favorite ? "text-danger" : "text-muted"}
              fill={favorite ? "currentColor" : "none"}
            />
          </button>
        ) : null}
      </div>

      <div className="flex flex-col gap-1 p-2.5">
        <h3 className="line-clamp-2 min-h-[34px] text-[13px] font-bold leading-[17px] text-ink">
          {product.name}
        </h3>
        {price === null ? null : promo ? (
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-extrabold text-danger">{formatRupiah(price)}</span>
            <span className="text-[11px] text-muted line-through">
              {formatRupiah(promo.originalPriceIdr)}
            </span>
          </div>
        ) : (
          <span className="text-[13px] font-extrabold text-primary">{formatRupiah(price)}</span>
        )}
      </div>
    </div>
  );
}
