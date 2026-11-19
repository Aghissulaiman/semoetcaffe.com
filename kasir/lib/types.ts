/**
 * Model data aplikasi kasir Semoet Cafe.
 *
 * Tipe di sini adalah bentuk yang nyaman dipakai UI. Data asli selalu berasal
 * dari API `semoet_service`; konversi dilakukan di `lib/store.tsx`.
 */

export interface Category {
  id: string;
  name: string;
  emoji: string;
}

export interface ModifierOption {
  id: string;
  name: string;
  priceDelta: number;
}

export interface ModifierGroup {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  isRequired: boolean;
  options: ModifierOption[];
}

export interface Product {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  price: number;
  description?: string;
  imageUrl?: string | null;
  emoji: string;
  available: boolean;
  popular?: boolean;
  variantId: string;
  variantName: string;
  modifierGroups: ModifierGroup[];
}

export interface CartModifier {
  optionId: string;
  groupName: string;
  name: string;
  priceDelta: number;
}

export interface CartItem {
  /** Unik per kombinasi produk + varian + modifier. */
  key: string;
  productId: string;
  variantId: string;
  name: string;
  variantName?: string;
  price: number;
  qty: number;
  emoji: string;
  imageUrl?: string | null;
  note?: string;
  modifiers: CartModifier[];
}

export type OrderType = "dine_in" | "pickup" | "delivery";

export type PaymentMethod =
  | "cash"
  | "qris"
  | "card"
  | "bank_transfer"
  | "ewallet"
  | "virtual_account";

export type OrderStatus =
  | "placed"
  | "accepted"
  | "preparing"
  | "ready"
  | "out_for_delivery"
  | "completed"
  | "cancelled"
  | "rejected";

export type PaymentStatus =
  | "unpaid"
  | "pending"
  | "paid"
  | "partially_refunded"
  | "refunded"
  | "failed";

export interface Order {
  id: string;
  code: string;
  createdAt: string;
  type: OrderType;
  tableId: string | null;
  tableNumber: string | null;
  customerName: string | null;
  customerPhone: string | null;
  items: CartItem[];
  subtotal: number;
  discount: number;
  tax: number;
  serviceFee: number;
  deliveryFee: number;
  total: number;
  paymentMethod: PaymentMethod | null;
  paymentStatus: PaymentStatus;
  paidAmount: number;
  change: number;
  status: OrderStatus;
  cashier: string;
  note: string | null;
  branchId: string;
  branchName: string | null;
}

export type ReservationStatus =
  | "requested"
  | "confirmed"
  | "seated"
  | "completed"
  | "cancelled"
  | "no_show";

export interface Reservation {
  id: string;
  code: string;
  createdAt: string;
  name: string;
  phone: string;
  /** Tanggal reservasi dalam format YYYY-MM-DD (waktu lokal). */
  date: string;
  /** Jam mulai dalam format HH:mm. */
  time: string;
  reservedFor: string;
  durationMinutes: number;
  guests: number;
  areaId: string | null;
  area: string;
  tableIds: string[];
  tableNumber: string | null;
  note: string | null;
  status: ReservationStatus;
  depositAmount: number;
  depositStatus: string;
  depositPaid: boolean;
  totalEstimate: number;
  roomTotal: number;
  menuTotal: number;
  branchId: string;
}

export interface Branch {
  id: string;
  code: string;
  name: string;
  address: string;
  phone: string | null;
}

export interface Area {
  id: string;
  name: string;
  areaType: string | null;
  pricePerHour: number;
}

export interface Table {
  id: string;
  code: string;
  areaId: string | null;
  areaName: string | null;
  capacity: number;
}

export interface PosConfig {
  currency: string;
  timezone: string;
  taxPercent: number;
  serviceFeeIdr: number;
  deliveryFeeIdr: number;
  orderNumberPrefix: string;
}

export interface NewReservationInput {
  name: string;
  phone: string;
  date: string;
  time: string;
  durationMinutes: number;
  guests: number;
  areaId: string | null;
  tableIds: string[];
  note?: string;
}

export interface CreateOrderInput {
  items: CartItem[];
  type: OrderType;
  tableId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  note?: string | null;
  payment?: {
    method: PaymentMethod;
    paidAmount: number;
  } | null;
}

export interface Totals {
  subtotal: number;
  discount: number;
  tax: number;
  serviceFee: number;
  deliveryFee: number;
  total: number;
}

export interface ReportRange {
  from: string;
  to: string;
}
