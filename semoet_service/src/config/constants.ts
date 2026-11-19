/**
 * Konstanta yang mencerminkan CHECK constraint di schema PostgreSQL.
 * Dipakai sebagai sumber kebenaran tunggal untuk validasi di layer aplikasi.
 */

export type Union<T extends readonly string[]> = T[number];

// --------------------------------------------------------------------------
// Identity & access
// --------------------------------------------------------------------------
export const USER_STATUS = ['active', 'pending', 'suspended', 'deleted'] as const;
export type UserStatus = Union<typeof USER_STATUS>;

export const OTP_PURPOSE = ['login', 'signup', 'verify_phone', 'password_reset'] as const;
export type OtpPurpose = Union<typeof OTP_PURPOSE>;

export const OAUTH_PROVIDER = ['google', 'apple'] as const;
export type OAuthProvider = Union<typeof OAUTH_PROVIDER>;

export const ROLE_CODE = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  BRANCH_MANAGER: 'branch_manager',
  STAFF: 'staff',
  CUSTOMER: 'customer',
} as const;
export type RoleCode = (typeof ROLE_CODE)[keyof typeof ROLE_CODE];

export const RESOURCES = {
  AUTH: 'auth',
  USER: 'user',
  BRANCH: 'branch',
  MENU: 'menu',
  ORDER: 'order',
  PAYMENT: 'payment',
  DELIVERY: 'delivery',
  PROMO: 'promo',
  LOYALTY: 'loyalty',
  REVIEW: 'review',
  RESERVATION: 'reservation',
  EVENT: 'event',
  INVENTORY: 'inventory',
  PURCHASE: 'purchase',
  MOMENT: 'moment',
  CHAT: 'chat',
  GAMIFICATION: 'gamification',
  AI: 'ai',
  AUDIT: 'audit',
  EXPENSE: 'expense',
} as const;

export const ACTIONS = {
  CREATE: 'create',
  READ: 'read',
  UPDATE: 'update',
  DELETE: 'delete',
  MANAGE: 'manage',
} as const;

// --------------------------------------------------------------------------
// Pengeluaran operasional
// --------------------------------------------------------------------------
/** Kategori pengeluaran yang dihitung admin. */
export const EXPENSE_CATEGORIES = [
  { code: 'bahan_baku', label: 'Bahan Baku' },
  { code: 'alat_alat_masak', label: 'Alat & Peralatan' },
  { code: 'kemasan', label: 'Kemasan' },
  { code: 'utilitas', label: 'Utilitas' },
  { code: 'sewa', label: 'Sewa' },
  { code: 'gaji', label: 'Gaji' },
  { code: 'pemasaran', label: 'Pemasaran' },
  { code: 'transportasi', label: 'Transportasi' },
  { code: 'lainnya', label: 'Lainnya' },
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]['code'];

// --------------------------------------------------------------------------
// Orders & payment
// --------------------------------------------------------------------------
export const FULFILLMENT_TYPE = ['delivery', 'pickup', 'dine_in'] as const;
export type FulfillmentType = Union<typeof FULFILLMENT_TYPE>;

export const ORDER_STATUS = [
  'placed',
  'accepted',
  'preparing',
  'ready',
  'out_for_delivery',
  'completed',
  'cancelled',
  'rejected',
] as const;
export type OrderStatus = Union<typeof ORDER_STATUS>;

/** Status yang masih boleh dibatalkan oleh customer. */
export const ORDER_CANCELLABLE_STATUS: OrderStatus[] = ['placed', 'accepted', 'preparing'];

export const ORDER_STATUS_FLOW: Record<OrderStatus, OrderStatus[]> = {
  placed: ['accepted', 'preparing', 'ready', 'cancelled', 'rejected'],
  accepted: ['preparing', 'ready', 'cancelled', 'rejected'],
  preparing: ['ready', 'out_for_delivery', 'completed', 'cancelled'],
  ready: ['out_for_delivery', 'completed', 'cancelled'],
  out_for_delivery: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  rejected: [],
};

export const ITEM_STATUS = ['pending', 'preparing', 'ready', 'cancelled'] as const;
export type ItemStatus = Union<typeof ITEM_STATUS>;

