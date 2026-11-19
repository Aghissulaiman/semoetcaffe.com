"use client";

/**
 * Detail reservasi — status, jadwal, ruangan, rincian biaya, pembayaran DP
 * 3 tahap, unggah bukti transfer, riwayat, dan pembatalan.
 */
import {
  AlertCircle,
  CheckCheck,
  CheckCircle2,
  Clock,
  CloudUpload,
  Coffee,
  CreditCard,
  FileText,
  Hourglass,
  Image as ImageIcon,
  MapPin,
  PieChart,
  RefreshCw,
  Ribbon,
  ShieldCheck,
  Store,
  Users,
  Wallet,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AppDialog } from "@/components/ui/app-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Loader } from "@/components/ui/loader";
import { ScreenHeader } from "@/components/ui/screen-header";
import { ScreenHeading } from "@/components/ui/screen-heading";
import {
  computeDepositStages,
  DEPOSIT_STATUS_LABEL,
  DEPOSIT_STATUS_TONE,
  describeDeposit1,
  formatDateTime,
  formatReservationSchedule,
  formatRupiah,
  formatTimeWib,
  RESERVATION_STATUS_LABEL,
  RESERVATION_STATUS_TONE,
} from "@/lib/format";
import { apiErrorFrom } from "@/services/client";
import { verifyPayment } from "@/services/payment.service";
import {
  cancelReservation,
  createReservationDepositCharge,
  getReservation,
  uploadReservationDepositProof,
  type ReservationDepositStage,
} from "@/services/reservation.service";
import { useAuthStore } from "@/store/auth-store";

import type { DepositStatus, Reservation, ReservationHistory } from "@/types/api";

/** Status yang masih bisa dibatalkan sendiri oleh pelanggan. */
const CANCELLABLE: Reservation["status"][] = ["requested", "confirmed"];

const SEATING_LABEL: Record<string, string> = {
  indoor: "Indoor",
  outdoor: "Outdoor",
  private_room: "Ruang privat",
  any: "Bebas",
};

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon size={17} className="mt-px shrink-0 text-primary" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-xs text-muted">{label}</p>
        <p className="text-sm font-semibold text-ink">{value}</p>
      </div>
    </div>
  );
}

/** Baca file gambar menjadi base64 tanpa prefix data URL. */
function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("Gagal membaca gambar. Coba pilih foto lain ya."));
    reader.readAsDataURL(file);
  });
}

/** Buka dialog pilih file gambar dari perangkat. */
function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

