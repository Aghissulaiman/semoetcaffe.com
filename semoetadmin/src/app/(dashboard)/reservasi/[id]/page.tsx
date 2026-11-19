"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import ComponentCard from "@/components/common/ComponentCard";
import { ErrorBlock, LoadingBlock } from "@/components/common/DataState";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import ToneBadge from "@/components/common/ToneBadge";
import DepositPaidDialog from "@/components/reservasi/DepositPaidDialog";
import ReservationStatusForm from "@/components/reservasi/ReservationStatusForm";
import {
  DEFAULT_DEPOSIT_TERMS,
  DEPOSIT_STAGE_LABEL,
  DEPOSIT_STAGE_SHORT,
  type DepositStageKey,
  type DepositTerms,
  depositStages,
  describeDeposit1,
  isFinalStatus,
  paidAmount,
  stageAmount,
  stageInfo,
} from "@/lib/deposit";
import { formatDateTime, formatIdr } from "@/lib/format";
import {
  depositStatusLabel,
  depositStatusTone,
  reservationStatusLabel,
  reservationStatusTone,
} from "@/lib/labels";
import type { AdminReservation, DepositSettings } from "@/types/api";

/**
 * Detail reservasi: ringkasan, data DP, riwayat status, dan form kelola status
 * (terima/tolak, minta DP, unggah bukti transfer).
 */
