/** Terjemahan status pesanan dari backend ke label Bahasa Indonesia. */
const ORDER_STATUS: Record<string, string> = {
  pending_payment: "Menunggu Bayar",
  pending: "Menunggu",
  placed: "Masuk",
  confirmed: "Dikonfirmasi",
  accepted: "Diterima",
  preparing: "Diproses",
  in_progress: "Diproses",
  ready: "Siap",
  ready_for_pickup: "Siap Diambil",
  delivering: "Diantar",
  delivered: "Diantar",
  completed: "Selesai",
  cancelled: "Dibatalkan",
  canceled: "Dibatalkan",
  refunded: "Dana Dikembalikan",
  failed: "Gagal",
  expired: "Kedaluwarsa",
};

export function orderStatusLabel(status: string): string {
  if (ORDER_STATUS[status]) return ORDER_STATUS[status];
  return status
    .split(/[_\s]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export type StatusTone = "success" | "warning" | "danger" | "coffee" | "muted";

const SUCCESS = ["completed", "delivered", "paid", "confirmed", "accepted", "ready"];
const WARNING = ["pending_payment", "pending", "placed", "preparing", "in_progress"];
const DANGER = ["cancelled", "canceled", "failed", "refunded", "expired"];

export function orderStatusTone(status: string): StatusTone {
  if (SUCCESS.includes(status)) return "success";
  if (WARNING.includes(status)) return "warning";
  if (DANGER.includes(status)) return "danger";
  return "coffee";
}

/** Terjemahan status pengguna. */
export function userStatusLabel(status: string): string {
  const map: Record<string, string> = {
    active: "Aktif",
    inactive: "Nonaktif",
    suspended: "Ditangguhkan",
    banned: "Diblokir",
    pending: "Menunggu Verifikasi",
    deleted: "Dihapus",
  };
  return map[status] ?? status;
}

export function userStatusTone(status: string): StatusTone {
  if (status === "active") return "success";
  if (status === "pending") return "warning";
  if (status === "suspended" || status === "banned") return "danger";
  return "muted";
}

// ---------------------------------------------------------------------------
// Reservasi (status meja & DP)
// ---------------------------------------------------------------------------
const RESERVATION_STATUS: Record<string, string> = {
  requested: "Diajukan",
  confirmed: "Diterima",
  seated: "Sudah Duduk",
  completed: "Selesai",
  cancelled: "Dibatalkan",
  no_show: "Tidak Hadir",
};

export function reservationStatusLabel(status: string): string {
  return RESERVATION_STATUS[status] ?? status;
}

export function reservationStatusTone(status: string): StatusTone {
  if (status === "confirmed" || status === "seated" || status === "completed") return "success";
  if (status === "requested") return "warning";
  if (status === "cancelled" || status === "no_show") return "danger";
  return "muted";
}

const DEPOSIT_STATUS: Record<string, string> = {
  unpaid: "Belum Bayar",
  pending: "Menunggu Bayar",
  paid: "Lunas",
  refunded: "Dikembalikan",
};

export function depositStatusLabel(status: string): string {
  return DEPOSIT_STATUS[status] ?? status;
}

export function depositStatusTone(status: string): StatusTone {
  if (status === "paid") return "success";
  if (status === "pending") return "warning";
  if (status === "refunded") return "danger";
  return "muted";
}

// ---------------------------------------------------------------------------
// Cabang
// ---------------------------------------------------------------------------
export function areaTypeLabel(type: string): string {
  const map: Record<string, string> = {
    indoor: "Dalam Ruangan",
    outdoor: "Luar Ruangan",
    private_room: "Ruang Privat",
    other: "Lainnya",
  };
  return map[type] ?? type;
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------
const AUDIT_ENTITY: Record<string, string> = {
  order: "Pesanan",
  orders: "Pesanan",
  payment_transaction: "Transaksi Pembayaran",
  payment: "Pembayaran",
  user: "Pengguna",
  users: "Pengguna",
  role: "Peran",
  roles: "Peran",
  permission: "Izin",
  product: "Produk",
  menu: "Menu",
  promo: "Promo",
  voucher: "Voucher",
  reservation: "Reservasi",
  reservation_booking: "Booking Reservasi",
  event_booking: "Booking Event",
  inventory: "Inventaris",
  ingredient: "Bahan Baku",
  inventory_movement: "Pergerakan Stok",
  stock_location: "Lokasi Stok",
  recipe: "Resep",
  moment: "Moment",
  chat: "Chat",
  conversation: "Percakapan",
  review: "Ulasan",
  session: "Sesi",
  loyalty: "Loyalitas",
  gamification_activity: "Gamifikasi",
};

const AUDIT_VERB: Record<string, string> = {
  create: "Dibuat",
  created: "Dibuat",
  update: "Diubah",
  updated: "Diubah",
  delete: "Dihapus",
  deleted: "Dihapus",
  status_change: "Status diubah",
  status_updated: "Status diubah",
  assign_role: "Peran ditetapkan",
  role_assigned: "Peran ditetapkan",
  roles_assigned: "Peran ditetapkan",
  login: "Masuk",
  logout: "Keluar",
  provider_sync: "Sinkronisasi penyedia",
  refund: "Dana dikembalikan",
  cancelled: "Dibatalkan",
  cancel: "Dibatalkan",
  payment_sync: "Sinkronisasi pembayaran",
  verify: "Diverifikasi",
  approve: "Disetujui",
  reject: "Ditolak",
  ingredient_create: "Bahan ditambahkan",
  ingredient_update: "Bahan diubah",
  ingredient_delete: "Bahan dihapus",
  location_create: "Lokasi stok dibuat",
  recipe_update: "Resep diubah",
  movement_create: "Mutasi stok dicatat",
  transfer_create: "Transfer stok dibuat",
  product_create: "Produk ditambahkan",
  product_update: "Produk diubah",
  product_delete: "Produk dihapus",
  product_restore: "Produk dipulihkan",
  product_purge: "Produk dihapus permanen",
  product_purge_expired: "Bersihkan produk kedaluwarsa",
};

function prettifyToken(token: string): string {
  return token
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** `payment.provider_sync` → "Transaksi Pembayaran · Sinkronisasi penyedia". */
export function auditActionLabel(action: string): string {
  const [head, ...rest] = action.split(".");
  const entity = AUDIT_ENTITY[head] ?? prettifyToken(head);
  if (rest.length === 0) return entity;
  const verbKey = rest.join("_");
  const verb = AUDIT_VERB[verbKey] ?? prettifyToken(verbKey);
  return `${entity} · ${verb}`;
}

export function entityTypeLabel(entityType: string): string {
  return AUDIT_ENTITY[entityType] ?? prettifyToken(entityType);
}

export function auditActionTone(action: string): StatusTone {
  if (/(create|created|assign|role_assigned|approve|verify)/.test(action)) return "success";
  if (/(delete|deleted|reject|cancel|refund)/.test(action)) return "danger";
  if (/(update|updated|status)/.test(action)) return "warning";
  return "coffee";
}

// ---------------------------------------------------------------------------
// Promo
// ---------------------------------------------------------------------------
export function discountTypeLabel(type: string): string {
  const map: Record<string, string> = {
    percentage: "Persentase",
    fixed: "Nominal Tetap",
    free_item: "Item Gratis",
  };
  return map[type] ?? type;
}

// ---------------------------------------------------------------------------
// Inventori
// ---------------------------------------------------------------------------
export function movementTypeLabel(type: string): string {
  const map: Record<string, string> = {
    purchase: "Pembelian",
    order_consumption: "Pemakaian Pesanan",
    waste: "Terbuang",
    adjustment: "Penyesuaian",
    transfer_in: "Transfer Masuk",
    transfer_out: "Transfer Keluar",
  };
  return map[type] ?? type;
}

export function movementTypeTone(type: string): StatusTone {
  if (type === "purchase" || type === "transfer_in") return "success";
  if (type === "waste") return "danger";
  if (type === "adjustment") return "warning";
  if (type === "order_consumption" || type === "transfer_out") return "coffee";
  return "muted";
}

// ---------------------------------------------------------------------------
// Katalog
// ---------------------------------------------------------------------------
export function productKindLabel(kind: string): string {
  const map: Record<string, string> = {
    food: "Makanan",
    drink: "Minuman",
    coffee: "Kopi",
    snack: "Camilan",
    dessert: "Hidangan Penutup",
    bundle: "Paket",
    buffet: "Prasmanan",
    event: "Acara",
    standard: "Standar",
    other: "Lainnya",
  };
  return map[kind] ?? kind;
}

// ---------------------------------------------------------------------------
// Penjualan & laporan
// ---------------------------------------------------------------------------
/** Metode pemenuhan pesanan: makan di tempat / ambil sendiri / diantar. */
export function fulfillmentLabel(type: string): string {
  const map: Record<string, string> = {
    dine_in: "Makan di Tempat",
    pickup: "Ambil Sendiri",
    delivery: "Diantar",
  };
  return map[type] ?? prettifyToken(type);
}

/** Metode pembayaran. */
export function paymentMethodLabel(method: string): string {
  const map: Record<string, string> = {
    qris: "QRIS",
    virtual_account: "Virtual Account",
    bank_transfer: "Transfer Bank",
    ewallet: "Dompet Digital",
    card: "Kartu",
    cash: "Tunai",
    lainnya: "Lainnya",
  };
  return map[method] ?? prettifyToken(method);
}

/** Singkatan hari (0=Minggu .. 6=Sabtu) untuk grafik. */
export function weekdayShortLabel(dayOfWeek: number): string {
  return ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"][dayOfWeek] ?? `Hari ${dayOfWeek}`;
}

// ---------------------------------------------------------------------------
// Peran & izin
// ---------------------------------------------------------------------------
const PERMISSION_RESOURCE: Record<string, string> = {
  ai: "AI",
  audit: "Audit",
  auth: "Autentikasi",
  branch: "Cabang",
  catalog: "Katalog",
  chat: "Chat",
  delivery: "Pengantaran",
  event: "Event",
  gamification: "Gamifikasi",
  inventory: "Inventaris",
  loyalty: "Loyalitas",
  menu: "Menu",
  moment: "Moment",
  order: "Pesanan",
  payment: "Pembayaran",
  promo: "Promo",
  purchase: "Pembelian",
  reservation: "Reservasi",
  review: "Ulasan",
  user: "Pengguna",
};

/** Nama tampilan untuk resource permission (mis. `order` → "Pesanan"). */
export function permissionResourceLabel(resource: string): string {
  return PERMISSION_RESOURCE[resource] ?? prettifyToken(resource);
}

// ---------------------------------------------------------------------------
// Pembelian
// ---------------------------------------------------------------------------
const PURCHASE_ORDER_STATUS: Record<string, string> = {
  draft: "Draft",
  ordered: "Diterbitkan",
  partial: "Diterima Sebagian",
  received: "Diterima Semua",
  cancelled: "Dibatalkan",
};

export function purchaseOrderStatusLabel(status: string): string {
  if (PURCHASE_ORDER_STATUS[status]) return PURCHASE_ORDER_STATUS[status];
  return prettifyToken(status);
}

const PURCHASE_PAYMENT_STATUS: Record<string, string> = {
  unpaid: "Belum Bayar",
  partial: "Dibayar Sebagian",
  paid: "Lunas",
};

export function purchasePaymentStatusLabel(status: string): string {
  if (PURCHASE_PAYMENT_STATUS[status]) return PURCHASE_PAYMENT_STATUS[status];
  return prettifyToken(status);
}

export function purchaseOrderStatusTone(status: string): StatusTone {
  if (status === "received") return "success";
  if (status === "partial") return "warning";
  if (status === "ordered") return "coffee";
  if (status === "cancelled") return "danger";
  return "muted";
}

export function purchasePaymentStatusTone(status: string): StatusTone {
  if (status === "paid") return "success";
  if (status === "partial") return "warning";
  if (status === "unpaid") return "danger";
  return "muted";
}

const GOODS_RECEIPT_STATUS: Record<string, string> = {
  draft: "Draft",
  posted: "Posted",
  cancelled: "Dibatalkan",
};

export function goodsReceiptStatusLabel(status: string): string {
  if (GOODS_RECEIPT_STATUS[status]) return GOODS_RECEIPT_STATUS[status];
  return prettifyToken(status);
}

export function goodsReceiptStatusTone(status: string): StatusTone {
  if (status === "posted") return "success";
  if (status === "draft") return "warning";
  if (status === "cancelled") return "danger";
  return "muted";
}

/** Status dokumen stok keluar & stok opname memakai kosakata yang sama. */
export const stockDocumentStatusLabel = goodsReceiptStatusLabel;
export const stockDocumentStatusTone = goodsReceiptStatusTone;

const SUPPLIER_PAYMENT_METHOD: Record<string, string> = {
  transfer: "Transfer",
  cash: "Tunai",
  qris: "QRIS",
  other: "Lainnya",
};

export function supplierPaymentMethodLabel(method: string): string {
  if (SUPPLIER_PAYMENT_METHOD[method]) return SUPPLIER_PAYMENT_METHOD[method];
  return prettifyToken(method);
}

// ---------------------------------------------------------------------------
// Event
// ---------------------------------------------------------------------------
export function eventTypeLabel(type: string): string {
  const map: Record<string, string> = {
    birthday: "Ulang Tahun",
    arisan: "Arisan",
    meeting: "Rapat",
    gathering: "Gathering",
    engagement: "Lamaran",
    wedding: "Pernikahan",
    seminar: "Seminar",
    reunion: "Reuni",
    bukber: "Bukber",
    family_gathering: "Acara Keluarga",
    other: "Lainnya",
  };
  return map[type] ?? type;
}

// ---------------------------------------------------------------------------
// Keuangan: pengeluaran operasional
// ---------------------------------------------------------------------------
export const EXPENSE_CATEGORIES: Array<{ code: string; label: string }> = [
  { code: "bahan_baku", label: "Bahan Baku" },
  { code: "alat_alat_masak", label: "Alat & Peralatan" },
  { code: "kemasan", label: "Kemasan" },
  { code: "utilitas", label: "Utilitas" },
  { code: "sewa", label: "Sewa" },
  { code: "gaji", label: "Gaji" },
  { code: "pemasaran", label: "Pemasaran" },
  { code: "transportasi", label: "Transportasi" },
  { code: "lainnya", label: "Lainnya" },
];

export function expenseCategoryLabel(category: string): string {
  const match = EXPENSE_CATEGORIES.find((item) => item.code === category);
  return match ? match.label : prettifyToken(category);
}

export function expenseCategoryTone(category: string): StatusTone {
  switch (category) {
    case "bahan_baku":
    case "alat_alat_masak":
    case "kemasan":
    case "pemasaran":
      return "coffee";
    case "sewa":
      return "warning";
    case "gaji":
      return "danger";
    case "utilitas":
    case "transportasi":
    case "lainnya":
      return "muted";
    default:
      return "coffee";
  }
}