export default function ReservationDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const status = useAuthStore((state) => state.status);

  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [history, setHistory] = useState<ReservationHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  /** Tahap DP yang sedang dibayar (untuk spinner di tombol). */
  const [payingStage, setPayingStage] = useState<ReservationDepositStage | null>(null);
  /** Tahap DP yang sedang diunggah bukti transfernya. */
  const [uploadingStage, setUploadingStage] = useState<ReservationDepositStage | null>(null);

  // Guard login.
  useEffect(() => {
    if (status === "guest") router.replace("/auth/login");
  }, [status, router]);

  const load = useCallback(
    async (showSpinner = true) => {
      if (!id) return;
      if (showSpinner) setLoading(true);
      setError(null);
      try {
        const detail = await getReservation(id);
        setReservation(detail.reservation);
        setHistory(detail.history);
      } catch (err) {
        setError(apiErrorFrom(err, "Gagal memuat reservasi"));
      } finally {
        setLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load(false);
    setRefreshing(false);
  };

  // Auto-refresh selama reservasi masih aktif / ada tahap DP menunggu verifikasi.
  const allStagesPaid =
    reservation != null &&
    reservation.depositStatus === "paid" &&
    reservation.deposit2Status === "paid" &&
    reservation.settlementStatus === "paid";
  const shouldPoll =
    reservation != null &&
    !["cancelled", "no_show", "completed"].includes(reservation.status) &&
    (!allStagesPaid || reservation.status === "requested");
  useEffect(() => {
    if (!shouldPoll) return;
    const timer = setInterval(() => {
      void load(false);
    }, 15_000);
    return () => clearInterval(timer);
  }, [shouldPoll, load]);

  // Muat ulang saat pelanggan kembali dari tab pembayaran Midtrans.
  useEffect(() => {
    const onFocus = () => void load(false);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const doCancel = async () => {
    if (!reservation) return;
    setBusy(true);
    setActionError(null);
    try {
      await cancelReservation(reservation.id, "Dibatalkan oleh pelanggan");
      setConfirmVisible(false);
      await load(false);
    } catch (err) {
      setActionError(apiErrorFrom(err, "Gagal membatalkan reservasi"));
      setConfirmVisible(false);
    } finally {
      setBusy(false);
    }
  };

  /** Buat charge Midtrans untuk tahap DP lalu buka halaman pembayaran. */
  const payStage = async (stage: ReservationDepositStage) => {
    if (!reservation) return;
    setPayingStage(stage);
    setActionError(null);
    setSuccessMessage(null);
    // Buka tab pembayaran sejak awal agar tidak diblokir popup blocker.
    let payTab: Window | null = null;
    try {
      payTab = window.open("about:blank", "_blank");
    } catch {
      payTab = null;
    }
    try {
      const { payment } = await createReservationDepositCharge(reservation.id, stage);
      if (!payment.paymentUrl) {
        payTab?.close();
        throw new Error("Link pembayaran tidak tersedia. Coba lagi ya.");
      }
      if (payTab) payTab.location.href = payment.paymentUrl;
      else window.open(payment.paymentUrl, "_blank", "noopener,noreferrer");

      // Webhook Midtrans menandai tahap ini lunas. Midtrans butuh beberapa saat
      // menetapkan `settlement`, jadi polling status sampai berubah.
      // Banyak gateway butuh waktu lebih dari 24 detik, jadi kita polling
      // sampai 15 kali (45 detik) atau hingga isFinal menjadi true.
      let isFinal = false;
      for (let attempt = 0; attempt < 15; attempt += 1) {
        const verified = await verifyPayment(payment.id).catch(() => null);
        if (verified?.isFinal) {
          isFinal = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
      // Pastikan halaman dimuat ulang untuk mencerminkan status terbaru dari Midtrans.
      await load(false);

      // Memberi tahu user hasil pembayaran (via alert agar jelas di saat reload).
      if (isFinal) {
        alert("Pembayaran DP " + stageLabel(stage) + " berhasil diterima oleh sistem!");
      } else {
        alert("Pembayaran DP " + stageLabel(stage) + " masih diproses oleh gateway. Silakan cek kembali di menu reservasi Anda setelah beberapa menit.");
      }
    } catch (err) {
      payTab?.close();
      setActionError(apiErrorFrom(err, "Gagal membuat pembayaran"));
    } finally {
      setPayingStage(null);
    }
  };

  /**
   * Pelanggan memilih foto bukti transfer dari perangkat lalu mengunggahnya ke
   * server. Hanya bisa setelah tahap pembayaran lunas.
   */
  const uploadProof = async (stage: ReservationDepositStage) => {
    if (!reservation) return;
    setActionError(null);
    setSuccessMessage(null);
    try {
      const file = await pickImageFile();
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        throw new Error("Ukuran gambar terlalu besar. Maksimal 5 MB ya.");
      }

      setUploadingStage(stage);
      const base64 = await readAsBase64(file);
      await uploadReservationDepositProof(reservation.id, stage, base64, {
        contentType: file.type || "image/jpeg",
      });
      setSuccessMessage("Bukti transfer kamu sudah dikirim. Terima kasih!");
      await load(false);
    } catch (err) {
      setActionError(apiErrorFrom(err, "Gagal mengunggah bukti transfer"));
    } finally {
      setUploadingStage(null);
    }
  };

  if (status === "loading" || loading) return <Loader label="Memuat reservasi…" />;

  if (error || !reservation) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-4">
        <ScreenHeader title="Detail Reservasi" onBack={() => router.back()} />
        <ErrorState message={error ?? "Reservasi tidak ditemukan"} onRetry={() => void load()} />
      </div>
    );
  }

  const cancellable = CANCELLABLE.includes(reservation.status);
  const breakdown = computeDepositStages(reservation.totalEstimateIdr ?? 0);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <ScreenHeading
          title={reservation.reservationNumber}
          subtitle={reservation.branchName ?? "Semoet Cafe"}
          onBack={() => router.back()}
          className="flex-1"
        />
        <button
          type="button"
          onClick={() => void refresh()}
          aria-label="Muat ulang"
          className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary transition hover:bg-cream focus-ring">
          <RefreshCw size={17} className={refreshing ? "animate-spin" : undefined} />
        </button>
      </div>

      <div className="flex flex-col gap-3.5">
        <NoticeBanner reservation={reservation} />

        <Card>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-extrabold text-ink">Status</h2>
            <Badge
              label={RESERVATION_STATUS_LABEL[reservation.status] ?? reservation.status}
              tone={RESERVATION_STATUS_TONE[reservation.status] ?? "default"}
            />
          </div>
          <div className="mt-3 flex flex-col gap-3">
            <Row
              icon={Clock}
              label="Waktu sewa"
              value={
                reservation.endsAt
                  ? `${formatReservationSchedule(reservation.reservedFor)} · ${formatTimeWib(reservation.reservedFor)}–${formatTimeWib(reservation.endsAt)}`
                  : formatReservationSchedule(reservation.reservedFor)
              }
            />
            {reservation.durationMinutes > 0 ? (
              <Row
                icon={Hourglass}
                label="Durasi"
                value={`${reservation.durationMinutes} menit (${(reservation.durationMinutes / 60).toFixed(1).replace(/\.0$/, "")} jam)`}
              />
            ) : null}
            <Row icon={Users} label="Jumlah tamu" value={`${reservation.guestCount} orang`} />
            {reservation.rooms.length > 0 ? (
              <Row
                icon={MapPin}
                label="Ruangan"
                value={reservation.rooms.map((room) => room.name).join(", ")}
              />
            ) : reservation.areaName ? (
              <Row icon={MapPin} label="Ruangan" value={reservation.areaName} />
            ) : reservation.seatingPreference ? (
              <Row
                icon={MapPin}
                label="Preferensi tempat"
                value={SEATING_LABEL[reservation.seatingPreference] ?? reservation.seatingPreference}
              />
            ) : null}
          </div>
        </Card>

        {/* Rincian biaya transparan. */}
        {reservation.totalEstimateIdr != null ? (
          <CostBreakdown reservation={reservation} />
        ) : null}

        {/* Uang muka (DP 3 tahap). */}
        {canShowPayment(reservation) ? (
          <Card>
            <h2 className="text-[15px] font-extrabold text-ink">Pembayaran (DP)</h2>
            <p className="mt-1.5 text-xs leading-[18px] text-muted">
              DP1 dihitung otomatis oleh sistem: 30% dari total (sewa ruangan + order menu), minimal
              Rp300.000, maksimal Rp500.000, dan wajib dibayar lewat Midtrans. Setelah itu DP2 = 30%
              dari sisa, terbuka setelah reservasi dikonfirmasi staff, lalu pelunasan adalah
              sisanya.
            </p>
            <div className="mt-3 flex flex-col gap-3">
              <DepositStage
                title="DP1 · Uang muka awal"
                stage="deposit"
                amountIdr={reservation.depositAmountIdr ?? breakdown.deposit1}
                status={reservation.depositStatus}
                paidAt={reservation.depositPaidAt}
                note={reservation.depositNote}
                proofUrl={reservation.depositProofUrl}
                paying={payingStage === "deposit"}
                uploading={uploadingStage === "deposit"}
                canPay={canPayStage(reservation, "deposit")}
                canUpload={canUploadProof(reservation, "deposit")}
                onPay={() => void payStage("deposit")}
                onUpload={() => void uploadProof("deposit")}
              />
              <DepositStage
                title="DP2 · Setelah konfirmasi"
                stage="deposit2"
                amountIdr={reservation.deposit2AmountIdr ?? breakdown.deposit2}
                status={reservation.deposit2Status}
                paidAt={reservation.deposit2PaidAt}
                note={reservation.deposit2Note}
                proofUrl={reservation.deposit2ProofUrl}
                paying={payingStage === "deposit2"}
                uploading={uploadingStage === "deposit2"}
                canPay={canPayStage(reservation, "deposit2")}
                canUpload={canUploadProof(reservation, "deposit2")}
                onPay={() => void payStage("deposit2")}
                onUpload={() => void uploadProof("deposit2")}
              />
              <DepositStage
                title="Pelunasan"
                stage="settlement"
                amountIdr={reservation.settlementAmountIdr ?? breakdown.settlement}
                status={reservation.settlementStatus}
                paidAt={reservation.settlementPaidAt}
                note={reservation.settlementNote}
                proofUrl={reservation.settlementProofUrl}
                paying={payingStage === "settlement"}
                uploading={uploadingStage === "settlement"}
                canPay={canPayStage(reservation, "settlement")}
                canUpload={canUploadProof(reservation, "settlement")}
                onPay={() => void payStage("settlement")}
                onUpload={() => void uploadProof("settlement")}
              />
            </div>
          </Card>
        ) : null}

        <Card>
          <h2 className="text-[15px] font-extrabold text-ink">Cabang</h2>
          <div className="mt-2.5 flex flex-col gap-3">
            <Row icon={Store} label="Nama" value={reservation.branchName ?? "Semoet Cafe"} />
            {reservation.branchAddress ? (
              <Row icon={MapPin} label="Alamat" value={reservation.branchAddress} />
            ) : null}
          </div>
        </Card>

        {/* Riwayat status */}
        {history.length > 0 ? (
          <Card>
            <h2 className="text-[15px] font-extrabold text-ink">Riwayat reservasi</h2>
            <div className="mt-3 flex flex-col">
              {history.map((item, index) => (
                <div key={item.id} className="flex gap-2.5">
                  <div className="flex w-[18px] flex-col items-center">
                    <span
                      className={
                        index === 0
                          ? "mt-1 h-2.5 w-2.5 rounded-full bg-primary"
                          : "mt-1 h-2.5 w-2.5 rounded-full bg-line"
                      }
                    />
                    {index < history.length - 1 ? (
                      <span className="mt-0.5 w-0.5 flex-1 bg-line" />
                    ) : null}
                  </div>
                  <div className="flex flex-1 flex-col gap-0.5 pb-2.5">
                    <p className="text-[13px] font-bold text-ink">
                      {RESERVATION_STATUS_LABEL[item.toStatus] ?? item.toStatus}
                    </p>
                    {item.note ? (
                      <p className="text-xs leading-[18px] text-muted">{item.note}</p>
                    ) : null}
                    <p className="text-[11px] text-muted">
                      {formatDateTime(item.createdAt)}
                      {item.actorName ? ` · ${item.actorName}` : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        {reservation.specialRequests ? (
          <Card>
            <h2 className="text-[15px] font-extrabold text-ink">Catatan & permintaan</h2>
            <p className="mt-1.5 whitespace-pre-line text-[13px] leading-5 text-muted">
              {reservation.specialRequests}
            </p>
          </Card>
        ) : null}

        {reservation.createdAt ? (
          <p className="text-center text-xs text-muted">
            Dibuat {formatDateTime(reservation.createdAt)}
          </p>
        ) : null}

        {successMessage ? (
          <Badge label={successMessage} tone="success" className="self-center" />
        ) : null}
        {actionError ? <Badge label={actionError} tone="danger" className="self-center" /> : null}

        {cancellable ? (
          <Button
            title="Batalkan Reservasi"
            icon={XCircle}
            variant="danger"
            onClick={() => setConfirmVisible(true)}
          />
        ) : null}
      </div>

      <AppDialog
        visible={confirmVisible}
        onClose={() => (busy ? undefined : setConfirmVisible(false))}
        title="Batalkan reservasi?"
        message={`Reservasi ${reservation.reservationNumber} akan dibatalkan. Tindakan ini tidak bisa dibatalkan.`}
        icon={AlertCircle}
        tone="danger"
        confirmLabel="Ya, batalkan"
        confirmVariant="danger"
        confirmLoading={busy}
        cancelLabel="Tidak jadi"
        onConfirm={() => void doCancel()}
      />
    </div>
  );
}

/** Apakah kartu pembayaran DP perlu ditampilkan. */
function canShowPayment(reservation: Reservation): boolean {
  return (
    reservation.status !== "cancelled" &&
    reservation.status !== "no_show" &&
    reservation.status !== "completed"
  );
}

/** Rincian biaya: sewa ruangan, order menu, total, DP, sudah dibayar & sisa. */
function CostBreakdown({ reservation }: { reservation: Reservation }) {
  const total = reservation.totalEstimateIdr ?? 0;
  const stages = computeDepositStages(total);
  const dp1Rule = describeDeposit1(total);
  const hours = reservation.durationMinutes > 0 ? reservation.durationMinutes / 60 : 0;
  const roomTotal = reservation.roomTotalIdr ?? 0;
  const menuTotal = reservation.menuTotalIdr ?? 0;
  const menuItems = reservation.menuItems ?? [];

  const paidOf = (amount: number | null, status: DepositStatus) =>
    status === "paid" ? (amount ?? 0) : 0;
  const paid =
    paidOf(reservation.depositAmountIdr, reservation.depositStatus) +
    paidOf(reservation.deposit2AmountIdr, reservation.deposit2Status) +
    paidOf(reservation.settlementAmountIdr, reservation.settlementStatus);
  const remaining = Math.max(0, total - paid);

  return (
    <Card>
      <h2 className="text-[15px] font-extrabold text-ink">Rincian biaya</h2>
      <div className="mt-2 flex flex-col gap-2">
        {reservation.rooms.map((room) => (
          <CostLine
            key={room.areaId}
            label={
              room.pricePerHourIdr != null && hours > 0
                ? `${room.name} · ${formatRupiah(room.pricePerHourIdr)}/jam × ${hours} jam`
                : room.name
            }
            value={
              room.pricePerHourIdr != null && hours > 0
                ? formatRupiah(Math.round(room.pricePerHourIdr * hours))
                : "Harga belum diisi"
            }
          />
        ))}

        {reservation.rooms.length === 0 && reservation.areaName ? (
          <CostLine label={reservation.areaName} value={formatRupiah(roomTotal)} />
        ) : null}

        {menuItems.length > 0 ? (
          <>
            <Divider />
            <p className="text-xs font-bold text-ink">Order menu</p>
            {menuItems.map((item) => (
              <CostLine
                key={item.id}
                label={`${item.productName}${item.variantName ? ` · ${item.variantName}` : ""} x${item.quantity}`}
                value={formatRupiah(item.lineTotalIdr ?? 0)}
              />
            ))}
            <CostLine label="Total order menu" value={formatRupiah(menuTotal)} strong />
          </>
        ) : null}

        <Divider />
        <CostLine
          label={`Sewa ruangan (${reservation.durationMinutes} menit)`}
          value={formatRupiah(roomTotal)}
        />
        <CostLine label="Total dibayar (sewa + menu)" value={formatRupiah(total)} strong />
        <CostLine label={dp1Rule.label} value={formatRupiah(stages.deposit1)} />
        <p className="text-[11px] leading-4 text-muted">{dp1Rule.note}</p>
        <CostLine label="DP2 · 30% dari sisa" value={formatRupiah(stages.deposit2)} />
        <CostLine label="Pelunasan" value={formatRupiah(stages.settlement)} />

        <Divider />
        <CostLine label="Sudah dibayar" value={formatRupiah(paid)} valueClass="text-success" />
        <CostLine
          label="Sisa tagihan"
          value={remaining > 0 ? formatRupiah(remaining) : "Lunas"}
          valueClass={remaining > 0 ? "text-danger" : "text-success"}
          strong
        />
      </div>
    </Card>
  );
}

function CostLine({
  label,
  value,
  valueClass,
  strong,
}: {
  label: string;
  value: string;
  valueClass?: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <p className="flex-1 text-[13px] leading-[18px] text-muted">{label}</p>
      <p className={strong ? "text-[13px] font-extrabold text-ink" : "text-[13px] font-semibold text-ink"}>
        <span className={valueClass}>{value}</span>
      </p>
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-line" />;
}

/** Satu baris tahap DP: judul, nominal, status, bukti, aksi bayar. */
function DepositStage({
  title,
  stage,
  amountIdr,
  status,
  paidAt,
  note,
  proofUrl,
  paying,
  uploading,
  canPay,
  canUpload,
  onPay,
  onUpload,
}: {
  title: string;
  stage: ReservationDepositStage;
  amountIdr: number | null;
  status: DepositStatus;
  paidAt: string | null;
  note: string | null;
  proofUrl: string | null;
  paying: boolean;
  uploading: boolean;
  canPay: boolean;
  canUpload: boolean;
  onPay: () => void;
  onUpload: () => void;
}) {
  const paid = status === "paid";
  const hint = payHint(stage, status);
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-bold text-ink">{title}</p>
        <Badge
          label={DEPOSIT_STATUS_LABEL[status] ?? status}
          tone={DEPOSIT_STATUS_TONE[status] ?? "default"}
        />
      </div>
      {amountIdr != null ? (
        <Row
          icon={Wallet}
          label={paid ? "Nominal" : "Nominal yang dibayar"}
          value={formatRupiah(amountIdr)}
        />
      ) : null}
      {paidAt ? <Row icon={CheckCheck} label="Dibayar pada" value={formatDateTime(paidAt)} /> : null}
      {note ? <Row icon={FileText} label="Catatan" value={note} /> : null}

      {/* Belum lunas: tombol bayar via Midtrans. */}
      {!paid && canPay ? (
        <Button
          title={`Bayar ${stageLabel(stage)}${amountIdr != null ? ` · ${formatRupiah(amountIdr)}` : ""}`}
          icon={CreditCard}
          size="sm"
          loading={paying}
          onClick={onPay}
        />
      ) : !paid && hint ? (
        <p className="text-xs leading-[18px] text-muted">{hint}</p>
      ) : !paid ? (
        <p className="text-xs leading-[18px] text-muted">
          {stage === "deposit"
            ? "Bayar DP1 sebelum jadwal agar reservasi diproses staff."
            : "Tahap ini terbuka setelah reservasi dikonfirmasi staff."}
        </p>
      ) : null}

      {/* Sudah lunas: minta pelanggan unggah bukti transfer sebagai konfirmasi. */}
      {paid && !canUpload && hint ? (
        <p className="text-xs leading-[18px] text-muted">{hint}</p>
      ) : null}
      {paid && canUpload ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs leading-[18px] text-muted">
            {proofUrl
              ? "Bukti transfer sudah kamu kirim. Terima kasih!"
              : "Pembayaran berhasil. Unggah bukti transfer sebagai konfirmasi ya."}
          </p>
          {proofUrl ? (
            <a
              href={proofUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-full border border-primary px-3.5 text-[13px] font-bold text-primary transition hover:bg-primary-soft focus-ring">
              <ImageIcon size={15} />
              Lihat bukti transfer
            </a>
          ) : null}
          <Button
            title={proofUrl ? `Ganti bukti ${stageLabel(stage)}` : `Upload bukti ${stageLabel(stage)}`}
            icon={CloudUpload}
            variant={proofUrl ? "outline" : "primary"}
            size="sm"
            loading={uploading}
            onClick={onUpload}
          />
        </div>
      ) : null}
    </div>
  );
}

/** Label singkat tahap DP. */
function stageLabel(stage: ReservationDepositStage): string {
  return stage === "deposit" ? "DP1" : stage === "deposit2" ? "DP2" : "Pelunasan";
}

/** Boleh tidak pelanggan membayar tahap ini sendiri sekarang. */
function canPayStage(reservation: Reservation, stage: ReservationDepositStage): boolean {
  if (reservation.status === "cancelled" || reservation.status === "no_show") return false;
  if (reservation.status === "requested") return stage === "deposit";
  return stage === "deposit" || reservation.status === "confirmed";
}

/** Boleh tidak pelanggan mengunggah bukti transfer untuk tahap ini. */
function canUploadProof(reservation: Reservation, stage: ReservationDepositStage): boolean {
  if (reservation.status === "cancelled" || reservation.status === "no_show") return false;
  return stageStatus(reservation, stage) === "paid";
}

function stageStatus(reservation: Reservation, stage: ReservationDepositStage): DepositStatus {
  if (stage === "deposit") return reservation.depositStatus;
  if (stage === "deposit2") return reservation.deposit2Status;
  return reservation.settlementStatus;
}

/** Petunjuk singkat bila tombol bayar belum muncul. */
function payHint(stage: ReservationDepositStage, status: DepositStatus): string | null {
  if (status === "paid") return null;
  if (status === "pending") return `Pembayaran ${stageLabel(stage)} sedang diproses.`;
  return null;
}

/** Banner notifikasi status di atas kartu status. */
function NoticeBanner({ reservation }: { reservation: Reservation }) {
  const status = reservation.status;
  const { depositStatus, deposit2Status, settlementStatus, depositAmountIdr } = reservation;
  const allPaid =
    depositStatus === "paid" && deposit2Status === "paid" && settlementStatus === "paid";

  let Icon: LucideIcon = AlertCircle;
  let tint = "text-primary";
  let title = "";
  let body = "";

  if (status === "cancelled" || status === "no_show") {
    Icon = XCircle;
    tint = "text-danger";
    title = status === "cancelled" ? "Reservasi dibatalkan" : "Tidak hadir";
    body =
      status === "cancelled"
        ? "Reservasi ini sudah dibatalkan. Kamu bisa membuat reservasi baru kapan saja."
        : "Reservasi ini ditandai tidak hadir oleh staff.";
  } else if (status === "requested") {
    Icon = Hourglass;
    tint = "text-warning";
    title = "Menunggu konfirmasi";
    body = "Reservasi kamu sedang ditinjau staff. Selesaikan DP1 di bawah agar lebih cepat diproses.";
  } else if (status === "confirmed") {
    if (allPaid) {
      Icon = CheckCircle2;
      tint = "text-success";
      title = "Reservasi diterima & lunas";
      body = "Terima kasih! Reservasi kamu sudah terkonfirmasi penuh. Sampai jumpa di Semoet Cafe.";
    } else if (depositStatus !== "paid") {
      Icon = Wallet;
      tint = "text-warning";
      title = "Reservasi diterima — silakan bayar DP1";
      const amount = depositAmountIdr != null ? ` sebesar ${formatRupiah(depositAmountIdr)}` : "";
      body = `Reservasi kamu sudah diterima. Mohon selesaikan DP1${amount} lewat tombol bayar di bawah agar jadwal bisa dikunci.`;
    } else if (deposit2Status !== "paid") {
      Icon = PieChart;
      tint = "text-warning";
      title = "Silakan bayar DP2";
      body = "DP1 sudah diterima. Mohon selesaikan DP2 lewat tombol bayar di bawah agar reservasi makin aman.";
    } else {
      Icon = ShieldCheck;
      tint = "text-warning";
      title = "Silakan lunasi sisa pembayaran";
      body = "DP1 dan DP2 sudah diterima. Selesaikan pelunasan sisa total sewa untuk mengunci jadwal.";
    }
  } else if (status === "seated") {
    Icon = Coffee;
    tint = "text-success";
    title = "Selamat menikmati!";
    body = "Kamu sudah check-in. Nikmati waktu kamu di Semoet Cafe.";
  } else if (status === "completed") {
    Icon = Ribbon;
    tint = "text-success";
    title = "Reservasi selesai";
    body = "Terima kasih sudah berkunjung. Sampai jumpa lagi!";
  } else {
    return null;
  }

  return (
    <div className="flex items-start gap-2.5 rounded-[14px] border border-line bg-primary-soft p-3">
      <Icon size={20} className={`mt-px shrink-0 ${tint}`} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-[13px] font-extrabold text-ink">{title}</p>
        <p className="text-xs leading-[18px] text-muted">{body}</p>
      </div>
    </div>
  );
}
