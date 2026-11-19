"use client";

/**
 * Sheet instruksi pembayaran.
 *
 * - Bila gateway mengembalikan `paymentUrl` nyata (Midtrans Snap), tampilkan
 *   tombol "Buka Halaman Pembayaran" + "Cek Status Pembayaran".
 * - Bila tidak ada URL (mode stub tanpa kredensial), tampilkan QRIS/VA/langkah
 *   dan tombol "Simulasikan sudah dibayar" (khusus demo).
 */
import {
  CheckCircle2,
  Copy,
  CreditCard,
  ExternalLink,
  Loader2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatRupiah } from "@/lib/format";
import { simulatePaymentSuccess, verifyPayment } from "@/services/payment.service";

import type { ChargeResult } from "@/types/api";

const METHOD_LABEL: Record<string, string> = {
  qris: "QRIS",
  virtual_account: "Virtual Account",
  bank_transfer: "Transfer Bank",
  ewallet: "E-Wallet",
  card: "Kartu",
  cash: "Bayar di Tempat",
};

interface PaymentInstructionsSheetProps {
  visible: boolean;
  charge: ChargeResult | null;
  onClose: () => void;
  /** Dipanggil setelah pembayaran terkonfirmasi lunas. */
  onPaid?: () => void;
}

export function PaymentInstructionsSheet({
  visible,
  charge,
  onClose,
  onPaid,
}: PaymentInstructionsSheetProps) {
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);
  const [polling, setPolling] = useState(false);
  const [copied, setCopied] = useState(false);

  // Supaya tidak memicu `onPaid` berkali-kali & berhenti setelah sheet ditutup.
  const notifiedRef = useRef(false);
  const aliveRef = useRef(true);
  const visibleRef = useRef(visible);
  const paymentId = charge?.payment?.id ?? null;

  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // Reset status tiap kali transaksi berubah.
  useEffect(() => {
    notifiedRef.current = false;
    setPaid(false);
    setMessage(null);
    setError(null);
    setChecking(false);
    setPolling(false);
    setCopied(false);
  }, [paymentId]);

  const instructions = charge?.instructions ?? null;
  const payment = charge?.payment ?? null;
  const method = instructions?.method ?? payment?.paymentMethod ?? "qris";
  const amountIdr = instructions?.amountIdr ?? payment?.amountIdr ?? 0;
  const steps = instructions?.steps ?? [];
  const paymentUrl = instructions?.paymentUrl ?? payment?.paymentUrl ?? null;

  /**
   * Sinkronkan status ke gateway. `silent` dipakai saat polling otomatis supaya
   * tidak menampilkan pesan "belum dibayar" berkali-kali.
   */
  const refresh = useCallback(
    async (silent: boolean): Promise<boolean> => {
      if (!payment) return false;
      try {
        const result = await verifyPayment(payment.id);
        if (!aliveRef.current) return result.isPaid;
        if (result.isPaid) {
          if (!notifiedRef.current) {
            notifiedRef.current = true;
            setPaid(true);
            onPaid?.();
          }
          return true;
        }
        if (!silent) {
          setMessage(
            result.status === "pending"
              ? "Pembayaran belum diterima. Selesaikan pembayaran lalu cek lagi."
              : `Status pembayaran: ${result.status}.`,
          );
        }
        return false;
      } catch (err) {
        if (!silent) {
          setError(err instanceof Error ? err.message : "Gagal memeriksa status pembayaran.");
        }
        return false;
      }
    },
    [payment, onPaid],
  );

  const checkStatus = useCallback(async () => {
    if (checking) return;
    setChecking(true);
    setError(null);
    try {
      await refresh(false);
    } finally {
      if (aliveRef.current) setChecking(false);
    }
  }, [checking, refresh]);

  const openPaymentUrl = useCallback(async () => {
    if (!paymentUrl) return;
    setError(null);
    window.open(paymentUrl, "_blank", "noopener,noreferrer");

    // Polling otomatis: Midtrans butuh beberapa saat untuk menetapkan
    // `settlement` setelah pembayaran, jadi jangan cek sekali saja.
    setPolling(true);
    try {
      for (let attempt = 0; attempt < 24; attempt += 1) {
        if (!aliveRef.current || !visibleRef.current || notifiedRef.current) return;
        const done = await refresh(true);
        if (done) return;
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
      if (aliveRef.current && !notifiedRef.current) {
        setMessage('Belum terdeteksi lunas. Tekan "Cek Status Pembayaran" untuk mencoba lagi.');
      }
    } finally {
      if (aliveRef.current) setPolling(false);
    }
  }, [paymentUrl, refresh]);

  const simulate = async () => {
    if (!payment) return;
    setBusy(true);
    setError(null);
    try {
      await simulatePaymentSuccess(payment.id);
      if (!notifiedRef.current) {
        notifiedRef.current = true;
        onPaid?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengonfirmasi pembayaran.");
    } finally {
      setBusy(false);
    }
  };

  const copyVa = async () => {
    if (!instructions?.virtualAccountNumber) return;
    try {
      await navigator.clipboard.writeText(instructions.virtualAccountNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // abaikan
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[75] flex items-end justify-center bg-black/45 animate-fade-in">
      <button
        type="button"
        aria-label="Tutup instruksi pembayaran"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />

      <div className="relative z-10 flex max-h-[88vh] w-full max-w-2xl flex-col rounded-t-[24px] border border-line bg-surface px-5 pb-7 pt-4 animate-slide-up">
        <div className="flex items-center gap-2.5">
          <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
            <CreditCard size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-black text-ink">Instruksi Pembayaran</h2>
            <p className="text-xs text-muted">
              {METHOD_LABEL[method] ?? method}
              {payment?.provider ? ` • ${payment.provider}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="text-muted transition hover:text-ink focus-ring">
            <X size={24} />
          </button>
        </div>

        <div className="flex flex-col gap-3.5 overflow-y-auto pt-4">
          <div className="flex flex-col items-center gap-1 rounded-2xl bg-primary-soft p-4">
            <p className="text-xs text-muted">Total yang harus dibayar</p>
            <p className="text-[26px] font-black text-primary">{formatRupiah(amountIdr)}</p>
            <Badge
              label={paid ? "Pembayaran berhasil" : "Menunggu pembayaran"}
              tone={paid ? "success" : "warning"}
              size="sm"
            />
          </div>

          {instructions?.virtualAccountNumber ? (
            <div className="flex flex-col gap-2">
              <p className="text-[13px] font-extrabold text-ink">Nomor Virtual Account</p>
              <div className="flex items-center justify-center gap-3 rounded-[14px] border border-line p-4">
                <span className="select-all text-[22px] font-black tracking-[2px] text-ink">
                  {instructions.virtualAccountNumber}
                </span>
                <button
                  type="button"
                  onClick={() => void copyVa()}
                  className="flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-bold text-primary">
                  {copied ? <CheckCircle2 size={13} /> : <Copy size={13} />}
                  {copied ? "Tersalin" : "Salin"}
                </button>
              </div>
            </div>
          ) : null}

          {steps.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-[13px] font-extrabold text-ink">Cara pembayaran</p>
              {steps.map((step, index) => (
                <div key={step} className="flex gap-2.5">
                  <span className="text-[13px] font-extrabold text-primary">{index + 1}.</span>
                  <p className="flex-1 text-[13px] leading-[19px] text-muted">{step}</p>
                </div>
              ))}
            </div>
          ) : null}

          {instructions?.reference ? (
            <p className="text-[11px] text-muted">Referensi: {instructions.reference}</p>
          ) : null}
          {instructions?.expiresAt ? (
            <p className="text-[11px] text-muted">
              Berlaku sampai {formatDateTime(instructions.expiresAt)}
            </p>
          ) : null}

          {message ? <Badge tone="info" label={message} /> : null}
          {error ? <Badge tone="danger" label={error} /> : null}
        </div>

        <div className="flex flex-col gap-2 pt-3.5">
          {paymentUrl ? (
            <>
              <Button
                title="Buka Halaman Pembayaran"
                icon={ExternalLink}
                onClick={() => void openPaymentUrl()}
                disabled={checking}
                size="lg"
              />
              <Button
                title="Cek Status Pembayaran"
                variant="soft"
                onClick={() => void checkStatus()}
                loading={checking}
              />
            </>
          ) : (
            <>
              <Button
                title="Simulasikan sudah dibayar"
                icon={CheckCircle2}
                onClick={() => void simulate()}
                loading={busy}
                disabled={!payment}
                size="lg"
              />
              <Button
                title="Cek Status Pembayaran"
                variant="soft"
                onClick={() => void checkStatus()}
                loading={checking}
              />
              <p className="text-[11px] italic text-muted">
                Mode demo (gateway stub): gunakan tombol simulasi untuk menyelesaikan pembayaran.
              </p>
            </>
          )}
          <Button title="Tutup" variant="ghost" onClick={onClose} />
          {busy || checking || polling ? (
            <div className="flex items-center justify-center gap-2">
              <Loader2 size={14} className="animate-spin text-primary" />
              <p className="text-xs text-muted">{polling ? "Memeriksa pembayaran…" : "Memproses…"}</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
