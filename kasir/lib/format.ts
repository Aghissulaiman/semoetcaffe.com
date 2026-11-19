import type {
  OrderStatus,
  OrderType,
  PaymentMethod,
  ReservationStatus,
} from "./types";

const rupiahFormatter = new Intl.NumberFormat("id-ID");

/** 25000 -> "Rp25.000" */
export function formatRupiah(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "Rp0";
  return `Rp${rupiahFormatter.format(Math.round(value))}`;
}

/** 25000 -> "25.000" */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "0";
  return rupiahFormatter.format(Math.round(value));
}

const quantityFormatter = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 3,
});

/** 12.5, "kg" -> "12,5 kg" */
export function formatQuantity(
  value: number | null | undefined,
  unit?: string | null,
): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return unit ? `0 ${unit}` : "0";
  }
  const formatted = quantityFormatter.format(value);
  return unit ? `${formatted} ${unit}` : formatted;
}

/** 95 -> "1 jam 35 menit" */
export function formatDuration(minutes: number | null | undefined): string {
  const total = Math.max(0, Math.round(minutes ?? 0));
  if (total < 1) return "Baru saja";
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest} menit`;
  if (rest === 0) return `${hours} jam`;
  return `${hours} jam ${rest} menit`;
}

/** Date -> "2026-11-09" (tanggal lokal, bukan UTC). */
export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** "2026-11-09" -> Date pada pukul 00:00 waktu lokal. */
export function fromDateKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

export function todayKey(): string {
  return toDateKey(new Date());
}

export function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export function addDaysKey(key: string, amount: number): string {
  return toDateKey(addDays(fromDateKey(key), amount));
}

export function daysBetween(from: string, to: string): number {
  const diff = fromDateKey(to).getTime() - fromDateKey(from).getTime();
  return Math.round(diff / 86_400_000);
}

export function formatDateLong(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const date = typeof value === "string" ? fromDateKey(value) : value;
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatDateShort(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const date = typeof value === "string" ? fromDateKey(value) : value;
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Waktu relatif singkat untuk daftar chat: "Baru saja", "5 mnt lalu", dst. */
export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 1) return "Baru saja";
  if (diffMinutes < 60) return `${diffMinutes} mnt lalu`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} jam lalu`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} hari lalu`;

  return date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatClock(date: Date | null): string {
  if (!date) return "--.--";
  return date.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "Hari ini", "Besok", "Kemarin", atau tanggal singkat. */
export function relativeDayLabel(key: string): string {
  const today = todayKey();
  if (key === today) return "Hari ini";
  if (key === addDaysKey(today, 1)) return "Besok";
  if (key === addDaysKey(today, -1)) return "Kemarin";
  return formatDateShort(key);
}

/** Senin, 09 Nov 2026 */
export function formatDayLabel(key: string): string {
  const date = fromDateKey(key);
  return date.toLocaleDateString("id-ID", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

export const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  dine_in: "Makan di Tempat",
  pickup: "Bawa Pulang / Ambil",
  delivery: "Delivery",
};

export const ORDER_TYPE_SHORT: Record<OrderType, string> = {
  dine_in: "Dine In",
  pickup: "Bawa Pulang",
  delivery: "Delivery",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Tunai",
  qris: "QRIS",
  card: "Kartu Debit/Kredit",
  bank_transfer: "Transfer Bank",
  ewallet: "E-Wallet",
  virtual_account: "Virtual Account",
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  placed: "Pesanan Baru",
  accepted: "Diterima",
  preparing: "Disiapkan",
  ready: "Siap",
  out_for_delivery: "Diantar",
  completed: "Selesai",
  cancelled: "Dibatalkan",
  rejected: "Ditolak",
};

export const ORDER_STATUS_TONE: Record<
  OrderStatus,
  "default" | "success" | "warning" | "danger" | "info"
> = {
  placed: "warning",
  accepted: "info",
  preparing: "info",
  ready: "success",
  out_for_delivery: "info",
  completed: "success",
  cancelled: "danger",
  rejected: "danger",
};

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  unpaid: "Belum Dibayar",
  pending: "Menunggu Pembayaran",
  paid: "Lunas",
  partially_refunded: "Refund Sebagian",
  refunded: "Refund",
  failed: "Gagal",
};

export const RESERVATION_STATUS_LABEL: Record<ReservationStatus, string> = {
  requested: "Menunggu Konfirmasi",
  confirmed: "Dikonfirmasi",
  seated: "Sudah Duduk",
  completed: "Selesai",
  cancelled: "Dibatalkan",
  no_show: "Tidak Hadir",
};

export const RESERVATION_STATUS_TONE: Record<
  ReservationStatus,
  "default" | "success" | "warning" | "danger" | "info"
> = {
  requested: "warning",
  confirmed: "info",
  seated: "success",
  completed: "default",
  cancelled: "danger",
  no_show: "danger",
};
