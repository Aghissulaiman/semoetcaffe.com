"use client";

import AppModal from "@/components/common/AppModal";
import { ApiError, apiPatch } from "@/lib/client";
import {
  DEPOSIT_STAGE_LABEL,
  DEPOSIT_STAGE_SHORT,
  type DepositStageKey,
  isFinalStatus,
  stageInfo,
} from "@/lib/deposit";
import { formatDateTime, formatIdr } from "@/lib/format";
import { primaryButtonClass, secondaryButtonClass } from "@/lib/ui";
import type { AdminReservation } from "@/types/api";
import { useState } from "react";

interface DepositPaidDialogProps {
  reservation: AdminReservation | null;
  /** Tahap DP yang dibayar pelanggan di aplikasi. */
  stage: DepositStageKey | null;
  onClose: () => void;
  /** Dipanggil setelah konfirmasi berhasil (untuk memuat ulang data). */
  onConfirmed: () => void;
}

/**
 * Pop-up konfirmasi pembayaran DP yang sudah dibayar pelanggan di aplikasi.
 *
 * Admin membuka pop-up ini dengan mengeklik badge DP yang bertanda lunas di
 * daftar reservasi (atau kartu DP di halaman detail). Setelah dipastikan uang
 * masuk, admin menekan "Ya, Sudah Diterima" — untuk DP1 pada reservasi yang
 * masih "Diajukan", reservasi sekaligus dikonfirmasi sehingga pelanggan bisa
 * lanjut membayar DP2.
 */
export default function DepositPaidDialog({
  reservation,
  stage,
  onClose,
  onConfirmed,
}: DepositPaidDialogProps) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = Boolean(reservation && stage);
  const info = reservation && stage ? stageInfo(reservation, stage) : null;
  const amountIdr = info?.amountIdr ?? 0;
  const isFinal = reservation ? isFinalStatus(reservation.status) : false;
  /** Reservasi masih "Diajukan" & yang dibayar DP1 → sekaligus dikonfirmasi. */
  const alsoConfirm =
    reservation?.status === "requested" && stage === "deposit" && !isFinal;

  const confirm = async () => {
    if (!reservation || !stage) return;
    setWorking(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (alsoConfirm) {
        body.status = "confirmed";
        body.note = `DP1 dibayar pelanggan di aplikasi (${formatIdr(amountIdr)}). Reservasi dikonfirmasi staff.`;
      } else {
        body.note = `Pembayaran ${DEPOSIT_STAGE_SHORT[stage]} (${formatIdr(amountIdr)}) dibayar pelanggan di aplikasi dan sudah diverifikasi staff.`;
      }
      await apiPatch(`/admin/reservations/${reservation.id}`, body);
      onConfirmed();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memproses konfirmasi");
    } finally {
      setWorking(false);
    }
  };

  return (
    <AppModal
      isOpen={open}
      onClose={() => (working ? undefined : onClose())}
      title={stage ? `Konfirmasi ${DEPOSIT_STAGE_SHORT[stage]}?` : "Konfirmasi pembayaran"}
      desc="Pelanggan sudah membayar lewat aplikasi. Pastikan uang sudah masuk sebelum konfirmasi."
      size="sm"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass} disabled={working}>
            Batal
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            className={primaryButtonClass}
            disabled={working}
          >
            {working ? "Memproses…" : "Ya, Sudah Diterima"}
          </button>
        </>
      }
    >
      {reservation && stage && info ? (
        <div className="space-y-4">
          {error && (
            <div className="rounded-xl border border-coffee-danger/30 bg-coffee-danger/5 px-4 py-3 text-theme-sm text-coffee-danger">
              {error}
            </div>
          )}

          <dl className="space-y-2 text-theme-sm">
            <Row label="No. Reservasi" value={reservation.reservationNumber} />
            <Row label="Pelanggan" value={reservation.userName ?? "-"} />
            <Row label="Ruangan" value={roomsLabel(reservation)} />
            <Row
              label="Jadwal"
              value={reservation.reservedFor ? formatDateTime(reservation.reservedFor) : "-"}
            />
            <Row label="Tahap" value={DEPOSIT_STAGE_LABEL[stage]} />
            <Row label="Nominal" value={formatIdr(amountIdr)} />
            <Row
              label="Total tagihan (sewa + menu)"
              value={
                reservation.totalEstimateIdr != null
                  ? formatIdr(reservation.totalEstimateIdr)
                  : "Belum dihitung"
              }
            />
            <Row
              label="Dibayar pada"
              value={info.paidAt ? formatDateTime(info.paidAt) : "Tidak dicatat"}
            />
            {info.note && <Row label="Catatan" value={info.note} />}
          </dl>

          {info.proofUrl && (
            <a
              href={info.proofUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block overflow-hidden rounded-lg border border-coffee-linen dark:border-coffee-night-border"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={info.proofUrl}
                alt={`Bukti ${DEPOSIT_STAGE_SHORT[stage]}`}
                className="max-h-56 w-full object-cover"
              />
            </a>
          )}

          <p className="rounded-xl border border-coffee-linen bg-coffee-milk px-4 py-3 text-theme-sm text-coffee-muted dark:border-coffee-night-border dark:bg-white/5">
            {alsoConfirm
              ? "Menekan tombol ini menandai DP1 lunas dan mengonfirmasi reservasi, lalu pelanggan bisa membayar DP2."
              : "Menekan tombol ini mencatat bahwa pembayaran sudah diterima dan menambah catatan ke riwayat reservasi."}
          </p>
        </div>
      ) : null}
    </AppModal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-coffee-muted">{label}</dt>
      <dd className="text-end font-medium text-coffee-dark dark:text-coffee-cream/90">{value}</dd>
    </div>
  );
}

/** Nama ruangan yang dipesan; jatuh ke kode meja lama bila reservasi lama. */
function roomsLabel(reservation: AdminReservation): string {
  if (reservation.rooms.length > 0) {
    return reservation.rooms.map((room) => room.name).join(", ");
  }
  if (reservation.tables.length > 0) return reservation.tables.join(", ");
  return "-";
}
