"use client";

import { ApiError, apiPatch, apiPost } from "@/lib/client";
import { DEFAULT_DEPOSIT_TERMS, stageAmount, type DepositTerms } from "@/lib/deposit";
import { formatIdr } from "@/lib/format";
import { depositStatusLabel } from "@/lib/labels";
import {
  fieldLabelClass,
  inputClass,
  secondaryButtonClass,
  textareaClass,
} from "@/lib/ui";
import AppModal from "@/components/common/AppModal";
import type { AdminReservation, UploadedImage } from "@/types/api";
import { useRef, useState } from "react";

interface ReservationStatusFormProps {
  reservation: AdminReservation;
  /** Ketentuan DP aktif (persentase & batas nominal). */
  terms?: DepositTerms;
  /** Dipanggil setelah simpan berhasil supaya detail dimuat ulang. */
  onSaved: () => void;
}

type DpStage = "deposit" | "deposit2" | "settlement";

/**
 * Form kelola status reservasi + DP 3 tahap. Nominal DP ditetapkan **otomatis
 * oleh sistem**: DP1 = clamp(persen × total, batas minimum, batas maksimum),
 * DP2 = persen × sisa setelah DP1, pelunasan = sisanya. Admin tidak mengisi
 * persen/nominal di sini (diatur di halaman Ketentuan DP).
 *
 * Alur: pelanggan bayar DP1 (Midtrans) → admin **Konfirmasi Reservasi** →
 * pelanggan bisa bayar DP2 → pelunasan. Admin mengurus kehadiran: Tandai
 * Datang (seated) lalu Selesai (completed).
 */