export const PAYMENT_STATUS = [
  'unpaid',
  'pending',
  'paid',
  'partially_refunded',
  'refunded',
  'failed',
] as const;
export type PaymentStatus = Union<typeof PAYMENT_STATUS>;

export const PAYMENT_METHOD = [
  'qris',
  'virtual_account',
  'bank_transfer',
  'ewallet',
  'card',
  'cash',
] as const;
export type PaymentMethod = Union<typeof PAYMENT_METHOD>;

export const PAYMENT_PURPOSE = [
  'order',
  'event_deposit',
  'event_installment',
  'event_final',
  'event_refund',
  'reservation_deposit',
] as const;
export type PaymentPurpose = Union<typeof PAYMENT_PURPOSE>;

export const TRANSACTION_TYPE = ['charge', 'refund'] as const;
export type TransactionType = Union<typeof TRANSACTION_TYPE>;

export const PAYMENT_TRANSACTION_STATUS = [
  'pending',
  'succeeded',
  'failed',
  'expired',
  'cancelled',
] as const;
export type PaymentTransactionStatus = Union<typeof PAYMENT_TRANSACTION_STATUS>;

export const DELIVERY_STATUS = [
  'awaiting_assignment',
  'assigned',
  'picked_up',
  'in_transit',
  'delivered',
  'failed',
  'cancelled',
] as const;
export type DeliveryStatus = Union<typeof DELIVERY_STATUS>;

// --------------------------------------------------------------------------
// Promo & loyalty
// --------------------------------------------------------------------------
export const DISCOUNT_TYPE = ['percentage', 'fixed', 'free_item'] as const;
export type DiscountType = Union<typeof DISCOUNT_TYPE>;

export const VOUCHER_STATUS = ['available', 'reserved', 'used', 'expired', 'revoked'] as const;
export type VoucherStatus = Union<typeof VOUCHER_STATUS>;

export const POINT_MUTATION_TYPE = ['earn', 'redeem', 'expire', 'adjustment'] as const;
export type PointMutationType = Union<typeof POINT_MUTATION_TYPE>;

export const LOYALTY_REWARD_TYPE = ['voucher', 'free_product', 'discount'] as const;
export type LoyaltyRewardType = Union<typeof LOYALTY_REWARD_TYPE>;

export const LOYALTY_REDEMPTION_STATUS = ['pending', 'completed', 'cancelled'] as const;

// --------------------------------------------------------------------------
// Reservation & event
// --------------------------------------------------------------------------
export const RESERVATION_STATUS = [
  'requested',
  'confirmed',
  'seated',
  'completed',
  'cancelled',
  'no_show',
] as const;
export type ReservationStatus = Union<typeof RESERVATION_STATUS>;

export const SEATING_PREFERENCE = ['indoor', 'outdoor', 'private_room', 'any'] as const;
export type SeatingPreference = Union<typeof SEATING_PREFERENCE>;

export const EVENT_TYPE = [
  'birthday',
  'arisan',
  'meeting',
  'gathering',
  'engagement',
  'wedding',
  'seminar',
  'reunion',
  'bukber',
  'family_gathering',
  'other',
] as const;
export type EventType = Union<typeof EVENT_TYPE>;

export const EVENT_BOOKING_STATUS = [
  'requested',
  'quoted',
  'awaiting_deposit',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
] as const;
export type EventBookingStatus = Union<typeof EVENT_BOOKING_STATUS>;

export const EVENT_BOOKING_CANCELLABLE: EventBookingStatus[] = [
  'requested',
  'quoted',
  'awaiting_deposit',
];

// --------------------------------------------------------------------------
// Inventory
// --------------------------------------------------------------------------
export const MOVEMENT_TYPE = [
  'purchase',
  'order_consumption',
  'waste',
  'adjustment',
  'transfer_in',
  'transfer_out',
] as const;
export type MovementType = Union<typeof MOVEMENT_TYPE>;

// --------------------------------------------------------------------------
// Purchasing (supplier, purchase order, penerimaan, hutang)
// --------------------------------------------------------------------------
export const PURCHASE_ORDER_STATUS = [
  'draft',
  'ordered',
  'partial',
  'received',
  'cancelled',
] as const;
export type PurchaseOrderStatus = Union<typeof PURCHASE_ORDER_STATUS>;

