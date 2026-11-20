/**
 * Tipe-tipe domain Semoet Admin.
 * Bentuk field mengikuti respons asli `semoet_service` (sudah camelCase).
 */

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  [key: string]: unknown;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  meta?: PaginationMeta;
  error?: { code: string; message: string; details?: unknown };
  requestId?: string;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export interface SessionUser {
  id: string;
  email: string | null;
  phoneE164: string | null;
  displayName: string;
  status: string;
  emailVerifiedAt: string | null;
  phoneVerifiedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface RoleRef {
  code: string;
  name: string;
}

export interface AuthMe {
  user: SessionUser;
  roles: RoleRef[];
  permissions: string[];
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
export interface OrdersByStatus {
  orderStatus: string;
  count: number;
}

export interface DashboardOverview {
  orders: {
    activeOrders: number;
    pendingOrders: number;
    todayOrders: number;
    todayRevenueIdr: number;
    byStatus: OrdersByStatus[];
  };
  reservations: { activeReservations: number };
  events: { pendingEventBookings: number };
  users: { newUsersToday: number };
  inventory: { lowStockIngredients: number };
  support: { unassignedConversations: number };
  moderation: { pendingMoments: number };
}

export interface SalesSummary {
  from: string | null;
  to: string | null;
  totalOrders: number;
  paidSalesIdr: number;
  averageOrderIdr: number;
  activeDays: number;
  cancelledOrderCount: number;
  ordersByStatus: OrdersByStatus[];
}

export interface DailySales {
  businessDate: string;
  orderCount: number;
  paidSalesIdr: number;
}

export interface TopProduct {
  productId: string;
  productName: string;
  totalQuantity: number;
  totalRevenueIdr: number;
}

// ---------------------------------------------------------------------------
// Laporan penjualan
// ---------------------------------------------------------------------------
export interface ReportSales {
  from: string | null;
  to: string | null;
  grossSalesIdr: number;
  discountIdr: number;
  netSalesIdr: number;
  taxIdr: number;
  serviceFeeIdr: number;
  deliveryFeeIdr: number;
  totalBilledIdr: number;
  cogsIdr: number;
  profitIdr: number;
  itemsSold: number;
  itemRevenueIdr: number;
  orderCount: number;
  productCount: number;
}

export interface ReportProduct {
  productId: string;
  productName: string;
  quantity: number;
  orderCount: number;
  revenueIdr: number;
  cogsIdr: number;
  profitIdr: number;
}

/** Deret harian laporan (kotor, diskon, bersih, modal, laba, qty). */
export interface ReportDaily {
  businessDate: string;
  orderCount: number;
  grossIdr: number;
  discountIdr: number;
  netIdr: number;
  itemsSold: number;
  cogsIdr: number;
  profitIdr: number;
}

/** Satu baris sebaran (metode pesanan/pembayaran, jam, hari). */
export interface BreakdownItem {
  key: string;
  orderCount: number;
  revenueIdr: number;
}

export interface ReportStatusItem {
  orderStatus: string;
  count: number;
}

/** Sebaran penjualan untuk halaman Penjualan. */
export interface ReportBreakdown {
  fulfillment: BreakdownItem[];
  payment: BreakdownItem[];
  hourly: BreakdownItem[];
  weekday: BreakdownItem[];
  status: ReportStatusItem[];
}

/** Rekap penjualan per kategori produk. */
export interface CategorySales {
  categoryId: string;
  categoryName: string;
  quantity: number;
  orderCount: number;
  revenueIdr: number;
  cogsIdr: number;
  profitIdr: number;
}

// ---------------------------------------------------------------------------
// Branch
// ---------------------------------------------------------------------------
export interface Branch {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  address: string | null;
  timezone: string | null;
  latitude: number | null;
  longitude: number | null;
  isActive: boolean;
  distanceKm?: number | null;
}

// ---------------------------------------------------------------------------
// Users, Role, Audit
// ---------------------------------------------------------------------------
export interface AdminUser {
  id: string;
  email: string | null;
  phoneE164: string | null;
  displayName: string;
  status: string;
  emailVerifiedAt: string | null;
  phoneVerifiedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  roleCodes: string[];
  orderCount: number;
  lifetimeValueIdr: number;
}

export interface Role {
  id: string;
  code: string;
  name: string;
  description: string | null;
  permissionCount: number;
  userCount: number;
  createdAt: string;
  /** Daftar key izin (hanya dari GET /admin/roles/:id). */
  permissions?: string[];
  /** Role bawaan sistem yang tidak boleh dihapus. */
  isSystem?: boolean;
}

export interface Permission {
  id: string;
  resource: string;
  action: string;
  key: string;
  roleCount: number;
}

export interface AuditLog {
  id: string;
  actorUserId: string | null;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  oldData: unknown;
  newData: unknown;
  requestId: string | null;
  ipAddress: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Inventori
// ---------------------------------------------------------------------------
export interface Ingredient {
  id: string;
  sku: string;
  name: string;
  baseUnit: string;
  reorderLevel: number;
  isActive: boolean;
  supplierId: string | null;
  supplierName?: string | null;
  supplierContact: string | null;
  purchaseLink: string | null;
  lastPurchasePriceIdr: number;
  lastPurchaseQty: number;
  lastPurchaseUom: string | null;
  lastYieldAmount: number;
  lastUnitCostIdr: number;
  onHand: number | null;
  lastMovementAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StockLocation {
  id: string;
  name: string;
  movementCount: number;
}

export interface StockMovement {
  id: string;
  stockLocationId: string;
  stockLocationName: string | null;
  ingredientId: string;
  ingredientSku: string | null;
  ingredientName: string | null;
  baseUnit: string | null;
  quantityDelta: number;
  movementType: string;
  referenceType: string | null;
  referenceId: string | null;
  notes: string | null;
  movementDate: string | null;
  createdByName: string | null;
  balanceAfter: number;
  createdAt: string;
}

export interface StockSnapshotLocation {
  stockLocationId: string;
  stockLocationName: string;
  onHand: number;
}

export interface StockSnapshotItem {
  ingredientId: string;
  sku: string;
  name: string;
  baseUnit: string;
  reorderLevel: number;
  isActive: boolean;
  onHand: number;
  lowStock: boolean;
  lastMovementAt: string | null;
  byLocation: StockSnapshotLocation[];
}

export interface StockSnapshot {
  stockLocationId: string | null;
  locations: StockLocation[];
  summary: {
    ingredientCount: number;
    locationCount: number;
    lowStockCount: number;
  };
  items: StockSnapshotItem[];
}

// ---------------------------------------------------------------------------
// Stok keluar (transfer gudang → outlet)
// ---------------------------------------------------------------------------
export interface StockOutItem {
  id: string;
  stockOutId: string;
  ingredientId: string;
  ingredientSku: string | null;
  ingredientName: string | null;
  baseUnit: string | null;
  quantity: number;
  notes: string | null;
  sortOrder: number;
  createdAt: string | null;
}

export interface StockOutDocument {
  id: string;
  number: string;
  fromStockLocationId: string;
  fromLocationName: string | null;
  toStockLocationId: string;
  toLocationName: string | null;
  status: string;
  transferDate: string | null;
  notes: string | null;
  cancelReason: string | null;
  postedAt: string | null;
  postedById: string | null;
  postedByName: string | null;
  createdById: string | null;
  createdByName: string | null;
  itemCount: number;
  totalQuantity: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface StockOutDetail {
  document: StockOutDocument;
  items: StockOutItem[];
}

// ---------------------------------------------------------------------------
// Stok opname
// ---------------------------------------------------------------------------
export interface StockOpnameItem {
  id: string;
  stockOpnameId: string;
  ingredientId: string;
  ingredientSku: string | null;
  ingredientName: string | null;
  baseUnit: string | null;
  systemQuantity: number;
  countedQuantity: number;
  differenceQuantity: number;
  notes: string | null;
  sortOrder: number;
  createdAt: string | null;
}

export interface StockOpnameDocument {
  id: string;
  number: string;
  stockLocationId: string;
  stockLocationName: string | null;
  status: string;
  opnameDate: string | null;
  notes: string | null;
  cancelReason: string | null;
  postedAt: string | null;
  postedById: string | null;
  postedByName: string | null;
  createdById: string | null;
  createdByName: string | null;
  itemCount: number;
  surplusCount: number;
  defectCount: number;
  totalDifference: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface StockOpnameDetail {
  document: StockOpnameDocument;
  items: StockOpnameItem[];
}

// ---------------------------------------------------------------------------
// Rekap pergerakan stok
// ---------------------------------------------------------------------------
export interface StockSummaryItem {
  ingredientId: string;
  sku: string;
  name: string;
  baseUnit: string;
  reorderLevel: number;
  openingStock: number;
  totalIn: number;
  totalOut: number;
  totalSales: number;
  totalWaste: number;
  totalAdjustment: number;
  closingStock: number;
  lowStock: boolean;
}

export interface StockSummary {
  from: string;
  to: string;
  summary: {
    ingredientCount: number;
    openingStock: number;
    totalIn: number;
    totalOut: number;
    totalSales: number;
    totalWaste: number;
    totalAdjustment: number;
    lowStockCount: number;
  };
  items: StockSummaryItem[];
}

// ---------------------------------------------------------------------------
// Resep produk (inventori / komposisi bahan per varian menu)
// ---------------------------------------------------------------------------
export interface RecipeItem {
  productVariantId: string;
  ingredientId: string;
  ingredientSku: string | null;
  ingredientName: string | null;
  baseUnit: string | null;
  quantityInBaseUnit: number;
  expectedWastePercent: number;
  productId: string | null;
  productName: string | null;
  productSlug: string | null;
  variantName: string | null;
  variantPriceIdr: number | null;
}

/** Respons PUT /admin/recipes (hasil replace seluruh bahan untuk satu varian). */
export interface RecipeSaveResult {
  productVariantId: string;
  productId: string | null;
  productName: string | null;
  variantName: string | null;
  items: RecipeItem[];
  ingredientCount: number;
  costPerUnitIdr: number | null;
}

// ---------------------------------------------------------------------------
// Promo
// ---------------------------------------------------------------------------
export interface Promo {
  id: string;
  code: string | null;
  /** voucher = pakai kode; direct = diskon menu otomatis tanpa kode. */
  mode?: "voucher" | "direct";
  name: string;
  description: string | null;
  discountType: string;
  discountValue: number;
  minimumOrderIdr: number | null;
  maximumDiscountIdr: number | null;
  startsAt: string;
  endsAt: string;
  globalQuota: number | null;
  perUserQuota: number | null;
  rules: Record<string, unknown>;
  isActive: boolean;
  totalRedeemed: number;
}

export interface PromoEligibilityRef {
  id: string;
  name: string | null;
  slug: string | null;
}

export interface AdminPromoDetail extends Promo {
  eligibleProducts: PromoEligibilityRef[];
  eligibleCategories: PromoEligibilityRef[];
  remainingQuota: number | null;
}

// ---------------------------------------------------------------------------
// Cabang (detail)
// ---------------------------------------------------------------------------
export interface BranchArea {
  id: string;
  branchId: string;
  name: string;
  areaType: string;
  /** Harga sewa ruangan per jam (Rp). Dasar perhitungan total & DP. */
  pricePerHourIdr: number | null;
  imageUrl: string | null;
  isActive: boolean;
  tableCount: number;
  totalCapacity: number;
}

export interface BranchTable {
  id: string;
  areaId: string;
  tableCode: string;
  capacity: number;
  isActive: boolean;
  areaName: string | null;
  areaType: string | null;
}


// ---------------------------------------------------------------------------
// Event
// ---------------------------------------------------------------------------
export interface EventPackage {
  id: string;
  code: string;
  name: string;
  description: string | null;
  basePriceIdr: number;
  minimumGuests: number;
  maximumGuests: number | null;
  inclusions: string[];
  isActive: boolean;
}

export interface CateringPackage {
  id: string;
  code: string;
  name: string;
  description: string | null;
  pricePerPersonIdr: number;
  minimumGuests: number;
  maximumGuests: number | null;
  menuDetails: string[];
  leadTimeHours: number;
  isActive: boolean;
}

// ---------------------------------------------------------------------------
// Katalog (produk & kategori)
// ---------------------------------------------------------------------------
export interface ProductCategoryRef {
  id: string;
  slug: string;
  name: string;
}

export interface ProductCategory {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
  depth?: number;
  children?: ProductCategory[];
}

export interface ProductImage {
  id: string;
  url: string | null;
  altText: string | null;
  sortOrder: number;
  isPrimary: boolean;
  widthPx: number | null;
  heightPx: number | null;
}

/** Hasil `POST /admin/uploads/images` — objek yang baru diunggah ke storage. */
export interface UploadedImage {
  storageKey: string;
  publicUrl: string;
  contentType: string;
  sizeBytes: number;
}

export interface ProductModifierOption {
  id: string;
  groupId: string;
  name: string;
  priceDeltaIdr: number;
  sortOrder: number;
  isActive: boolean;
}

export interface ProductModifierGroup {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  isRequired: boolean;
  sortOrder: number;
  options: ProductModifierOption[];
}

export interface ProductVariant {
  id: string;
  name: string;
  sku: string | null;
  priceIdr: number;
  compareAtPriceIdr: number | null;
  isDefault: boolean;
  isAvailable: boolean;
  modifierGroups: ProductModifierGroup[];
}

/** Varian versi admin: menyertakan harga modal (HPP). */
export interface AdminVariant {
  id: string;
  productId: string;
  sku: string | null;
  name: string;
  priceIdr: number;
  costIdr: number;
  compareAtPriceIdr: number | null;
  sortOrder: number;
  isDefault: boolean;
  isActive: boolean;
}

/**
 * Produk versi admin: hasil CRUD `/admin/products`. Menyertakan seluruh varian
 * (beserta HPP) agar form katalog bisa menampilkan data lengkap.
 */
export interface AdminProduct {
  id: string;
  name: string;
  slug: string;
  categoryId: string;
  categoryName: string | null;
  productKind: string;
  description: string | null;
  isActive: boolean;
  isFeatured: boolean;
  imageUrl?: string | null;
  imageStorageKey?: string | null;
  imageAltText?: string | null;
  images?: { id: string; url: string | null; storageKey: string | null; altText: string | null; sortOrder: number; isPrimary: boolean }[];
  createdAt: string;
  updatedAt: string;
  variants: AdminVariant[];
}

export interface AdminProductVariants {
  productId: string;
  productName: string;
  variants: AdminVariant[];
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  descriptionShort: string | null;
  productKind: string;
  isFeatured: boolean;
  isActive: boolean;
  basePriceIdr: number;
  maxPriceIdr: number;
  imageUrl: string | null;
  category: ProductCategoryRef | null;
  rating: { average: number; count: number } | null;
  isFavorite?: boolean;
  isAvailable?: boolean;
  images?: ProductImage[];
  modifierGroups?: ProductModifierGroup[];
}

// ---------------------------------------------------------------------------
// Reservasi (Admin)
// ---------------------------------------------------------------------------
export interface AdminReservationRoom {
  areaId: string;
  name: string;
  areaType: string;
  pricePerHourIdr: number | null;
  imageUrl: string | null;
}

/** Satu tahap pembayaran DP (DP1, DP2, atau pelunasan). */
export interface ReservationPaymentStage {
  amountIdr: number | null;
  status: string;
  proofUrl: string | null;
  paidAt: string | null;
  note: string | null;
}

/** Ketentuan pembagian DP reservasi yang bisa diatur admin. */
export interface DepositSettings {
  /** DP1: persen dari total (sewa + menu), dijepit min/max di bawah. */
  dp1Percent: number;
  dp1MinIdr: number;
  dp1MaxIdr: number;
  /** DP2: persen dari sisa setelah DP1. Pelunasan = sisa setelah DP1 & DP2. */
  dp2Percent: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface AdminReservation {
  id: string;
  reservationNumber: string;
  branchId: string;
  branchName: string | null;
  /** Kontak cabang (dari tabel branches). */
  branchPhone: string | null;
  branchEmail: string | null;
  branchAddress: string | null;
  /** Ruangan utama (area pertama) — legacy; pakai `rooms` untuk daftar lengkap. */
  areaId: string | null;
  areaName: string | null;
  /** Ruangan yang dipesan (reservasi kini per-ruangan). */
  rooms: AdminReservationRoom[];
  reservedFor: string | null;
  /** Waktu selesai (reservedFor + durationMinutes). */
  endsAt: string | null;
  durationMinutes: number;
  guestCount: number;
  status: string;
  userName: string | null;
  userEmail: string | null;
  userPhone: string | null;
  specialRequests: string | null;
  /** Legacy: kode meja (reservasi lama). */
  tables: string[];
  /** Sewa ruangan: harga per jam & total estimasi. */
  areaPricePerHourIdr: number | null;
  /** Total yang dibayar pelanggan = sewa ruangan + order menu. */
  totalEstimateIdr: number | null;
  /** Pemecahan total: sewa ruangan saja. */
  roomTotalIdr: number | null;
  /** Pemecahan total: order menu (makanan/minuman). */
  menuTotalIdr: number | null;
  /** Rincian order menu yang menyertai reservasi. */
  menuItems: AdminReservationMenuItem[];
  /** DP1 (uang muka awal). */
  depositAmountIdr: number | null;
  depositStatus: string;
  depositProofUrl: string | null;
  depositPaidAt: string | null;
  depositNote: string | null;
  /** DP2 (setelah konfirmasi). */
  deposit2AmountIdr: number | null;
  deposit2Status: string;
  deposit2ProofUrl: string | null;
  deposit2PaidAt: string | null;
  deposit2Note: string | null;
  /** Pelunasan (tahap akhir). */
  settlementAmountIdr: number | null;
  settlementStatus: string;
  settlementProofUrl: string | null;
  settlementPaidAt: string | null;
  settlementNote: string | null;
  history: AdminReservationHistory[];
  createdAt: string | null;
}

/** Satu item order menu (makanan/minuman) yang menyertai reservasi. */
export interface AdminReservationMenuItem {
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

/** Satu baris riwayat perubahan status reservasi. */
export interface AdminReservationHistory {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  note: string | null;
  actorName: string | null;
  createdAt: string | null;
}

// ---------------------------------------------------------------------------
// Booking Event (Admin)
// ---------------------------------------------------------------------------
export interface AdminEventBookingCatering {
  id: string;
  cateringPackageId: string | null;
  packageName: string;
  pricePerPersonIdr: number;
  guestCount: number;
  lineTotalIdr: number;
}

export interface AdminEventBookingAddon {
  id: string;
  name: string;
  quantity: number;
  unitPriceIdr: number;
  lineTotalIdr: number;
}

export interface AdminEventBooking {
  id: string;
  bookingNumber: string;
  branchId: string;
  branchName: string | null;
  eventType: string;
  eventName: string | null;
  startsAt: string | null;
  endsAt: string | null;
  guestCount: number;
  eventPackageName: string | null;
  eventPackagePriceIdr: number;
  subtotalIdr: number;
  depositIdr: number;
  paidIdr: number;
  status: string;
  userName: string | null;
  userEmail: string | null;
  userPhone: string | null;
  customRequests: string | null;
  catering: AdminEventBookingCatering[];
  addons: AdminEventBookingAddon[];
  createdAt: string | null;
}

/** Agenda event: penanda tanggal seperti Ramadan, Lebaran, atau promo musiman. */
export interface EventAgenda {
  id: string;
  title: string;
  description: string | null;
  /** Tanggal kalender "YYYY-MM-DD". */
  startsOn: string;
  endsOn: string;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

// ---------------------------------------------------------------------------
// Chat / Support (Admin)
// ---------------------------------------------------------------------------
export interface AdminChatConversation {
  id: string;
  userId: string;
  userName: string;
  userEmail: string | null;
  userPhone: string | null;
  assignedStaffId: string | null;
  assignedStaffName: string | null;
  topic: string;
  category: string;
  status: string;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  messageCount: number;
  unreadCount: number;
  createdAt: string | null;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderType: string;
  senderUserId: string | null;
  senderName: string | null;
  body: string;
  attachmentStorageKey: string | null;
  /** Kapan pesan sampai di perangkat penerima. */
  deliveredAt: string | null;
  /** Kapan pesan dibaca penerima; `null` = belum dibaca. */
  readAt: string | null;
  createdAt: string | null;
}

/** Produk yang sudah dihapus (soft delete) di tempat sampah. */
export interface DeletedProduct {
  id: string;
  name: string;
  slug: string;
  productKind: string;
  categoryName: string | null;
  deletedAt: string | null;
  deletedBy: string | null;
  deletedByName: string | null;
  variantCount: number;
  daysLeft: number;
}

export interface AuditLogFilters {
  actors: { id: string; name: string }[];
  actions: string[];
  entityTypes: string[];
}

// ---------------------------------------------------------------------------
// Moment Moderation (Admin)
// ---------------------------------------------------------------------------
export interface AdminMomentMedia {
  id: string;
  storageKey: string;
  publicUrl: string | null;
  mediaType: string;
  sortOrder: number;
}

export interface AdminMoment {
  id: string;
  userId: string | null;
  authorName: string;
  authorEmail: string | null;
  title: string | null;
  caption: string | null;
  eventType: string | null;
  moderationStatus: string;
  media: AdminMomentMedia[];
  createdAt: string | null;
}

// ---------------------------------------------------------------------------
// Keuangan: pengeluaran operasional
// ---------------------------------------------------------------------------
export interface Expense {
  id: string;
  category: string;
  name: string;
  amountIdr: number;
  note: string | null;
  expenseDate: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Pembelian: supplier, purchase order, penerimaan, hutang
// ---------------------------------------------------------------------------
export interface Supplier {
  id: string;
  code: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  purchaseOrderCount: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface PurchaseOrder {
  id: string;
  number: string;
  supplierId: string;
  supplierCode: string | null;
  supplierName: string | null;
  branchId: string | null;
  branchName: string | null;
  status: string;
  paymentStatus: string;
  orderDate: string | null;
  expectedDate: string | null;
  dueDate: string | null;
  subtotalIdr: number;
  discountIdr: number;
  taxIdr: number;
  totalIdr: number;
  paidAmountIdr: number;
  outstandingIdr: number;
  notes: string | null;
  cancelReason: string | null;
  confirmedAt: string | null;
  receivedAt: string | null;
  createdById: string | null;
  createdByName: string | null;
  itemCount: number;
  totalQuantity: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface PurchaseOrderItem {
  id: string;
  purchaseOrderId: string;
  ingredientId: string;
  ingredientSku: string | null;
  ingredientName: string | null;
  baseUnit: string | null;
  quantity: number;
  quantityReceived: number;
  remainingQuantity: number;
  unitPriceIdr: number;
  lineTotalIdr: number;
  notes: string | null;
  sortOrder: number;
  createdAt: string | null;
}

export interface GoodsReceipt {
  id: string;
  number: string;
  purchaseOrderId: string;
  purchaseOrderNumber: string | null;
  supplierId: string | null;
  supplierCode: string | null;
  supplierName: string | null;
  stockLocationId: string;
  stockLocationName: string | null;
  status: string;
  receivedDate: string | null;
  notes: string | null;
  postedAt: string | null;
  postedById: string | null;
  postedByName: string | null;
  createdById: string | null;
  createdByName: string | null;
  itemCount: number;
  totalQuantity: number;
  totalValueIdr: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface GoodsReceiptItem {
  id: string;
  goodsReceiptId: string;
  purchaseOrderItemId: string;
  ingredientId: string;
  ingredientSku: string | null;
  ingredientName: string | null;
  baseUnit: string | null;
  quantity: number;
  orderedQuantity: number;
  unitPriceIdr: number;
  createdAt: string | null;
}

export interface SupplierPayment {
  id: string;
  purchaseOrderId: string;
  amountIdr: number;
  paidAt: string | null;
  method: string;
  reference: string | null;
  proofUrl: string | null;
  notes: string | null;
  createdById: string | null;
  createdByName: string | null;
  createdAt: string | null;
}

export interface Payable {
  id: string;
  number: string;
  status: string;
  paymentStatus: string;
  orderDate: string | null;
  expectedDate: string | null;
  dueDate: string | null;
  totalIdr: number;
  paidAmountIdr: number;
  outstandingIdr: number;
  supplierId: string;
  supplierCode: string | null;
  supplierName: string | null;
  branchId: string | null;
  branchName: string | null;
  createdAt: string | null;
}

export interface PurchaseOrderDetail {
  order: PurchaseOrder;
  items: PurchaseOrderItem[];
  receipts: GoodsReceipt[];
  payments: SupplierPayment[];
}

export interface GoodsReceiptDetail {
  receipt: GoodsReceipt;
  items: GoodsReceiptItem[];
}
