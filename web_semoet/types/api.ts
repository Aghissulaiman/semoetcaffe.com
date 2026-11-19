/**
 * Tipe response REST `semoet_service` (prefix /api/v1).
 * Disesuaikan dengan OpenAPI di semoet_service/src/docs/components.ts.
 */

export interface ApiMeta {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  hasNext?: boolean;
  hasPrev?: boolean;
  [key: string]: unknown;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  meta?: ApiMeta;
  requestId?: string;
  message?: string;
  details?: { field?: string; message?: string }[];
}

export interface Paginated<T> {
  items: T[];
  meta?: ApiMeta;
}

// ---------------------------------------------------------------------------
// Auth & user
// ---------------------------------------------------------------------------
export type UserStatus = 'active' | 'pending' | 'suspended' | 'deleted';

export interface User {
  id: string;
  email: string | null;
  phoneE164: string | null;
  displayName: string;
  status: UserStatus;
  emailVerifiedAt: string | null;
  phoneVerifiedAt: string | null;
  createdAt: string;
}

export interface AuthSession {
  user: User;
  accessToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
  isNewUser?: boolean;
}

export interface CustomerTier {
  id: string;
  code: string;
  name: string;
  minimumLifetimePoints: number;
  benefits?: Record<string, unknown>;
  isActive: boolean;
}

/** Profil dari GET /me — dibungkus `{ profile, loyalty }`. */
export interface MeProfile {
  userId: string;
  email: string | null;
  displayName: string | null;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  marketingOptIn: boolean;
  preferences: Record<string, unknown> | null;
}

export interface MeLoyalty {
  balance: number;
  lifetimeEarned: number;
  lifetimeRedeemed: number;
  lifetimeExpired: number;
  expiringSoon: number;
  nextExpiryAt: string | null;
}