export const PURCHASE_PAYMENT_STATUS = ['unpaid', 'partial', 'paid'] as const;
export type PurchasePaymentStatus = Union<typeof PURCHASE_PAYMENT_STATUS>;

export const GOODS_RECEIPT_STATUS = ['draft', 'posted', 'cancelled'] as const;
export type GoodsReceiptStatus = Union<typeof GOODS_RECEIPT_STATUS>;

export const SUPPLIER_PAYMENT_METHOD = ['transfer', 'cash', 'qris', 'other'] as const;
export type SupplierPaymentMethod = Union<typeof SUPPLIER_PAYMENT_METHOD>;

// --------------------------------------------------------------------------
// Community, chat, gamification, AI
// --------------------------------------------------------------------------
export const MOMENT_MODERATION_STATUS = ['pending', 'approved', 'rejected', 'hidden'] as const;
export type MomentModerationStatus = Union<typeof MOMENT_MODERATION_STATUS>;

export const REVIEW_MODERATION_STATUS = ['visible', 'hidden', 'flagged'] as const;

export const NOTIFICATION_CHANNEL = ['in_app', 'push', 'email', 'sms'] as const;
export type NotificationChannel = Union<typeof NOTIFICATION_CHANNEL>;

export const NOTIFICATION_STATUS = ['queued', 'sent', 'failed', 'read'] as const;
export type NotificationStatus = Union<typeof NOTIFICATION_STATUS>;

export const DEVICE_PROVIDER = ['fcm', 'apns', 'web_push'] as const;
export type DeviceProvider = Union<typeof DEVICE_PROVIDER>;

export const CHAT_STATUS = ['open', 'waiting', 'resolved', 'closed'] as const;
export type ChatStatus = Union<typeof CHAT_STATUS>;

/** Kategori percakapan: keluhan (complaint) atau chat biasa (general). */
export const CHAT_CATEGORY = ['general', 'complaint'] as const;
export type ChatCategory = Union<typeof CHAT_CATEGORY>;

export const CHAT_SENDER_TYPE = ['customer', 'staff', 'assistant', 'system'] as const;
export type ChatSenderType = Union<typeof CHAT_SENDER_TYPE>;

export const ACTIVITY_TYPE = ['daily_checkin', 'spin_wheel', 'challenge', 'other'] as const;
export type ActivityType = Union<typeof ACTIVITY_TYPE>;

export const GAMIFICATION_REWARD_TYPE = ['points', 'voucher', 'free_product', 'none'] as const;
export type GamificationRewardType = Union<typeof GAMIFICATION_REWARD_TYPE>;

export const AI_PURPOSE = ['customer_support', 'admin_assistant'] as const;
export type AiPurpose = Union<typeof AI_PURPOSE>;

export const AI_MESSAGE_ROLE = ['user', 'assistant', 'tool'] as const;
export type AiMessageRole = Union<typeof AI_MESSAGE_ROLE>;

export const AI_OUTCOME = ['success', 'error', 'blocked'] as const;
export type AiOutcome = Union<typeof AI_OUTCOME>;

// --------------------------------------------------------------------------
// Catalog
// --------------------------------------------------------------------------
export const PRODUCT_KIND = [
  'food',
  'drink',
  'coffee',
  'snack',
  'dessert',
  'bundle',
  'buffet',
  'event',
  'other',
  'standard',
] as const;
export type ProductKind = Union<typeof PRODUCT_KIND>;

export const FEATURED_PLACEMENT = [
  'favorite',
  'new',
  'family_bundle',
  'meeting_bundle',
  'birthday_bundle',
  'buffet_bundle',
  'event',
] as const;
export type FeaturedPlacement = Union<typeof FEATURED_PLACEMENT>;

export const AREA_TYPE = ['indoor', 'outdoor', 'private_room', 'other'] as const;

export const SERVICE_TYPE = ['all', 'dine_in', 'pickup', 'delivery'] as const;
export type ServiceType = Union<typeof SERVICE_TYPE>;

export const MEDIA_TYPE = ['image', 'video'] as const;