"use client";

/**
 * Keranjang — item dari cart store + pemilihan cabang & cara penerimaan.
 */
import { ArrowRight, Bike, ShoppingBag } from "lucide-react";
import { useRouter } from "next/navigation";

import { BranchPicker } from "@/components/branch-picker";
import { CartItemRow } from "@/components/cart-item-row";
import { StoreClosedAlert } from "@/components/store-closed-alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Loader } from "@/components/ui/loader";
import { ScreenHeading } from "@/components/ui/screen-heading";
import { cn } from "@/lib/cn";
import { formatRupiah } from "@/lib/format";
import { useCartHydrated } from "@/lib/use-cart-hydrated";
import { useAuthStore } from "@/store/auth-store";
import { cartSubtotal, useCartStore } from "@/store/cart-store";
import { useStoreClosed } from "@/store/store-status-store";

import type { FulfillmentType } from "@/types/api";

const FULFILLMENTS: { value: FulfillmentType; label: string; icon: typeof ShoppingBag }[] = [
  { value: "pickup", label: "Ambil sendiri", icon: ShoppingBag },
  { value: "delivery", label: "Antar ke alamat", icon: Bike },
];

export default function CartPage() {
  const router = useRouter();
  const hydrated = useCartHydrated();
  const isAuthenticated = useAuthStore((state) => state.status === "authenticated");
  const storeClosed = useStoreClosed();

  const items = useCartStore((state) => state.items);
  const branchName = useCartStore((state) => state.branchName);
  const fulfillmentType = useCartStore((state) => state.fulfillmentType);
  const setQuantity = useCartStore((state) => state.setQuantity);
  const setFulfillmentType = useCartStore((state) => state.setFulfillmentType);

  const subtotal = cartSubtotal(items);

  const goCheckout = () => {
    if (storeClosed) return;
    if (!isAuthenticated) {
      router.push("/auth/login");
      return;
    }
    router.push("/checkout");
  };

  if (!hydrated) return <Loader label="Memuat keranjang…" />;

  if (items.length === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-4">
        <ScreenHeading title="Keranjang" onBack={() => router.back()} className="mb-4" />
        <div className="flex flex-col gap-4">
          <StoreClosedAlert />
          <Card>
            <BranchPicker />
          </Card>
          <EmptyState
            icon={ShoppingBag}
            title="Keranjangmu kosong"
            description="Pilih minuman atau makanan favoritmu di menu."
            actionLabel="Buka Menu"
            onAction={() => router.push("/menu")}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-3xl flex-col px-4 py-4">
      <div className="flex flex-col gap-4 pb-4">
        <ScreenHeading
          title="Keranjang"
          subtitle={`${items.length} jenis item`}
          onBack={() => router.back()}
        />

        <StoreClosedAlert />

        {/* Daftar item */}
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <CartItemRow
              key={item.key}
              item={item}
              onQuantityChange={(value) => setQuantity(item.key, value)}
            />
          ))}
        </div>

        {/* Cabang tujuan */}
        <Card>
          <BranchPicker />
        </Card>

        {/* Cara penerimaan */}
        <Card>
          <div className="flex items-center gap-2">
            <Bike size={16} className="text-primary" />
            <p className="text-[13px] font-extrabold text-ink">Cara penerimaan</p>
          </div>
          <div className="mt-2.5 flex gap-2.5">
            {FULFILLMENTS.map((fulfillment) => {
              const active = fulfillment.value === fulfillmentType;
              return (
                <button
                  key={fulfillment.value}
                  type="button"
                  onClick={() => setFulfillmentType(fulfillment.value)}
                  aria-pressed={active}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-[14px] border px-2 py-3 text-xs font-bold transition focus-ring",
                    active
                      ? "border-primary bg-primary-soft text-primary"
                      : "border-line bg-surface text-muted hover:border-primary/40",
                  )}>
                  <fulfillment.icon size={18} />
                  <span className="truncate">{fulfillment.label}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2.5 text-xs text-muted">
            {fulfillmentType === "delivery"
              ? "Pilih alamat tujuan di langkah checkout."
              : `Ambil pesananmu di ${branchName ?? "cabang terpilih"}.`}
          </p>
        </Card>
      </div>

      {/* Bar total & lanjut */}
      <div className="sticky bottom-0 z-20 mt-auto border-t border-line bg-surface/98 py-3 backdrop-blur">
        <div className="flex items-center gap-3.5">
          <div className="shrink-0">
            <p className="text-xs text-muted">Subtotal</p>
            <p className="text-lg font-black text-primary">{formatRupiah(subtotal)}</p>
          </div>
          <Button
            title={storeClosed ? "Toko sedang tutup" : "Lanjut ke checkout"}
            icon={ArrowRight}
            onClick={goCheckout}
            disabled={storeClosed}
            size="lg"
            className="flex-1"
          />
        </div>
      </div>
    </div>
  );
}
