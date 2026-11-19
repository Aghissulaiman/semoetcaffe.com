"use client";

import { ShoppingCart } from "lucide-react";

import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/cn";
import { lineTotal, type CartItem } from "@/store/cart-store";

interface CartItemRowProps {
  item: CartItem;
  /** Bila tidak diisi, stepper disembunyikan (mode read-only, mis. ringkasan checkout). */
  onQuantityChange?: (quantity: number) => void;
  className?: string;
}

/** Baris item di layar keranjang. */
export function CartItemRow({ item, onQuantityChange, className }: CartItemRowProps) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-2xl border border-line bg-surface p-3",
        className,
      )}>
      {item.imageUrl ? (
        <img
          src={item.imageUrl}
          alt={item.name}
          className="h-16 w-16 shrink-0 rounded-xl bg-primary-soft object-cover"
        />
      ) : (
        <div className="h-16 w-16 shrink-0 rounded-xl bg-primary-soft" />
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="line-clamp-2 text-sm font-bold text-ink">{item.name}</p>
        <p className="text-xs text-muted">{item.variantName}</p>
        {item.modifiers.length > 0 ? (
          <p className="line-clamp-2 text-[11px] text-muted">
            {item.modifiers
              .map((modifier) => `${modifier.name}${modifier.quantity > 1 ? ` ×${modifier.quantity}` : ""}`)
              .join(", ")}
          </p>
        ) : null}
        {item.specialInstructions ? (
          <p className="line-clamp-1 text-[11px] italic text-warning">
            “{item.specialInstructions}”
          </p>
        ) : null}

        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="text-sm font-extrabold text-primary">{formatRupiah(lineTotal(item))}</span>
          {onQuantityChange ? (
            <QuantityStepper
              size="sm"
              value={item.quantity}
              onChange={onQuantityChange}
              min={1}
            />
          ) : (
            <span className="text-[13px] text-muted">×{item.quantity}</span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Ikon keranjang dengan badge jumlah (untuk header). */
export function CartIconButton({ count, onPress }: { count: number; onPress: () => void }) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={`Keranjang, ${count} item`}
      className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary transition hover:bg-cream focus-ring">
      <ShoppingCart size={20} />
      {count > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-[1.5px] border-surface bg-danger px-1 text-[10px] font-extrabold text-white">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </button>
  );
}