export default function ReservationDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? null;
  const { data, loading, error, reload } = useApi<AdminReservation>(
    id ? `/admin/reservations/${id}` : null,
  );
  /** Ketentuan DP aktif (bisa diubah di halaman Ketentuan DP). */
  const depositSettings = useApi<DepositSettings>("/admin/reservation-settings");
  const terms = depositSettings.data ?? DEFAULT_DEPOSIT_TERMS;
  /** Tahap DP yang dibayar pelanggan di aplikasi & menunggu konfirmasi. */
  const [paidStage, setPaidStage] = useState<DepositStageKey | null>(null);

  // Muat ulang otomatis selama ada tahap DP menunggu verifikasi, supaya badge
  // ikut berubah begitu pelanggan membayar/mengunggah bukti transfer.
  const hasPendingStage = Boolean(
    data &&
      (data.depositStatus === "pending" ||
        data.deposit2Status === "pending" ||
        data.settlementStatus === "pending"),
  );

  useEffect(() => {
    if (!hasPendingStage) return;
    const timer = setInterval(reload, 8000);
    return () => clearInterval(timer);
  }, [hasPendingStage, reload]);

  /** Nominal ketiga tahap DP + penjelasan aturan harga DP1. */
  const staged = depositStages(data?.totalEstimateIdr ?? 0, terms);
  const dp1Rule = describeDeposit1(data?.totalEstimateIdr ?? 0, terms);

  return (
    <div>
      <PageBreadCrumb pageTitle="Detail Reservasi" />

      <div className="mb-4">
        <Link
          href="/reservasi"
          className="text-theme-sm font-medium text-coffee-brown hover:underline dark:text-coffee-caramel"
        >
          ← Kembali ke daftar reservasi
        </Link>
      </div>

      {loading && <LoadingBlock />}
      {error && <ErrorBlock message={error} onRetry={reload} />}

      {data && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <ComponentCard title="Kelola Status & DP" desc="Terima reservasi, minta DP, lalu tandai lunas.">
              <ReservationStatusForm reservation={data} terms={terms} onSaved={reload} />
            </ComponentCard>

            <ComponentCard title="Riwayat Status" desc="Jejak perubahan status reservasi.">
              {data.history.length === 0 ? (
                <p className="text-theme-sm text-coffee-muted">Belum ada riwayat status.</p>
              ) : (
                <ol className="relative ms-3 space-y-5 border-s border-coffee-linen ps-6 dark:border-coffee-night-border">
                  {data.history.map((item) => (
                    <li key={item.id} className="relative">
                      <span className="absolute -start-[1.9rem] top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-coffee-brown bg-white dark:border-coffee-caramel dark:bg-coffee-night" />
                      <div className="flex flex-wrap items-center gap-2">
                        <ToneBadge tone={reservationStatusTone(item.toStatus)}>
                          {reservationStatusLabel(item.toStatus)}
                        </ToneBadge>
                        {item.fromStatus && (
                          <span className="text-theme-xs text-coffee-muted">
                            dari {reservationStatusLabel(item.fromStatus)}
                          </span>
                        )}
                      </div>
                      {item.note && (
                        <p className="mt-1 text-theme-sm text-coffee-dark dark:text-coffee-cream/80">
                          {item.note}
                        </p>
                      )}
                      <p className="mt-1 text-theme-xs text-coffee-muted">
                        {formatDateTime(item.createdAt)}
                        {item.actorName ? ` · ${item.actorName}` : ""}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </ComponentCard>
          </div>

          <div className="space-y-5">
            <ComponentCard title="Ringkasan">
              <dl className="space-y-3 text-theme-sm">
                <Row label="No. Reservasi" value={data.reservationNumber} />
                <Row label="Cabang" value={data.branchName ?? "-"} />
                <Row label="Pelanggan" value={data.userName ?? "-"} />
                <ContactRow label="Email" value={data.userEmail} type="email" />
                <ContactRow label="Telepon" value={data.userPhone} type="phone" />
                <Row
                  label="Ruangan"
                  value={roomsLabel(data)}
                />
                <Row
                  label="Mulai"
                  value={formatDateTime(data.reservedFor)}
                />
                <Row label="Selesai" value={formatDateTime(data.endsAt)} />
                <Row
                  label="Durasi"
                  value={`${data.durationMinutes} menit (${(data.durationMinutes / 60).toFixed(1).replace(/\.0$/, "")} jam)`}
                />
                <Row label="Jumlah Tamu" value={`${data.guestCount} orang`} />
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-coffee-muted">Status</dt>
                  <dd>
                    <ToneBadge tone={reservationStatusTone(data.status)}>
                      {reservationStatusLabel(data.status)}
                    </ToneBadge>
                  </dd>
                </div>
              </dl>

              {/* Rincian biaya transparan: total sewa + pembagian DP 3 tahap. */}
              <CostBreakdown data={data} terms={terms} />

              {data.rooms.length > 0 && (
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {data.rooms.map((room) => (
                    <div
                      key={room.areaId}
                      className="overflow-hidden rounded-lg border border-coffee-linen dark:border-coffee-night-border"
                    >
                      {room.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={room.imageUrl}
                          alt={room.name}
                          className="h-28 w-full object-cover"
                        />
                      )}
                      <div className="p-2">
                        <p className="text-theme-sm font-medium text-coffee-dark dark:text-coffee-cream/90">
                          {room.name}
                        </p>
                        <p className="text-theme-xs text-coffee-muted">
                          {room.pricePerHourIdr != null
                            ? `${formatIdr(room.pricePerHourIdr)}/jam`
                            : "Harga belum diisi"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {data.specialRequests && (
                <div className="mt-4 rounded-lg bg-coffee-milk p-3 text-theme-sm text-coffee-dark dark:bg-white/5 dark:text-coffee-cream/80">
                  <p className="mb-1 text-theme-xs font-semibold text-coffee-muted">
                    Permintaan Khusus
                  </p>
                  {data.specialRequests}
                </div>
              )}
            </ComponentCard>

            <ComponentCard
              title="Kontak Cabang"
              desc="Hubungi cabang untuk koordinasi ruangan & DP."
            >
              <dl className="space-y-3 text-theme-sm">
                <Row label="Cabang" value={data.branchName ?? "-"} />
                <ContactRow label="Telepon" value={data.branchPhone} type="phone" />
                <ContactRow label="Email" value={data.branchEmail} type="email" />
                <Row label="Alamat" value={data.branchAddress ?? "-"} />
              </dl>
            </ComponentCard>

            <ComponentCard
              title="Pembayaran DP (3 Tahap)"
              desc="DP1 & DP2 dihitung otomatis sistem; pelunasan adalah sisanya. Klik tahap yang lunas untuk mengonfirmasi pembayaran dari aplikasi."
            >
              <div className="space-y-5">
                <StageBlock
                  stage="deposit"
                  title={DEPOSIT_STAGE_LABEL.deposit}
                  hint={`Otomatis ${dp1Rule.label} — ${dp1Rule.note}`}
                  amount={data.depositAmountIdr}
                  fallbackAmount={staged.deposit1}
                  status={data.depositStatus}
                  paidAt={data.depositPaidAt}
                  note={data.depositNote}
                  proofUrl={data.depositProofUrl}
                  canConfirm={canConfirmStage(data, "deposit")}
                  onConfirmPaid={setPaidStage}
                />
                <StageBlock
                  stage="deposit2"
                  title={DEPOSIT_STAGE_LABEL.deposit2}
                  hint={`Otomatis ${terms.dp2Percent}% dari sisa setelah DP1. Terbuka setelah reservasi dikonfirmasi.`}
                  amount={data.deposit2AmountIdr}
                  fallbackAmount={staged.deposit2}
                  status={data.deposit2Status}
                  paidAt={data.deposit2PaidAt}
                  note={data.deposit2Note}
                  proofUrl={data.deposit2ProofUrl}
                  canConfirm={canConfirmStage(data, "deposit2")}
                  onConfirmPaid={setPaidStage}
                />
                <StageBlock
                  stage="settlement"
                  title={DEPOSIT_STAGE_LABEL.settlement}
                  hint="Sisa total setelah DP1 + DP2."
                  amount={data.settlementAmountIdr}
                  fallbackAmount={staged.settlement}
                  status={data.settlementStatus}
                  paidAt={data.settlementPaidAt}
                  note={data.settlementNote}
                  proofUrl={data.settlementProofUrl}
                  canConfirm={canConfirmStage(data, "settlement")}
                  onConfirmPaid={setPaidStage}
                />
              </div>
            </ComponentCard>
          </div>
        </div>
      )}

      {/* Pop-up konfirmasi DP yang sudah dibayar pelanggan di aplikasi. */}
      <DepositPaidDialog
        reservation={data ?? null}
        stage={paidStage}
        onClose={() => setPaidStage(null)}
        onConfirmed={reload}
      />
    </div>
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

/**
 * Rincian biaya transparan: harga per jam tiap ruangan, order menu
 * (makanan/minuman), total yang dibayar, pembagian DP1/DP2/pelunasan, lalu
 * berapa yang sudah dibayar dan sisanya.
 */
function CostBreakdown({ data, terms }: { data: AdminReservation; terms: DepositTerms }) {
  const total = data.totalEstimateIdr ?? 0;
  const staged = {
    deposit1: stageAmount(data, "deposit", terms),
    deposit2: stageAmount(data, "deposit2", terms),
    settlement: stageAmount(data, "settlement", terms),
  };
  const dp1Rule = describeDeposit1(total, terms);
  const hours = data.durationMinutes > 0 ? data.durationMinutes / 60 : 0;
  const paid = paidAmount(data);
  const remaining = Math.max(0, total - paid);
  /** Sewa ruangan saja (tanpa order menu). */
  const roomTotal = data.roomTotalIdr ?? 0;
  /** Order makanan/minuman yang ikut dibayar dalam DP. */
  const menuTotal = data.menuTotalIdr ?? 0;
  const menuItems = data.menuItems ?? [];

  return (
    <div className="mt-4 space-y-2 rounded-lg border border-coffee-linen bg-coffee-milk/60 p-3 text-theme-sm dark:border-coffee-night-border dark:bg-white/5">
      <p className="font-semibold text-coffee-espresso dark:text-coffee-cream">Rincian Biaya</p>

      {data.rooms.length > 0 ? (
        data.rooms.map((room) => (
          <div key={room.areaId} className="flex items-start justify-between gap-3">
            <dt className="text-coffee-muted">
              {room.name}
              {room.pricePerHourIdr != null && hours > 0
                ? ` · ${formatIdr(room.pricePerHourIdr)}/jam × ${hours} jam`
                : ""}
            </dt>
            <dd className="text-end font-medium text-coffee-dark dark:text-coffee-cream/90">
              {room.pricePerHourIdr != null && hours > 0
                ? formatIdr(Math.round(room.pricePerHourIdr * hours))
                : "Harga belum diisi"}
            </dd>
          </div>
        ))
      ) : (
        <Row label="Ruangan" value="Belum ditetapkan" />
      )}

      <div className="flex items-start justify-between gap-3 border-t border-coffee-linen pt-2 dark:border-coffee-night-border">
        <dt className="font-medium text-coffee-dark dark:text-coffee-cream">Sewa Ruangan</dt>
        <dd className="text-end font-semibold text-coffee-espresso dark:text-coffee-cream">
          {formatIdr(roomTotal)}
        </dd>
      </div>

      {menuItems.length > 0 ? (
        <>
          <p className="pt-1 text-theme-xs font-semibold text-coffee-muted">Order Menu</p>
          {menuItems.map((item) => (
            <div key={item.id} className="flex items-start justify-between gap-3">
              <dt className="text-coffee-muted">
                {item.productName}
                {item.variantName ? ` · ${item.variantName}` : ""} ×{item.quantity}
              </dt>
              <dd className="text-end font-medium text-coffee-dark dark:text-coffee-cream/90">
                {formatIdr(item.lineTotalIdr ?? 0)}
              </dd>
            </div>
          ))}
          <div className="flex items-start justify-between gap-3">
            <dt className="font-medium text-coffee-dark dark:text-coffee-cream">Total Order Menu</dt>
            <dd className="text-end font-semibold text-coffee-espresso dark:text-coffee-cream">
              {formatIdr(menuTotal)}
            </dd>
          </div>
        </>
      ) : null}

      <div className="flex items-start justify-between gap-3 border-t border-coffee-linen pt-2 dark:border-coffee-night-border">
        <dt className="font-medium text-coffee-dark dark:text-coffee-cream">
          Total Dibayar (Sewa + Menu)
        </dt>
        <dd className="text-end font-semibold text-coffee-espresso dark:text-coffee-cream">
          {data.totalEstimateIdr != null ? formatIdr(data.totalEstimateIdr) : "Belum dihitung"}
        </dd>
      </div>

      {data.totalEstimateIdr != null && (
        <>
          <Row label="DP1 · Uang muka awal" value={formatIdr(staged.deposit1)} />
          <Row
            label={`DP2 · Setelah konfirmasi (${terms.dp2Percent}% dari sisa)`}
            value={formatIdr(staged.deposit2)}
          />
          <Row label="Pelunasan (sisa)" value={formatIdr(staged.settlement)} />
          <p className="rounded-lg bg-white/60 px-3 py-2 text-theme-xs text-coffee-muted dark:bg-white/5">
            {dp1Rule.note}
          </p>
        </>
      )}

      <div className="flex items-start justify-between gap-3 border-t border-coffee-linen pt-2 dark:border-coffee-night-border">
        <dt className="font-medium text-coffee-success">Sudah Dibayar</dt>
        <dd className="text-end font-semibold text-coffee-success">{formatIdr(paid)}</dd>
      </div>
      <div className="flex items-start justify-between gap-3">
        <dt className="font-medium text-coffee-dark dark:text-coffee-cream">Sisa Tagihan</dt>
        <dd
          className={`text-end font-semibold ${
            remaining > 0 ? "text-coffee-danger" : "text-coffee-success"
          }`}
        >
          {remaining > 0 ? formatIdr(remaining) : "Lunas"}
        </dd>
      </div>
    </div>
  );
}

/** Nama ruangan yang dipesan; jatuh ke kode meja lama bila reservasi lama. */
function roomsLabel(reservation: AdminReservation): string {
  if (reservation.rooms.length > 0) {
    return reservation.rooms.map((room) => room.name).join(", ");
  }
  if (reservation.tables.length > 0) return reservation.tables.join(", ");
  return "Belum ditetapkan";
}

/**
 * Apakah tahap DP ini boleh dikonfirmasi staff lewat pop-up?
 * Hanya kalau pelanggan sudah membayar di aplikasi dan reservasi belum final.
 */
function canConfirmStage(
  reservation: AdminReservation,
  stage: DepositStageKey,
): boolean {
  if (isFinalStatus(reservation.status)) return false;
  return stageInfo(reservation, stage).status === "paid";
}

/** Blok satu tahap DP: nominal, status, waktu bayar, catatan, dan bukti transfer. */
function StageBlock({
  stage,
  title,
  hint,
  amount,
  fallbackAmount,
  status,
  paidAt,
  note,
  proofUrl,
  canConfirm,
  onConfirmPaid,
}: {
  /** Tahap DP ini (untuk membuka pop-up konfirmasi). */
  stage: DepositStageKey;
  title: string;
  hint: string;
  amount: number | null;
  /** Nominal hasil hitung sistem; dipakai bila kolom nominal belum terisi. */
  fallbackAmount?: number;
  status: string;
  paidAt: string | null;
  note: string | null;
  proofUrl: string | null;
  /** Boleh dikonfirmasi staff? (hanya kalau sudah dibayar & reservasi belum final) */
  canConfirm: boolean;
  /** Dipanggil saat admin memverifikasi pembayaran di aplikasi. */
  onConfirmPaid: (stage: DepositStageKey) => void;
}) {
  const effective = amount ?? fallbackAmount ?? null;
  return (
    <div className="rounded-lg border border-coffee-linen p-3 dark:border-coffee-night-border">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-theme-sm font-semibold text-coffee-dark dark:text-coffee-cream/90">
            {title}
          </p>
          <p className="text-theme-xs text-coffee-muted">{hint}</p>
        </div>
        <ToneBadge tone={depositStatusTone(status)}>{depositStatusLabel(status)}</ToneBadge>
      </div>
      <dl className="space-y-2 text-theme-sm">
        <Row
          label="Nominal"
          value={effective != null ? formatIdr(effective) : "Belum ditentukan"}
        />
        <Row label="Dibayar" value={formatDateTime(paidAt)} />
        <Row label="Catatan" value={note ?? "-"} />
      </dl>
      {canConfirm && (
        <button
          type="button"
          onClick={() => onConfirmPaid(stage)}
          title={`${DEPOSIT_STAGE_SHORT[stage]} sudah dibayar di aplikasi — klik untuk mengonfirmasi`}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-coffee-success/40 bg-coffee-success/10 px-3 py-2 text-theme-sm font-semibold text-coffee-success transition-colors hover:bg-coffee-success/20"
        >
          Konfirmasi pembayaran dari aplikasi
        </button>
      )}
      {proofUrl && (
        <a
          href={proofUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 block overflow-hidden rounded-lg border border-coffee-linen dark:border-coffee-night-border"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={proofUrl} alt={`Bukti ${title}`} className="max-h-48 w-full object-cover" />
        </a>
      )}
    </div>
  );
}

/** Baris kontak: kosong → "-", terisi → tautan tel:/mailto: yang bisa diklik. */
function ContactRow({
  label,
  value,
  type,
}: {
  label: string;
  value: string | null;
  type: "email" | "phone";
}) {
  if (!value) {
    return <Row label={label} value="-" />;
  }
  const href = type === "email" ? `mailto:${value}` : `tel:${value.replace(/[^+\d]/g, "")}`;
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-coffee-muted">{label}</dt>
      <dd className="text-end font-medium">
        <a
          href={href}
          className="text-coffee-brown hover:underline dark:text-coffee-caramel"
        >
          {value}
        </a>
      </dd>
    </div>
  );
}
