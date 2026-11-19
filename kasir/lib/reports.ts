import {
  formatDayLabel,
  ORDER_STATUS_LABEL,
  ORDER_TYPE_SHORT,
  PAYMENT_METHOD_LABEL,
  toDateKey,
} from "./format";
import type { Order, PaymentMethod, Reservation } from "./types";

export interface DayPoint {
  key: string;
  label: string;
  revenue: number;
  count: number;
}

export interface HourPoint {
  hour: number;
  label: string;
  revenue: number;
  count: number;
}

export interface ReservationSummary {
  total: number;
  requested: number;
  confirmed: number;
  seated: number;
  completed: number;
  cancelled: number;
  noShow: number;
  guests: number;
  depositCollected: number;
}

export function orderDateKey(order: Order): string {
  return toDateKey(new Date(order.createdAt));
}

export function isOrderInRange(
  order: Order,
  from: string,
  to: string,
): boolean {
  const key = orderDateKey(order);
  return key >= from && key <= to;
}

export function isReservationInRange(
  reservation: Reservation,
  from: string,
  to: string,
): boolean {
  return reservation.date >= from && reservation.date <= to;
}

export function buildReservationSummary(
  reservations: Reservation[],
  from: string,
  to: string,
): ReservationSummary {
  const filtered = reservations.filter((reservation) =>
    isReservationInRange(reservation, from, to),
  );

  const summary: ReservationSummary = {
    total: filtered.length,
    requested: 0,
    confirmed: 0,
    seated: 0,
    completed: 0,
    cancelled: 0,
    noShow: 0,
    guests: 0,
    depositCollected: 0,
  };

  for (const reservation of filtered) {
    if (reservation.status === "requested") summary.requested += 1;
    if (reservation.status === "confirmed") summary.confirmed += 1;
    if (reservation.status === "seated") summary.seated += 1;
    if (reservation.status === "completed") summary.completed += 1;
    if (reservation.status === "cancelled") summary.cancelled += 1;
    if (reservation.status === "no_show") summary.noShow += 1;
    if (
      reservation.status !== "cancelled" &&
      reservation.status !== "no_show"
    ) {
      summary.guests += reservation.guests;
    }
    if (reservation.depositPaid) {
      summary.depositCollected += reservation.depositAmount;
    }
  }

  return summary;
}

function csvCell(value: string | number): string {
  const text = String(value).replaceAll('"', '""');
  return `"${text}"`;
}

/** CSV siap buka di Excel (pakai BOM + pemisah koma). */
export function ordersToCsv(orders: Order[]): string {
  const header = [
    "Kode",
    "Waktu",
    "Tipe",
    "Meja",
    "Pelanggan",
    "Telepon",
    "Item",
    "Subtotal",
    "Diskon",
    "Pajak",
    "Biaya Layanan",
    "Total",
    "Metode Bayar",
    "Status Pesanan",
    "Status Bayar",
  ];

  const rows = orders.map((order) => {
    const items = order.items
      .map((item) => `${item.qty}x ${item.name} (${item.price * item.qty})`)
      .join("; ");
    const time = new Date(order.createdAt).toLocaleString("id-ID");
    return [
      order.code,
      time,
      ORDER_TYPE_SHORT[order.type],
      order.tableNumber ?? "-",
      order.customerName ?? "Walk-in",
      order.customerPhone ?? "-",
      items,
      order.subtotal,
      order.discount,
      order.tax,
      order.serviceFee,
      order.total,
      order.paymentMethod ? PAYMENT_METHOD_LABEL[order.paymentMethod] : "-",
      ORDER_STATUS_LABEL[order.status],
      order.paymentStatus,
    ]
      .map(csvCell)
      .join(",");
  });

  return `\uFEFF${header.map(csvCell).join(",")}\r\n${rows.join("\r\n")}`;
}

/** Rentang tanggal untuk preset laporan. */
export type ReportPreset = "today" | "7d" | "30d" | "month" | "custom";

export function presetRange(preset: Exclude<ReportPreset, "custom">): {
  from: string;
  to: string;
} {
  const today = new Date();
  const todayStr = toDateKey(today);

  if (preset === "today") {
    return { from: todayStr, to: todayStr };
  }
  if (preset === "7d") {
    return {
      from: toDateKey(
        new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6),
      ),
      to: todayStr,
    };
  }
  if (preset === "30d") {
    return {
      from: toDateKey(
        new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29),
      ),
      to: todayStr,
    };
  }

  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  return { from: toDateKey(firstOfMonth), to: todayStr };
}

export function dailyPoints(
  daily: { businessDate: string; netIdr: number; orderCount: number }[],
): DayPoint[] {
  return daily.map((row) => ({
    key: row.businessDate,
    label: formatDayLabel(row.businessDate),
    revenue: row.netIdr,
    count: row.orderCount,
  }));
}

export function hourlyPoints(
  hourly: { key: string; revenueIdr: number; orderCount: number }[],
): HourPoint[] {
  const byHour = new Map<number, { revenue: number; count: number }>();
  for (const row of hourly) {
    const hour = Number(row.key);
    if (!Number.isFinite(hour)) continue;
    const current = byHour.get(hour) ?? { revenue: 0, count: 0 };
    current.revenue += row.revenueIdr;
    current.count += row.orderCount;
    byHour.set(hour, current);
  }

  return Array.from({ length: 24 }, (_, hour) => {
    const current = byHour.get(hour) ?? { revenue: 0, count: 0 };
    return {
      hour,
      label: `${String(hour).padStart(2, "0")}.00`,
      revenue: current.revenue,
      count: current.count,
    };
  });
}

export function paymentLabel(key: string): string {
  return (
    PAYMENT_METHOD_LABEL[key as PaymentMethod] ??
    key.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase())
  );
}
