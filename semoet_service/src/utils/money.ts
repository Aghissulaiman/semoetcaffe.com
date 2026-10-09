import { env } from '../config/env.js';
import type { DiscountType } from '../config/constants.js';

export interface OrderTotalsInput {
  subtotalIdr: number;
  discountIdr: number;
  deliveryFeeIdr?: number;
  serviceFeeIdr?: number;
  taxPercent?: number;
}

export interface OrderTotals {
  subtotalIdr: number;
  discountIdr: number;
  taxIdr: number;
  deliveryFeeIdr: number;
  serviceFeeIdr: number;
  totalIdr: number;
}

export function roundIdr(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
}

/**
 * Menghitung total order sesuai CHECK constraint:
 * total_idr = subtotal_idr - discount_idr + tax_idr + delivery_fee_idr + service_fee_idr
 * Tax dibulatkan ke rupiah penuh.
 */
export function calculateOrderTotals(input: OrderTotalsInput): OrderTotals {
  const subtotal = Math.max(0, roundIdr(input.subtotalIdr));
  const discount = Math.min(subtotal, Math.max(0, roundIdr(input.discountIdr)));
  const deliveryFee = Math.max(0, roundIdr(input.deliveryFeeIdr ?? 0));
  const serviceFee = Math.max(0, roundIdr(input.serviceFeeIdr ?? 0));
  const taxPercent = input.taxPercent ?? env.TAX_PERCENT;
  const tax = roundIdr(((subtotal - discount) * taxPercent) / 100);

  const total = subtotal - discount + tax + deliveryFee + serviceFee;

  return {
    subtotalIdr: subtotal,
    discountIdr: discount,
    taxIdr: tax,
    deliveryFeeIdr: deliveryFee,
    serviceFeeIdr: serviceFee,
    totalIdr: Math.max(0, roundIdr(total)),
  };
}

/** Harga satu item termasuk modifier: (unit_price + modifiers_total) * quantity */
export function calculateLineTotal(
  unitPriceIdr: number,
  modifiersTotalIdr: number,
  quantity: number,
): { unitPriceIdr: number; modifiersTotalIdr: number; lineTotalIdr: number } {
  const unit = Math.max(0, roundIdr(unitPriceIdr));
  const modifiers = Math.max(0, roundIdr(modifiersTotalIdr));
  const qty = Math.max(1, Math.trunc(quantity));

  return {
    unitPriceIdr: unit,
    modifiersTotalIdr: modifiers,
    lineTotalIdr: roundIdr(qty * (unit + modifiers)),
  };
}

export interface DiscountContext {
  discountType: DiscountType;
  discountValue: number;
  subtotalIdr: number;
  maximumDiscountIdr?: number | null;
}

/**
 * Menghitung nominal diskon (IDR) dari sebuah promo.
 * - percentage: diskon = subtotal * value/100 (dibatasi maximum_discount_idr)
 * - fixed:      diskon = value (dibatasi maximum_discount_idr)
 * - free_item: handled terpisah oleh service (produk gratis), default 0 di sini
 * Diskon tidak boleh melebihi subtotal.
 */
export function calculateDiscountAmount(context: DiscountContext): number {
  const subtotal = Math.max(0, roundIdr(context.subtotalIdr));
  let discount = 0;

  if (context.discountType === 'percentage') {
    const percent = Math.min(100, Math.max(0, context.discountValue));
    discount = roundIdr((subtotal * percent) / 100);
  } else if (context.discountType === 'fixed') {
    discount = roundIdr(context.discountValue);
  } else {
    discount = 0;
  }

  const max = context.maximumDiscountIdr;
  if (max !== null && max !== undefined) discount = Math.min(discount, roundIdr(max));

  return Math.min(subtotal, Math.max(0, discount));
}

export function formatIdr(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value);
}

/** Poin yang diperoleh dari total belanja: 1 poin per Rp POINTS_EARN_DIVISOR. */
export function pointsEarnedFromAmount(totalIdr: number): number {
  if (totalIdr <= 0) return 0;
  return Math.floor(totalIdr / env.POINTS_EARN_DIVISOR);
}

/** Nilai rupiah dari 1 poin (untuk konversi di UI admin). */
export function idrValueOfPoint(points: number): number {
  return Math.max(0, Math.trunc(points)) * env.POINTS_EARN_DIVISOR;
}