"use client";

import { useRouter } from "next/navigation";
import { Calendar, PieChart, ShieldCheck, Wallet, Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  DEPOSIT_STATUS_LABEL,
  DEPOSIT_STATUS_TONE,
  formatReservationSchedule,
  RESERVATION_STATUS_LABEL,
  RESERVATION_STATUS_TONE,
} from "@/lib/format";

import type { Reservation } from "@/types/api";

/** Ringkasan notifikasi DP untuk sebuah reservasi (bila perlu perhatian). */
function depositNotice(reservation: Reservation): { Icon: typeof Wallet; text: string } | null {
  if (reservation.status === "confirmed") {
    if (reservation.depositStatus !== "paid") {
      return { Icon: Wallet, text: "Reservasi diterima — silakan bayar DP1" };
    }
    if (reservation.deposit2Status !== "paid") {
      return { Icon: PieChart, text: "DP1 lunas — silakan bayar DP2" };
    }
    if (reservation.settlementStatus !== "paid") {
      return { Icon: ShieldCheck, text: "Silakan lunasi sisa pembayaran" };
    }
  }
  if (reservation.depositStatus === "pending") {
    return { Icon: Clock, text: "Menunggu pembayaran DP1" };
  }
  if (reservation.deposit2Status === "pending") {
    return { Icon: Clock, text: "Menunggu pembayaran DP2" };
  }
  if (reservation.settlementStatus === "pending") {
    return { Icon: Clock, text: "Menunggu pelunasan" };
  }
  return null;
}

/** Tahap DP yang paling relevan untuk ditampilkan sebagai badge ringkas. */
function currentDepositStage(reservation: Reservation): { label: string; status: string } {
  if (reservation.settlementStatus !== "unpaid") {
    return { label: "Pelunasan", status: reservation.settlementStatus };
  }
  if (reservation.deposit2Status !== "unpaid") {
    return { label: "DP2", status: reservation.deposit2Status };
  }
  return { label: "DP1", status: reservation.depositStatus };
}

/** Kartu ringkasan reservasi di daftar "Reservasi Saya". */
export function ReservationCard({ reservation }: { reservation: Reservation }) {
  const router = useRouter();
  const notice = depositNotice(reservation);
  const stage = currentDepositStage(reservation);
  const roomLabel =
    reservation.rooms.length > 0
      ? reservation.rooms.map((room) => room.name).join(", ")
      : reservation.areaName;

  return (
    <button
      type="button"
      onClick={() => router.push(`/reservasi/${reservation.id}`)}
      className="flex w-full flex-col gap-2.5 rounded-2xl border border-line bg-surface p-3.5 text-left transition hover:border-primary/40 hover:bg-primary-soft/20 focus-ring">
      <div className="flex items-center gap-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-ink">{reservation.reservationNumber}</p>
          <p className="truncate text-xs text-muted">
            {reservation.branchName ?? "Semoet Cafe"}
            {roomLabel ? ` · ${roomLabel}` : ""}
          </p>
        </div>
        <Badge
          label={RESERVATION_STATUS_LABEL[reservation.status] ?? reservation.status}
          tone={RESERVATION_STATUS_TONE[reservation.status] ?? "default"}
          size="sm"
        />
      </div>

      {notice ? (
        <div className="flex items-center gap-2 rounded-[10px] bg-primary-soft px-2.5 py-2">
          <notice.Icon size={15} className="shrink-0 text-primary" />
          <p className="min-w-0 flex-1 text-xs font-semibold text-ink">{notice.text}</p>
          <Badge
            label={`${stage.label}: ${DEPOSIT_STATUS_LABEL[stage.status] ?? stage.status}`}
            tone={DEPOSIT_STATUS_TONE[stage.status] ?? "default"}
            size="sm"
          />
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 border-t border-line pt-2.5">
        <span className="min-w-0 flex-1 truncate text-xs text-muted">
          {formatReservationSchedule(reservation.reservedFor)}
        </span>
        <span className="flex items-center gap-1 text-xs font-bold text-primary">
          <Calendar size={12} />
          {reservation.guestCount} orang
        </span>
      </div>
    </button>
  );
}
