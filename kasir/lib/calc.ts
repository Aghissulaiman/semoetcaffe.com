import type { CartItem, OrderType, PosConfig, Totals } from "./types";

export const DEFAULT_POS_CONFIG: PosConfig = {
  currency: "IDR",
  timezone: "Asia/Jakarta",
  taxPercent: 0,
  serviceFeeIdr: 0,
  deliveryFeeIdr: 0,
  orderNumberPrefix: "SMO",
};

export function cartSubtotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.price * item.qty, 0);
}

export function cartCount(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.qty, 0);
}

/**
 * Hitung subtotal, diskon, pajak, biaya layanan, dan total.
 * Rumus mengikuti `calculateOrderTotals` di backend: pajak dihitung dari
 * (subtotal - diskon), biaya layanan tidak dikenai pajak.
 */
export function computeTotals(
  items: CartItem[],
  discount = 0,
  config: PosConfig = DEFAULT_POS_CONFIG,
  orderType: OrderType = "dine_in",
): Totals {
  const subtotal = cartSubtotal(items);
  const safeDiscount = Math.min(
    Math.max(0, Math.round(discount || 0)),
    subtotal,
  );
  const taxable = subtotal - safeDiscount;
  const tax = Math.round((taxable * config.taxPercent) / 100);
  const serviceFee = orderType === "dine_in" ? config.serviceFeeIdr : 0;
  const deliveryFee = orderType === "delivery" ? config.deliveryFeeIdr : 0;

  return {
    subtotal,
    discount: safeDiscount,
    tax,
    serviceFee,
    deliveryFee,
    total: Math.max(0, taxable + tax + serviceFee + deliveryFee),
  };
}
