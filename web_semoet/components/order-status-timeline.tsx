"use client";

/**
 * Linimasa status pesanan.
 *
 * Menampilkan posisi pesanan saat ini (diterima → dikonfirmasi → disiapkan →
 * siap/diantar → selesai) plus penjelasan singkat, supaya pelanggan tahu
 * pesanannya sudah siap diambil/dikirim atau belum.
 */
import {
  Bike,
  CheckCircle2,
  Circle,
  CircleDot,
  Coffee,
  PackageCheck,
  ReceiptText,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";

import type { FulfillmentType, OrderStatus, PaymentStatus } from "@/types/api";

const PICKUP_STEPS = ["Pesanan diterima", "Dikonfirmasi", "Disiapkan", "Siap diambil", "Selesai"];
const DELIVERY_STEPS = ["Pesanan diterima", "Dikonfirmasi", "Disiapkan", "Dalam perjalanan", "Selesai"];

/** Posisi tiap status pada linimasa (0..4). */
const STEP_RANK: Record<OrderStatus, number> = {
  placed: 0,
  accepted: 1,
  preparing: 2,
  ready: 3,
  out_for_delivery: 3,
  completed: 4,
  cancelled: -1,
  rejected: -1,
};

interface Headline {
  icon: LucideIcon;
  title: string;
  description: string;
  tone: "primary" | "success" | "danger";
}

function headlineFor(status: OrderStatus, isDelivery: boolean, isPaid: boolean): Headline {
  switch (status) {
    case "placed":
      return {
        icon: ReceiptText,
        title: "Menunggu konfirmasi",
        description: isPaid
          ? "Pembayaran diterima. Cafe akan segera mengonfirmasi pesananmu."
          : "Pesanan sudah masuk. Selesaikan pembayaran lalu tunggu konfirmasi cafe.",
        tone: "primary",
      };
    case "accepted":
      return {
        icon: CheckCircle2,
        title: "Pesanan dikonfirmasi",
        description: "Pesananmu diterima dan akan segera disiapkan.",
        tone: "primary",
      };
    case "preparing":
      return {
        icon: Coffee,
        title: "Sedang disiapkan",
        description: "Pesananmu sedang disiapkan oleh barista.",
        tone: "primary",
      };
    case "ready":
      return isDelivery
        ? {
            icon: PackageCheck,
            title: "Siap diantar",
            description: "Pesanan siap dan sedang menunggu kurir.",
            tone: "success",
          }
        : {
            icon: PackageCheck,
            title: "Pesanan siap diambil!",
            description: "Tunjukkan nomor pesanan ke kasir untuk mengambil pesananmu.",
            tone: "success",
          };
    case "out_for_delivery":
      return {
        icon: Bike,
        title: "Dalam perjalanan",
        description: "Pesananmu sedang diantar ke alamat tujuan.",
        tone: "success",
      };
    case "completed":
      return {
        icon: CheckCircle2,
        title: "Pesanan selesai",
        description: "Terima kasih! Semoga menikmati pesananmu.",
        tone: "success",
      };
    case "cancelled":
      return {
        icon: XCircle,
        title: "Pesanan dibatalkan",
        description: "Pesanan ini telah dibatalkan.",
        tone: "danger",
      };
    case "rejected":
      return {
        icon: XCircle,
        title: "Pesanan ditolak",
        description: "Pesanan ini ditolak oleh cafe.",
        tone: "danger",
      };
    default:
      return {
        icon: CircleDot,
        title: "Status pesanan",
        description: "Memuat status pesanan…",
        tone: "primary",
      };
  }
}

interface OrderStatusTimelineProps {
  status: OrderStatus;
  fulfillmentType: FulfillmentType;
  paymentStatus: PaymentStatus;
  placedAt: string;
  acceptedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  /** Jam pengambilan terjadwal (mode pickup). */
  pickupAt?: string | null;
}

export function OrderStatusTimeline({
  status,
  fulfillmentType,
  paymentStatus,
  placedAt,
  acceptedAt,
  completedAt,
  cancelledAt,
  pickupAt,
}: OrderStatusTimelineProps) {
  const isDelivery = fulfillmentType === "delivery";
  const steps = isDelivery ? DELIVERY_STEPS : PICKUP_STEPS;
  const headline = headlineFor(status, isDelivery, paymentStatus === "paid");
  const rank = STEP_RANK[status] ?? 0;
  const HeadlineIcon = headline.icon;
  const isTerminalNegative = status === "cancelled" || status === "rejected";

  const stepTimes = [placedAt, acceptedAt, null, null, completedAt];

  return (
    <div className="flex flex-col gap-3.5 rounded-[18px] border border-line bg-surface p-4">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
            headline.tone === "success"
              ? "bg-[#e7f1ea] text-success"
              : headline.tone === "danger"
                ? "bg-[#f7e4e0] text-danger"
                : "bg-primary-soft text-primary",
          )}>
          <HeadlineIcon size={24} />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-base font-black",
              headline.tone === "success"
                ? "text-success"
                : headline.tone === "danger"
                  ? "text-danger"
                  : "text-primary",
            )}>
            {headline.title}
          </p>
          <p className="text-xs leading-[18px] text-muted">{headline.description}</p>
        </div>
      </div>

      {!isTerminalNegative ? (
        <div>
          {steps.map((label, index) => {
            const isDone = index < rank;
            const isActive = index === rank;
            const time = stepTimes[index];
            return (
              <div key={label} className="flex gap-3">
                <div className="flex w-5 flex-col items-center">
                  {isDone ? (
                    <CheckCircle2 size={16} className="shrink-0 text-success" />
                  ) : isActive ? (
                    <CircleDot size={18} className="shrink-0 text-primary" />
                  ) : (
                    <Circle size={16} className="shrink-0 text-line" />
                  )}
                  {index < steps.length - 1 ? (
                    <span
                      className={cn(
                        "min-h-[18px] w-0.5 flex-1",
                        isDone ? "bg-success" : "bg-line",
                      )}
                    />
                  ) : null}
                </div>
                <div className={cn("min-w-0 flex-1", index < steps.length - 1 && "pb-3.5")}>
                  <p
                    className={cn(
                      "text-sm",
                      isActive ? "font-extrabold" : "font-semibold",
                      isDone || isActive ? "text-ink" : "text-muted",
                    )}>
                    {label}
                  </p>
                  {time ? (
                    <p className="text-[11px] text-muted">{formatDateTime(time)}</p>
                  ) : isActive && pickupAt && index === 3 && !isDelivery ? (
                    <p className="text-[11px] text-muted">
                      Jadwal ambil {formatDateTime(pickupAt)}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-muted">
          {status === "cancelled"
            ? `Dibatalkan${cancelledAt ? ` pada ${formatDateTime(cancelledAt)}` : ""}.`
            : "Hubungi kasir bila perlu bantuan lebih lanjut."}
        </p>
      )}
    </div>
  );
}