export interface MePayload {
  profile: MeProfile;
  loyalty: MeLoyalty;
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------
export type ProductKind =
  | 'food'
  | 'drink'
  | 'coffee'
  | 'snack'
  | 'dessert'
  | 'bundle'
  | 'buffet'
  | 'event'
  | 'other'
  | 'standard';

export interface ProductImage {
  id: string;
  url: string | null;
  altText: string | null;
  sortOrder: number;
  isPrimary: boolean;
  widthPx: number | null;
  heightPx: number | null;
}

/** Diskon menu otomatis yang sedang berjalan untuk satu produk/varian. */
export interface ProductPromo {
  id: string;
  name: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  originalPriceIdr: number;
  promoPriceIdr: number;
  discountIdr: number;
}

export interface ProductVariant {
  id: string;
  sku: string | null;
  name: string;
  priceIdr: number;
  compareAtPriceIdr: number | null;
  isDefault: boolean;
  isAvailable: boolean;
  /** Harga setelah diskon menu otomatis (null bila tidak ada promo). */
  promoPriceIdr?: number | null;
  promo?: ProductPromo | null;
  /** Tersedia di detail produk; varian tertanam membawa grup modifier. */
  modifierGroups?: ModifierGroup[];
  productId?: string;
  isActive?: boolean;
  sortOrder?: number;
}

export interface ModifierOption {
  id: string;
  groupId: string;
  name: string;
  priceDeltaIdr: number;
  isActive: boolean;
}

export interface ModifierGroup {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  isRequired: boolean;
  options: ModifierOption[];
}

/** Item daftar GET /products — payload ringkas tanpa field khusus detail. */
export interface Product {
  id: string;
  slug: string;
  name: string;
  descriptionShort: string | null;
  productKind: ProductKind;
  isActive: boolean;
  isFeatured: boolean;
  basePriceIdr: number;
  maxPriceIdr: number | null;
  /** Diskon menu otomatis untuk harga termurah (null bila tidak ada). */
  promo?: ProductPromo | null;
  imageUrl: string | null;
  category: { id: string; slug: string; name: string } | null;
  rating: { average: number; count: number };
  isFavorite: boolean;
  isAvailable: boolean;
  images: ProductImage[];
  modifierGroups: ModifierGroup[];
}

/** Detail GET /products/:slug — payload datar (bukan bungkusan). */
export interface ProductDetail extends Product {
  description: string | null;
  availableFrom: string | null;
  availableUntil: string | null;
  categories: ProductCategory[];
  variants: ProductVariant[];
  allergens: string[] | null;
  nutritionInfo: Record<string, unknown> | null;
}

export interface ProductCategory {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  productCount?: number;
  children?: ProductCategory[];
}

// ---------------------------------------------------------------------------
// Home, branch, address
// ---------------------------------------------------------------------------
export interface HomeBanner {
  id: string;
  title: string | null;
  imageUrl: string | null;
  targetUrl: string | null;
  startsAt: string | null;
  endsAt: string | null;
  sortOrder: number;
  isActive: boolean;
}

export type Placement =
  | 'favorite'
  | 'new'
  | 'family_bundle'
  | 'meeting_bundle'
  | 'birthday_bundle'
  | 'buffet_bundle'
  | 'event';

export interface FeaturedPlacement {
  placement: Placement;
  label: string;
  productCount: number;
}

/** Baris ringkas produk beranda / placement (shapeHomeProduct). */
export interface HomeProduct {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  productKind: string | null;
  isFeatured: boolean;
  category: { slug: string | null; name: string | null };
  priceIdr: number | null;
  imageUrl: string | null;
  /** Hanya pada item endpoint /placements/:p/products. */
  placement?: string | null;
  sortOrder?: number;
  startsAt?: string | null;
  endsAt?: string | null;
  favoriteCount?: number;
}

/** Item GET /me/favorites — bentuk berbeda dari /products. */
export interface FavoriteProduct {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  productKind: ProductKind;
  isFeatured: boolean;
  sortOrder: number;
  favoritedAt: string;
  minPriceIdr: number | null;
  maxPriceIdr: number | null;
  imageUrl: string | null;
  categoryName: string | null;
  categorySlug: string | null;
}

export interface NearestBranch {
  id: string;
  code: string | null;
  name: string | null;
  address: string | null;
  phone: string | null;
  distanceKm: number | null;
}

export interface HomePayload {
  banners: HomeBanner[];
  placements: FeaturedPlacement[];
  categories: ProductCategory[];
  featured: Partial<Record<Placement, HomeProduct[]>>;
  nearestBranch: NearestBranch | null;
  newArrivals?: HomeProduct[];
  mostFavorited?: HomeProduct[];
  nearestBranches?: NearestBranch[];
  categoryCounts?: { categoryId: string; categoryName: string; productCount: number }[];
  momentCount?: number;
  branchId?: string | null;
}

export interface Branch {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  address: string;
  timezone: string;
  latitude: number | null;
  longitude: number | null;
  isActive: boolean;
}

/** Status buka/tutup toko untuk web pelanggan (GET /store/status). */
export interface PublicStoreStatus {
  branchId: string;
  branchName: string;
  timezone: string;
  mode: 'auto' | 'open' | 'closed';
  isOpen: boolean;
  source: 'schedule' | 'manual';
  schedule: {
    opensAt: string;
    closesAt: string;
    isConfigured: boolean;
    dayCount: number;
  };
  today: {
    dayOfWeek: number;
    opensAt: string;
    closesAt: string;
  };
  nextOpenAt: string | null;
  nextCloseAt: string | null;
  updatedAt: string | null;
}

export interface Address {
  id: string;
  label: string;
  recipientName: string;
  recipientPhone: string;
  addressLine: string;
  addressDetail: string | null;
  city: string;
  province: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  deliveryInstructions: string | null;
  isDefault: boolean;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Reservasi (meja & event)
// ---------------------------------------------------------------------------
export type ReservationStatus =
  | 'requested'
  | 'confirmed'
  | 'seated'
  | 'completed'
  | 'cancelled'
  | 'no_show';

/** Status pembayaran uang muka (DP). */
export type DepositStatus = 'unpaid' | 'pending' | 'paid' | 'refunded';

/** Satu baris riwayat perubahan status reservasi (untuk notifikasi). */
export interface ReservationHistory {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  note: string | null;
  actorName: string | null;
  createdAt: string | null;
}

export type SeatingPreference = 'indoor' | 'outdoor' | 'private_room' | 'any';

/** Area tempat duduk pada sebuah cabang (dipakai sebagai "ruangan" reservasi). */
export interface DiningArea {
  id: string;
  branchId: string;
  name: string;
  areaType: string | null;
  /** URL gambar area yang diunggah admin (bisa null bila belum diisi). */
  imageUrl: string | null;
  /** Harga sewa ruangan per jam (Rp). Dasar perhitungan total & DP. */
  pricePerHourIdr: number | null;
  isActive: boolean;
  tableCount: number;
  totalCapacity: number;
}

/** Ruangan (area) yang dipesan pada sebuah reservasi. */
export interface ReservationRoom {
  areaId: string;
  name: string;
  areaType: string | null;
  pricePerHourIdr: number | null;
  imageUrl: string | null;
}

/** Meja yang dipilih untuk sebuah reservasi (legacy). */
export interface ReservationTable {
  id: string;
  areaId: string | null;
  tableCode: string | null;
  capacity: number;
  areaName: string | null;
  areaType: string | null;
}

export interface Reservation {
  id: string;
  reservationNumber: string;
  userId: string;
  branchId: string;
  branchName: string | null;
  branchCode: string | null;
  branchAddress: string | null;
  areaId: string | null;
  areaName: string | null;
  areaType: string | null;
  /** Ruangan yang dipesan (reservasi per-ruangan). */
  rooms: ReservationRoom[];
  reservedFor: string | null;
  /** Waktu selesai (reservedFor + durationMinutes). */
  endsAt: string | null;
  durationMinutes: number;
  guestCount: number;
  seatingPreference: string | null;
  status: ReservationStatus;
  specialRequests: string | null;
  tableCodes: string[] | null;
  /** Sewa ruangan: harga per jam & total estimasi. */
  areaPricePerHourIdr: number | null;
  /** Total yang dibayar = sewa ruangan + order menu. */
  totalEstimateIdr: number | null;
  /** Pemecahan total: sewa ruangan saja. */
  roomTotalIdr: number | null;
  /** Pemecahan total: order menu (makanan/minuman). */
  menuTotalIdr: number | null;
  /** Rincian order menu yang menyertai reservasi. */
  menuItems: ReservationMenuItem[];
  /** DP1 (uang muka awal). */
  depositAmountIdr: number | null;
  depositStatus: DepositStatus;
  depositProofUrl: string | null;
  depositPaidAt: string | null;
  depositNote: string | null;
  /** DP2 (setelah konfirmasi). */
  deposit2AmountIdr: number | null;
  deposit2Status: DepositStatus;
  deposit2ProofUrl: string | null;
  deposit2PaidAt: string | null;
  deposit2Note: string | null;
  /** Pelunasan (tahap akhir). */
  settlementAmountIdr: number | null;
  settlementStatus: DepositStatus;
  settlementProofUrl: string | null;
  settlementPaidAt: string | null;
  settlementNote: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/** Satu item order menu (makanan/minuman) yang menyertai reservasi. */
export interface ReservationMenuItem {
  id: string;
  productId: string | null;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  quantity: number;
  unitPriceIdr: number | null;
  modifiersTotalIdr: number | null;
  lineTotalIdr: number | null;
  note: string | null;
}

/** Respons POST /reservations. */
export interface ReservationCreated {
  reservation: Reservation;
  rooms?: ReservationRoom[];
  tables?: ReservationTable[];
  menuItems?: ReservationMenuItem[];
  contact?: { name: string | null; email: string | null; phone: string | null } | null;
}

/** Satu slot jam yang masih bisa dipesan. */
export interface AvailabilitySlot {
  startTime: string;
  endTime: string;
  availableTableCount: number;
  /** Jumlah ruangan yang masih bebas pada slot ini. */
  freeRoomCount?: number;
  freeRoomIds?: string[];
  maxGuests: number;
}

/** Ketersediaan satu tanggal. */
export interface AvailabilityDate {
  date: string;
  dayOfWeek: number;
  isOpen: boolean;
  isAvailable: boolean;
  openingTime: string | null;
  closingTime: string | null;
  busyReservationCount: number;
  busySlotCount: number;
  maxGuests: number;
  /** Jumlah ruangan aktif cabang pada tanggal ini. */
  roomCount?: number;
  freeSlots: AvailabilitySlot[];
}

/** Respons GET /reservations/availability. */
export interface AvailabilityResponse {
  branchId: string;
  branchName: string | null;
  guestCount: number;
  durationMinutes: number;
  date: string;
  dates: AvailabilityDate[];
  availableDates: number;
}

export interface CreateReservationPayload {
  branchId: string;
  /** Ruangan (area) yang dipesan. Minimal satu. */
  roomIds: string[];
  /** Awal & akhir sewa (ISO). Durasi = selisih keduanya. */
  reservedFor: string;
  reservedUntil: string;
  guestCount: number;
  /** Kontak yang diisi pelanggan pada form reservasi (boleh beda dari akun). */
  contactName?: string | null;
  contactPhone?: string | null;
  /**
   * Order menu (makanan/minuman). Nominal TIDAK dikirim — server menghitung
   * ulang harga varian + modifier, lalu menjadikannya bagian dari total
   * (dan akhirnya DP).
   */
  menuItems?: {
    productId: string;
    variantId: string;
    quantity: number;
    modifiers?: { optionId: string; quantity: number }[];
    note?: string | null;
  }[];
  /** DP1 (opsional, bila pelanggan membayar di muka lewat form). */
  depositAmountIdr?: number | null;
  depositProofUrl?: string | null;
  depositProofStorageKey?: string | null;
  specialRequests?: string | null;
}

// ---------------------------------------------------------------------------
// Order & payment
// ---------------------------------------------------------------------------
export type FulfillmentType = 'delivery' | 'pickup' | 'dine_in';

export type OrderStatus =
  | 'placed'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'completed'
  | 'cancelled'
  | 'rejected';

export type PaymentStatus = 'unpaid' | 'pending' | 'paid' | 'partially_refunded' | 'refunded' | 'failed';

export type PaymentMethod = 'qris' | 'virtual_account' | 'bank_transfer' | 'ewallet' | 'card' | 'cash';

export interface OrderItemModifier {
  id: string;
  groupName: string;
  optionName: string;
  priceDeltaIdr: number;
  quantity: number;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string | null;
  variantId: string | null;
  productName: string;
  variantName: string;
  sku: string | null;
  quantity: number;
  unitPriceIdr: number;
  modifiersTotalIdr: number;
  lineTotalIdr: number;
  itemStatus: 'pending' | 'preparing' | 'ready' | 'cancelled';
  specialInstructions: string | null;
  imageUrl: string | null;
  modifiers: OrderItemModifier[];
}

export interface OrderSummary {
  id: string;
  orderNumber: string;
  branchId: string;
  branchName: string | null;
  fulfillmentType: FulfillmentType;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  totalIdr: number;
  itemCount: number;
  thumbnailUrl: string | null;
  placedAt: string;
}

export interface OrderDetail extends OrderSummary {
  currency: string;
  subtotalIdr: number;
  discountIdr: number;
  taxIdr: number;
  deliveryFeeIdr: number;
  serviceFeeIdr: number;
  promoId: string | null;
  voucherId: string | null;
  customerNotes: string | null;
  deliveryStatus: string | null;
  deliveryRecipientName: string | null;
  deliveryRecipientPhone: string | null;
  deliveryAddressSnapshot: Record<string, unknown> | null;
  tableId: string | null;
  pickupAt: string | null;
  acceptedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  items: OrderItem[];
}

export interface PaymentTransaction {
  id: string;
  orderId: string | null;
  provider: string;
  paymentMethod: PaymentMethod;
  transactionType: 'charge' | 'refund';
  paymentPurpose: string;
  status: 'pending' | 'succeeded' | 'failed' | 'expired' | 'cancelled';
  amountIdr: number;
  currency: string;
  providerReference: string | null;
  paymentUrl: string | null;
  expiresAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

/** Instruksi bayar dari gateway (bentuk bebas, bergantung metode). */
export interface PaymentInstructions {
  method?: string;
  channel?: string;
  reference?: string;
  amountIdr?: number;
  currency?: string;
  expiresAt?: string | null;
  paymentUrl?: string | null;
  qrString?: string | null;
  virtualAccountNumber?: string | null;
  steps?: string[];
}

export interface ChargeResult {
  payment: PaymentTransaction;
  instructions: PaymentInstructions | null;
  outstandingIdr: number | null;
  replayed?: boolean;
}

/** Hasil simulasi pembayaran lunas (endpoint demo, non-production). */
export interface SimulatePaymentResult {
  payment: PaymentTransaction;
  paymentStatus: string;
  orderStatus: string | null;
  alreadyPaid: boolean;
}

/** Hasil sinkronisasi status dari payment gateway (endpoint /payments/:id/verify). */
export interface VerifyPaymentResult {
  paymentId: string;
  status: string;
  isPaid: boolean;
  isFinal: boolean;
  amountIdr: number;
  transactionType: string;
  paymentPurpose: string;
  providerReference: string | null;
  paidAt: string | null;
  expiresAt: string | null;
  orderId: string | null;
  eventBookingId: string | null;
}

// ---------------------------------------------------------------------------
// Promo, voucher, loyalitas, review
// ---------------------------------------------------------------------------
export interface PromoCampaign {
  id: string;
  /** Tidak dikirim saat promo dibungkus voucher milik user. */
  code?: string | null;
  name: string;
  description: string | null;
  discountType: 'percentage' | 'fixed' | 'free_item';
  discountValue: number;
  minimumOrderIdr: number | null;
  maximumDiscountIdr: number | null;
  startsAt: string;
  endsAt: string;
  isActive?: boolean;
}

export interface UserVoucher {
  id: string;
  promoId: string;
  promo: PromoCampaign;
  code: string | null;
  status: 'available' | 'reserved' | 'used' | 'expired' | 'revoked';
  issuedAt: string;
  expiresAt: string | null;
  usedAt: string | null;
}

export interface LoyaltyReward {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  pointsCost: number;
  rewardType: 'voucher' | 'free_product' | 'discount';
  isActive: boolean;
}

export interface PointsSummary {
  balance: number;
  lifetimeEarned: number;
  lifetimeRedeemed: number;
  lifetimeExpired: number;
  expiringSoon: number;
  nextExpiryAt: string | null;
  tier: CustomerTier | null;
}

export interface PointHistoryEntry {
  id: string;
  pointsDelta: number;
  mutationType: 'earn' | 'redeem' | 'expire' | 'adjustment';
  description: string | null;
  referenceType: string | null;
  referenceId: string | null;
  referenceLabel?: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface LoyaltyRedemption {
  id: string;
  rewardId: string;
  reward: LoyaltyReward;
  pointsSpent: number;
  voucherId: string | null;
  status: 'pending' | 'completed' | 'cancelled';
  createdAt: string;
}

export interface Review {
  id: string;
  userId: string;
  userName: string | null;
  productId: string | null;
  orderItemId: string | null;
  productName: string | null;
  variantName: string | null;
  foodRating: number | null;
  serviceRating: number | null;
  speedRating: number | null;
  averageRating: number;
  text: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Request payload
// ---------------------------------------------------------------------------
export interface CreateOrderItem {
  productId: string;
  variantId: string;
  quantity: number;
  modifiers?: { optionId: string; quantity: number }[];
  specialInstructions?: string | null;
}

export interface CreateOrderPayload {
  branchId: string;
  fulfillmentType: FulfillmentType;
  items: CreateOrderItem[];
  promoCode?: string | null;
  voucherId?: string | null;
  addressId?: string | null;
  tableId?: string | null;
  /** Waktu pengambilan (ISO) untuk fulfillment pickup — harus masa depan. */
  pickupAt?: string | null;
  customerNotes?: string | null;
}

// ---------------------------------------------------------------------------
// Ulasan milik customer
// ---------------------------------------------------------------------------
export interface MyReview extends Review {
  moderationStatus: string | null;
  orderNumber: string | null;
  productSlug: string | null;
  orderPlacedAt: string | null;
  updatedAt: string | null;
}

export interface CreateReviewPayload {
  orderItemId: string;
  foodRating?: number;
  serviceRating?: number;
  speedRating?: number;
  reviewText?: string | null;
}

export interface UpdateReviewPayload {
  foodRating?: number;
  serviceRating?: number;
  speedRating?: number;
  reviewText?: string | null;
}

// ---------------------------------------------------------------------------
// Chat support
// ---------------------------------------------------------------------------
export type ChatStatus = 'open' | 'waiting' | 'resolved' | 'closed';
export type ChatCategory = 'general' | 'complaint';
export type ChatSenderType = 'customer' | 'staff' | 'assistant' | 'system';

export interface ChatConversation {
  id: string;
  userId: string;
  userName: string | null;
  assignedStaffId: string | null;
  assignedStaffName: string | null;
  topic: string;
  category: ChatCategory | string;
  status: ChatStatus | string;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  messageCount: number;
  createdAt: string | null;
  updatedAt: string | null;
  /** Hanya ada pada response POST /chat/conversations. */
  reused?: boolean;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderType: ChatSenderType | string;
  senderUserId: string | null;
  senderName: string | null;
  body: string;
  attachmentStorageKey: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  createdAt: string | null;
}

export interface CreateConversationPayload {
  topic: string;
  category?: ChatCategory;
  initialMessage?: string;
}
