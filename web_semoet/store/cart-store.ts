/**
 * Keranjang belanja (persist ke localStorage).
 *
 * Harga di sini hanya untuk tampilan; backend selalu menghitung ulang
 * harga dari variant + modifier saat POST /orders.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { FulfillmentType } from '@/types/api';

export interface CartModifier {
  optionId: string;
  groupId: string;
  name: string;
  priceDeltaIdr: number;
  quantity: number;
}

export interface CartItem {
  /** Kunci unik baris: produk + varian + kombinasi modifier. */
  key: string;
  productId: string;
  variantId: string;
  name: string;
  variantName: string;
  imageUrl: string | null;
  unitPriceIdr: number;
  modifiers: CartModifier[];
  quantity: number;
  specialInstructions: string | null;
}

export interface AddToCartInput {
  productId: string;
  variantId: string;
  name: string;
  variantName: string;
  imageUrl: string | null;
  unitPriceIdr: number;
  modifiers: CartModifier[];
  quantity: number;
  specialInstructions?: string | null;
}

interface CartState {
  items: CartItem[];
  branchId: string | null;
  branchName: string | null;
  fulfillmentType: FulfillmentType;
  addressId: string | null;
  promoCode: string | null;
  addItem: (input: AddToCartInput) => void;
  setQuantity: (key: string, quantity: number) => void;
  removeItem: (key: string) => void;
  clear: () => void;
  setBranch: (branchId: string | null, branchName: string | null) => void;
  setFulfillmentType: (type: FulfillmentType) => void;
  setAddressId: (addressId: string | null) => void;
  setPromoCode: (code: string | null) => void;
}

function buildKey(item: AddToCartInput): string {
  const modifierKey = item.modifiers
    .map((modifier) => modifier.optionId)
    .sort()
    .join(',');
  return `${item.productId}:${item.variantId}:${modifierKey}`;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      branchId: null,
      branchName: null,
      fulfillmentType: 'pickup',
      addressId: null,
      promoCode: null,

      addItem: (input) => {
        const key = buildKey(input);
        set((state) => {
          const existing = state.items.find((item) => item.key === key);
          if (existing) {
            return {
              items: state.items.map((item) =>
                item.key === key ? { ...item, quantity: item.quantity + input.quantity } : item,
              ),
            };
          }
          return { items: [...state.items, { ...input, key, specialInstructions: input.specialInstructions ?? null }] };
        });
      },

      setQuantity: (key, quantity) =>
        set((state) => ({
          items:
            quantity <= 0
              ? state.items.filter((item) => item.key !== key)
              : state.items.map((item) => (item.key === key ? { ...item, quantity } : item)),
        })),

      removeItem: (key) => set((state) => ({ items: state.items.filter((item) => item.key !== key) })),

      clear: () => set({ items: [], promoCode: null }),

      setBranch: (branchId, branchName) => set({ branchId, branchName }),
      setFulfillmentType: (fulfillmentType) => set({ fulfillmentType }),
      setAddressId: (addressId) => set({ addressId }),
      setPromoCode: (promoCode) => set({ promoCode }),
    }),
    {
      name: 'semoet.cart',
      storage: createJSONStorage(() => localStorage),
      // Hidrasi manual di Providers supaya HTML server & render pertama client sama.
      skipHydration: true,
      partialize: (state) => ({
        items: state.items,
        branchId: state.branchId,
        branchName: state.branchName,
        fulfillmentType: state.fulfillmentType,
        addressId: state.addressId,
        promoCode: state.promoCode,
      }),
    },
  ),
);

/** Total harga satu baris (harga varian + modifier) × jumlah. */
export function lineTotal(item: CartItem): number {
  const modifierTotal = item.modifiers.reduce(
    (sum, modifier) => sum + modifier.priceDeltaIdr * modifier.quantity,
    0,
  );
  return (item.unitPriceIdr + modifierTotal) * item.quantity;
}

/** Subtotal seluruh keranjang. */
export function cartSubtotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + lineTotal(item), 0);
}

export function cartCount(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}