export default function ReservationStatusForm({
  reservation,
  terms = DEFAULT_DEPOSIT_TERMS,
  onSaved,
}: ReservationStatusFormProps) {
  const status = reservation.status;
  const isFinal = status === "completed" || status === "cancelled" || status === "no_show";

  const [note, setNote] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);

  /** Kirim satu langkah aksi; `body` menentukan status baru & data tambahan. */
  const apply = async (
    key: string,
    body: Record<string, unknown>,
    successMessage: string,
  ) => {
    setError(null);
    setOk(null);
    setSaving(key);
    try {
      await apiPatch(`/admin/reservations/${reservation.id}`, {
        ...body,
        note: note.trim() || undefined,
      });
      setNote("");
      setRejectOpen(false);
      setOk(successMessage);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan perubahan");
    } finally {
      setSaving(null);
    }
  };

  // --- Aksi kehadiran, diturunkan dari status saat ini ---------------------
  const actions: {
    key: string;
    label: string;
    hint: string;
    variant: "primary" | "secondary" | "danger";
    run: () => void;
  }[] = [];

  if (status === "requested") {
    actions.push({
      key: "confirm",
      label: "Konfirmasi Reservasi",
      hint: "Terima reservasi. Setelah ini pelanggan bisa membayar DP2.",
      variant: "primary",
      run: () => void apply("confirm", { status: "confirmed" }, "Reservasi dikonfirmasi."),
    });
  }

  if (status === "confirmed") {
    actions.push({
      key: "seat",
      label: "Tandai Datang",
      hint: "Tamu sudah check-in dan mulai memakai ruangan.",
      variant: "primary",
      run: () => void apply("seat", { status: "seated" }, "Tamu ditandai sudah datang."),
    });
  }

  if (status === "seated") {
    actions.push({
      key: "complete",
      label: "Selesai",
      hint: "Tamu selesai; ruangan kembali tersedia untuk dipesan.",
      variant: "primary",
      run: () => void apply("complete", { status: "completed" }, "Reservasi diselesaikan."),
    });
  }

  if (!isFinal) {
    actions.push({
      key: "reject",
      label: "Tolak / Tidak Hadir",
      hint: "Batalkan reservasi atau tandai tamu tidak datang.",
      variant: "danger",
      run: () => setRejectOpen(true),
    });
  }

  return (
    <div className="space-y-5">
      {/* Langkah berikutnya */}
      <div>
        <span className={fieldLabelClass}>Langkah Berikutnya</span>
        {isFinal ? (
          <p className="mt-2 rounded-xl border border-coffee-linen bg-coffee-milk px-4 py-3 text-theme-sm text-coffee-muted dark:border-coffee-night-border dark:bg-white/5">
            Reservasi sudah berstatus final. Tidak ada langkah lanjutan.
          </p>
        ) : status === "requested" ? (
          <div className="mt-2 space-y-2">
            <p className="rounded-xl border border-coffee-linen bg-coffee-milk px-4 py-3 text-theme-sm text-coffee-muted dark:border-coffee-night-border dark:bg-white/5">
              {reservation.depositStatus === "paid" ? (
                <>
                  Pelanggan <strong>sudah membayar DP1</strong>. Tekan{" "}
                  <strong>Konfirmasi Reservasi</strong> untuk menerimanya — setelah itu pelanggan
                  bisa membayar <strong>DP2</strong>.
                </>
              ) : (
                <>
                  Menunggu pelanggan membayar <strong>DP1</strong>. Setelah DP1 lunas, konfirmasi
                  reservasi agar pelanggan bisa lanjut ke <strong>DP2</strong>.
                </>
              )}
            </p>
            <button
              type="button"
              onClick={() => setRejectOpen(true)}
              disabled={saving !== null}
              className="rounded-xl border border-coffee-danger/40 px-3 py-2 text-start text-theme-sm text-coffee-danger transition-colors hover:bg-coffee-danger/10 disabled:opacity-60"
            >
              Tolak / Tidak Hadir
            </button>
          </div>
        ) : actions.length > 0 ? (
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {actions.map((action) => (
              <button
                key={action.key}
                type="button"
                onClick={action.run}
                disabled={saving !== null}
                className={`rounded-xl border px-3 py-2 text-start transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  action.variant === "primary"
                    ? "border-coffee-brown bg-coffee-brown text-white hover:bg-coffee-dark dark:border-coffee-caramel dark:bg-coffee-caramel dark:text-coffee-night"
                    : action.variant === "danger"
                      ? "border-coffee-danger/40 text-coffee-danger hover:bg-coffee-danger/10"
                      : "border-coffee-linen bg-white hover:bg-coffee-milk dark:border-coffee-night-border dark:bg-coffee-night-soft dark:hover:bg-white/5"
                }`}
              >
                <span className="block text-theme-sm font-semibold">
                  {saving === action.key ? "Menyimpan…" : action.label}
                </span>
                <span
                  className={`block text-theme-xs ${
                    action.variant === "primary" ? "text-white/80 dark:text-coffee-night/70" : "text-coffee-muted"
                  }`}
                >
                  {action.hint}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-2 rounded-xl border border-coffee-linen bg-coffee-milk px-4 py-3 text-theme-sm text-coffee-muted dark:border-coffee-night-border dark:bg-white/5">
            Tidak ada langkah lanjutan untuk status ini.
          </p>
        )}
      </div>

      {/* DP 3 tahap — terlihat sejak reservasi diajukan (DP1 dibayar di form) */}
      {status !== "cancelled" && status !== "no_show" && (
        <div className="space-y-4">
          <DpSummary reservation={reservation} terms={terms} />

          <DpStageForm
            stage="deposit"
            title="DP1 · Uang Muka Awal"
            hint={`Otomatis: ${terms.dp1Percent}% dari total, dijepit ${formatIdr(terms.dp1MinIdr)}–${formatIdr(terms.dp1MaxIdr)}.`}
            amountIdr={reservation.depositAmountIdr}
            status={reservation.depositStatus}
            proofUrl={reservation.depositProofUrl}
            note={reservation.depositNote}
            reservationId={reservation.id}
            canMarkPaid={status === "confirmed" || status === "seated"}
            autoAmount
            onSaved={onSaved}
            setError={setError}
            setOk={setOk}
          />

          <DpStageForm
            stage="deposit2"
            title="DP2 · Setelah Konfirmasi"
            hint={`Otomatis: ${terms.dp2Percent}% dari sisa setelah DP1 (dibayar paling awal).`}
            amountIdr={reservation.deposit2AmountIdr}
            status={reservation.deposit2Status}
            proofUrl={reservation.deposit2ProofUrl}
            note={reservation.deposit2Note}
            reservationId={reservation.id}
            canMarkPaid={status === "confirmed" || status === "seated"}
            autoAmount
            onSaved={onSaved}
            setError={setError}
            setOk={setOk}
          />

          <DpStageForm
            stage="settlement"
            title="Pelunasan"
            hint="Otomatis: sisa total setelah dikurangi DP1 dan DP2."
            amountIdr={reservation.settlementAmountIdr}
            status={reservation.settlementStatus}
            proofUrl={reservation.settlementProofUrl}
            note={reservation.settlementNote}
            reservationId={reservation.id}
            canMarkPaid={status === "confirmed" || status === "seated"}
            autoAmount
            onSaved={onSaved}
            setError={setError}
            setOk={setOk}
          />
        </div>
      )}

      {/* Catatan untuk pelanggan */}
      <label className="flex flex-col gap-1">
        <span className={fieldLabelClass}>Catatan untuk Pelanggan (opsional)</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="mis. Reservasi diterima. Silakan transfer DP1 Rp300.000 ke rekening…"
          className={textareaClass}
        />
      </label>

      {error && <p className="text-theme-sm text-coffee-danger">{error}</p>}
      {ok && <p className="text-theme-sm text-coffee-success">{ok}</p>}

      {/* Dialog tolak: pilih dibatalkan atau tidak hadir */}
      <AppModal
        isOpen={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="Tolak reservasi?"
        desc="Pilih alasan penolakan. Pelanggan akan menerima notifikasinya."
        size="sm"
      >
        <div className="space-y-3">
          <button
            type="button"
            disabled={saving !== null}
            onClick={() =>
              void apply("reject-cancel", { status: "cancelled" }, "Reservasi dibatalkan.")
            }
            className="w-full rounded-xl border border-coffee-danger/40 px-4 py-3 text-start hover:bg-coffee-danger/10 disabled:opacity-60"
          >
            <span className="block text-theme-sm font-semibold text-coffee-danger">Batalkan Reservasi</span>
            <span className="block text-theme-xs text-coffee-muted">
              Reservasi dibatalkan atas permintaan/admin.
            </span>
          </button>
          <button
            type="button"
            disabled={saving !== null}
            onClick={() => void apply("reject-noshow", { status: "no_show" }, "Ditandai tidak hadir.")}
            className="w-full rounded-xl border border-coffee-linen px-4 py-3 text-start hover:bg-coffee-milk disabled:opacity-60 dark:border-coffee-night-border dark:hover:bg-white/5"
          >
            <span className="block text-theme-sm font-semibold text-coffee-dark dark:text-coffee-cream">
              Tamu Tidak Hadir
            </span>
            <span className="block text-theme-xs text-coffee-muted">
              Tamu tidak datang pada jadwalnya.
            </span>
          </button>
        </div>
      </AppModal>
    </div>
  );
}

/**
 * Rincian biaya transparan untuk admin: harga per jam × durasi tiap ruangan,
 * total sewa, pembagian DP1/DP2/pelunasan, lalu sudah dibayar & sisa tagihan.
 */
function DpSummary({
  reservation,
  terms = DEFAULT_DEPOSIT_TERMS,
}: {
  reservation: AdminReservation;
  terms?: DepositTerms;
}) {
  const total = reservation.totalEstimateIdr ?? 0;
  // Utamakan nominal yang sudah tersimpan; fallback ke rumus ketentuan aktif.
  const deposit1 = stageAmount(reservation, "deposit", terms);
  const deposit2 = stageAmount(reservation, "deposit2", terms);
  const settlement = stageAmount(reservation, "settlement", terms);
  const hours = reservation.durationMinutes > 0 ? reservation.durationMinutes / 60 : 0;

  const paidOf = (amount: number | null, status: string) =>
    status === "paid" ? Number(amount ?? 0) : 0;
  const paid =
    paidOf(reservation.depositAmountIdr, reservation.depositStatus) +
    paidOf(reservation.deposit2AmountIdr, reservation.deposit2Status) +
    paidOf(reservation.settlementAmountIdr, reservation.settlementStatus);
  const remaining = Math.max(0, total - paid);

  return (
    <div className="space-y-2 rounded-xl border border-coffee-linen bg-coffee-milk px-4 py-3 text-theme-sm dark:border-coffee-night-border dark:bg-white/5">
      <p className="font-semibold text-coffee-espresso dark:text-coffee-cream">Rincian Biaya</p>

      {reservation.rooms.length > 0 ? (
        reservation.rooms.map((room) => (
          <div key={room.areaId} className="flex items-start justify-between gap-3">
            <span className="text-coffee-muted">
              {room.name}
              {room.pricePerHourIdr != null && hours > 0
                ? ` · ${formatIdr(room.pricePerHourIdr)}/jam × ${hours} jam`
                : ""}
            </span>
            <span className="text-end font-medium text-coffee-dark dark:text-coffee-cream/90">
              {room.pricePerHourIdr != null && hours > 0
                ? formatIdr(Math.round(room.pricePerHourIdr * hours))
                : "Harga belum diisi"}
            </span>
          </div>
        ))
      ) : (
        <div className="flex items-start justify-between gap-3">
          <span className="text-coffee-muted">Ruangan</span>
          <span className="text-end font-medium text-coffee-muted">Belum ditetapkan</span>
        </div>
      )}

      <div className="flex items-start justify-between gap-3 border-t border-coffee-linen pt-2 dark:border-coffee-night-border">
        <span className="font-medium text-coffee-dark dark:text-coffee-cream">
          Total Sewa ({reservation.durationMinutes} menit)
        </span>
        <span className="text-end font-semibold text-coffee-espresso dark:text-coffee-cream">
          {reservation.totalEstimateIdr != null ? formatIdr(total) : "Belum dihitung"}
        </span>
      </div>

      {reservation.totalEstimateIdr != null && (
        <>
          <div className="flex items-start justify-between gap-3">
            <span className="text-coffee-muted">DP1 · Uang muka awal ({terms.dp1Percent}%)</span>
            <span className="text-end text-coffee-dark dark:text-coffee-cream/90">
              {formatIdr(deposit1)}
            </span>
          </div>
          <div className="flex items-start justify-between gap-3">
            <span className="text-coffee-muted">
              DP2 · Setelah konfirmasi ({terms.dp2Percent}% dari sisa)
            </span>
            <span className="text-end text-coffee-dark dark:text-coffee-cream/90">
              {formatIdr(deposit2)}
            </span>
          </div>
          <div className="flex items-start justify-between gap-3">
            <span className="text-coffee-muted">Pelunasan (sisa)</span>
            <span className="text-end text-coffee-dark dark:text-coffee-cream/90">
              {formatIdr(settlement)}
            </span>
          </div>
        </>
      )}

      <div className="flex items-start justify-between gap-3 border-t border-coffee-linen pt-2 dark:border-coffee-night-border">
        <span className="font-medium text-coffee-success">Sudah Dibayar</span>
        <span className="text-end font-semibold text-coffee-success">{formatIdr(paid)}</span>
      </div>
      <div className="flex items-start justify-between gap-3">
        <span className="font-medium text-coffee-dark dark:text-coffee-cream">Sisa Tagihan</span>
        <span
          className={`text-end font-semibold ${
            remaining > 0 ? "text-coffee-danger" : "text-coffee-success"
          }`}
        >
          {remaining > 0 ? formatIdr(remaining) : "Lunas"}
        </span>
      </div>
    </div>
  );
}

/**
 * Satu blok tahap DP: menampilkan nominal sistem-hitungan (tidak bisa diubah
 * admin), catatan, unggah bukti transfer, dan aksi verifikasi. Nominal DP
 * selalu dihitung oleh sistem: DP1 = clamp(persen × total, batas min/max),
 * DP2 = persen × sisa, pelunasan = sisanya. Admin hanya konfirmasi status &
 * catatan, bukan mengisi persen/nominal.
 */
function DpStageForm({
  stage,
  title,
  hint,
  amountIdr,
  status,
  proofUrl: initialProofUrl,
  note: initialNote,
  reservationId,
  canMarkPaid,
  autoAmount,
  onSaved,
  setError,
  setOk,
}: {
  stage: DpStage;
  title: string;
  hint: string;
  amountIdr: number | null;
  status: string;
  proofUrl: string | null;
  note: string | null;
  reservationId: string;
  /** Apakah tombol "Tandai Lunas" boleh ditekan (reservasi sudah diterima). */
  canMarkPaid: boolean;
  /** Nominal ditetapkan sistem (tidak bisa diubah admin). */
  autoAmount?: boolean;
  onSaved: () => void;
  setError: (value: string | null) => void;
  setOk: (value: string | null) => void;
}) {
  const paid = status === "paid";
  const amountDisplay = amountIdr != null ? formatIdr(amountIdr) : "Belum dihitung";
  const [dpNote, setDpNote] = useState(initialNote ?? "");
  const [proofUrl, setProofUrl] = useState<string | null>(initialProofUrl);
  const [proofKey, setProofKey] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const stageLabel = stage === "deposit" ? "DP1" : stage === "deposit2" ? "DP2" : "Pelunasan";
  const stageFields = {
    deposit: {
      amount: "depositAmountIdr",
      status: "depositStatus",
      proof: "depositProofUrl",
      proofKey: "depositProofStorageKey",
      note: "depositNote",
    },
    deposit2: {
      amount: "deposit2AmountIdr",
      status: "deposit2Status",
      proof: "deposit2ProofUrl",
      proofKey: "deposit2ProofStorageKey",
      note: "deposit2Note",
    },
    settlement: {
      amount: "settlementAmountIdr",
      status: "settlementStatus",
      proof: "settlementProofUrl",
      proofKey: "settlementProofStorageKey",
      note: "settlementNote",
    },
  }[stage];

  const uploadProof = async (file: File) => {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Bukti transfer harus berupa gambar.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Ukuran gambar maksimal 5 MB.");
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await readAsDataUrl(file);
      const res = await apiPost("/admin/uploads/images", {
        data: dataUrl,
        contentType: file.type,
        folder: "deposits",
      });
      const image = res.data as UploadedImage;
      setProofUrl(image.publicUrl);
      setProofKey(image.storageKey);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Gagal mengunggah bukti. Isi URL manual bila perlu.",
      );
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  /** Simpan bukti transfer (hanya proof & catatan, nominal TIDAK boleh diubah). */
  const saveProof = async () => {
    setError(null);
    setOk(null);
    setSaving(true);
    try {
      await apiPatch(`/admin/reservations/${reservationId}`, {
        [stageFields.proof]: proofUrl,
        [stageFields.proofKey]: proofKey,
        [stageFields.note]: dpNote.trim() || null,
      });
      setOk(`Data ${stageLabel} disimpan.`);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan data DP");
    } finally {
      setSaving(false);
    }
  };

  /** Tandai tahap ini lunas (hanya mengubah status, nominal sudahpasti sistem). */
  const markPaid = async () => {
    setError(null);
    setOk(null);
    setSaving(true);
    try {
      await apiPatch(`/admin/reservations/${reservationId}`, {
        [stageFields.status]: "paid",
        [stageFields.proof]: proofUrl,
        [stageFields.proofKey]: proofKey,
        [stageFields.note]: dpNote.trim() || null,
      });
      setOk(`${stageLabel} ditandai lunas. Pelanggan menerima notifikasi.`);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menandai lunas");
    } finally {
      setSaving(false);
    }
  };

  /** Buat link/QR Midtrans untuk tahap ini (nominal diambil dari amountIdr sistem). */
  const createCharge = async () => {
    setError(null);
    setOk(null);
    setPayUrl(null);
    setGenerating(true);
    try {
      const res = await apiPost(`/admin/reservations/${reservationId}/deposit-charge`, {
        stage,
        amountIdr: amountIdr ?? 0,
        paymentMethod: "qris",
      });
      const payment = (res.data as { payment?: { paymentUrl: string | null } }).payment;
      if (!payment?.paymentUrl) {
        setError("Midtrans tidak mengembalikan URL pembayaran. Coba lagi.");
      } else {
        setPayUrl(payment.paymentUrl);
      }
      setOk(`Link pembayaran ${stageLabel} dibuat. Kirim URL di bawah ke pelanggan.`);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal membuat link pembayaran");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="rounded-xl border border-coffee-linen p-4 dark:border-coffee-night-border">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-theme-sm font-semibold text-coffee-espresso dark:text-coffee-cream">
          {title}
        </p>
        <span className="text-theme-xs text-coffee-muted">
          Status: {depositStatusLabel(status)}
        </span>
      </div>
      {paid && proofUrl && (
        <p className="mb-2 rounded-lg border border-coffee-success/40 bg-coffee-success/10 px-3 py-2 text-theme-xs text-coffee-success">
          Pelanggan sudah mengunggah bukti transfer untuk tahap ini.
        </p>
      )}
      <p className="mb-3 text-theme-xs text-coffee-muted">{hint}</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className={fieldLabelClass}>Nominal (Rp)</span>
          <p className="text-theme-sm font-medium text-coffee-dark dark:text-coffee-cream/90">
            {amountDisplay}
          </p>
          {autoAmount ? (
            <span className="text-theme-xs text-coffee-muted">
              Ditetapkan otomatis oleh sistem.
            </span>
          ) : null}
        </label>
        <label className="flex flex-col gap-1">
          <span className={fieldLabelClass}>Catatan (opsional)</span>
          <input
            value={dpNote}
            onChange={(e) => setDpNote(e.target.value)}
            placeholder="mis. ditransfer ke rekening cabang"
            className={inputClass}
            disabled={paid}
          />
        </label>
      </div>

      {/* Bukti transfer */}
      <div className="mt-4">
        <span className={fieldLabelClass}>Bukti Transfer</span>
        <div className="mt-2 flex flex-wrap items-start gap-3">
          {proofUrl ? (
            <div className="h-24 w-24 overflow-hidden rounded-lg border border-coffee-linen dark:border-coffee-night-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={proofUrl} alt={`Bukti ${stageLabel}`} className="h-full w-full object-cover" />
            </div>
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-lg border border-dashed border-coffee-linen text-theme-xs text-coffee-muted dark:border-coffee-night-border">
              Belum ada
            </div>
          )}
          <div className="flex flex-col gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadProof(file);
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading || paid}
              className={secondaryButtonClass}
            >
              {uploading ? "Mengunggah…" : "Unggah Bukti"}
            </button>
            {proofUrl && !paid && (
              <button
                type="button"
                onClick={() => {
                  setProofUrl(null);
                  setProofKey(null);
                }}
                className="rounded-lg border border-coffee-danger/40 px-3 py-1.5 text-theme-xs font-semibold text-coffee-danger hover:bg-coffee-danger/10"
              >
                Hapus Bukti
              </button>
            )}
            <input
              type="text"
              value={proofUrl ?? ""}
              onChange={(e) => setProofUrl(e.target.value || null)}
              placeholder="atau tempel URL bukti"
              className={`${inputClass} w-56`}
              disabled={paid}
            />
            {paid && proofUrl && (
              <a
                href={proofUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-theme-xs font-semibold text-coffee-brown hover:underline dark:text-coffee-caramel"
              >
                Lihat bukti transfer
              </a>
            )}
          </div>
        </div>
      </div>

      {!paid && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void saveProof()}
            disabled={saving || generating}
            className={secondaryButtonClass}
          >
            {saving ? "Menyimpan…" : "Simpan Data"}
          </button>
          {canMarkPaid && (
            <button
              type="button"
              onClick={() => void markPaid()}
              disabled={saving || generating}
              className="rounded-lg border border-coffee-success/40 px-4 py-2 text-theme-sm font-semibold text-coffee-success hover:bg-coffee-success/10 disabled:opacity-60"
            >
              Tandai {stageLabel} Lunas
            </button>
          )}
        </div>
      )}

      {/* Link pembayaran Midtrans untuk tahap ini */}
      {!paid && (
        <div className="mt-3 rounded-lg border border-dashed border-coffee-linen p-3 dark:border-coffee-night-border">
          <p className="text-theme-sm font-semibold text-coffee-espresso dark:text-coffee-cream">
            Bayar {stageLabel} via Midtrans
          </p>
          <p className="mb-3 text-theme-xs text-coffee-muted">
            Buat link/QR pembayaran dari nominal {stageLabel}, lalu kirim ke pelanggan. Tahap ini
            otomatis lunas begitu pelanggan membayar.
          </p>
          <button
            type="button"
            onClick={() => void createCharge()}
            disabled={generating || saving}
            className={secondaryButtonClass}
          >
            {generating ? "Membuat link…" : `Buat Link Pembayaran ${stageLabel}`}
          </button>
          {payUrl && (
            <div className="mt-3 space-y-2">
              <a
                href={payUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block truncate rounded-lg bg-coffee-milk px-3 py-2 text-theme-xs text-coffee-brown hover:underline dark:bg-white/5 dark:text-coffee-caramel"
              >
                {payUrl}
              </a>
              <button
                type="button"
                onClick={() => void navigator.clipboard?.writeText(payUrl)}
                className="text-theme-xs font-semibold text-coffee-brown hover:underline dark:text-coffee-caramel"
              >
                Salin link
              </button>
            </div>
          )}
        </div>
      )}

      {paid && (
        <p className="mt-3 text-theme-xs text-coffee-success">Tahap ini sudah lunas.</p>
      )}
    </div>
  );
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Gagal membaca berkas"));
    reader.readAsDataURL(file);
  });
}
