"use client";

import { Banknote, CreditCard, Loader2, QrCode, Wallet } from "lucide-react";
import { useMemo, useState } from "react";

import { Button, Modal } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatRupiah } from "@/lib/format";
import type { PaymentMethod } from "@/lib/types";

const METHODS: {
  value: PaymentMethod;
  label: string;
  hint: string;
  icon: typeof Banknote;
}[] = [
  {
    value: "cash",
    label: "Tunai",
    hint: "Uang diterima & kembalian",
    icon: Banknote,
  },
  { value: "qris", label: "QRIS", hint: "Pindai QR di EDC", icon: QrCode },
  {
    value: "card",
    label: "Kartu",
    hint: "Debit / kredit via EDC",
    icon: CreditCard,
  },
  {
    value: "bank_transfer",
    label: "Transfer",
    hint: "Transfer bank / m-banking",
    icon: Wallet,
  },
];

interface PaymentModalProps {
  open: boolean;
  total: number;
  title?: string;
  subtitle?: string;
  error?: string | null;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (method: PaymentMethod, paidAmount: number) => void;
}

export function PaymentModal({
  open,
  total,
  title = "Pembayaran",
  subtitle,
  error,
  busy = false,
  onClose,
  onConfirm,
}: PaymentModalProps) {
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [cashInput, setCashInput] = useState("");

  const paidAmount =
    method === "cash" ? Number(cashInput.replace(/\D/g, "")) || 0 : total;
  const change = Math.max(0, paidAmount - total);
  const enough = method !== "cash" || paidAmount >= total;

  function resetForm() {
    setMethod("cash");
    setCashInput("");
  }

  function handleClose() {
    if (busy) return;
    resetForm();
    onClose();
  }

  function handleConfirm() {
    if (busy) return;
    onConfirm(method, paidAmount);
  }

  const suggestions = useMemo(() => {
    const roundTo = (value: number, step: number) =>
      Math.ceil(value / step) * step;
    const values = [
      total,
      roundTo(total, 10_000),
      roundTo(total, 50_000),
      roundTo(total, 100_000),
      100_000,
      200_000,
    ];
    return [...new Set(values.filter((value) => value >= total))].slice(0, 5);
  }, [total]);

  const activeMethod = METHODS.find((item) => item.value === method);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={title}
      subtitle={subtitle}
      size="md"
      footer={
        <Button
          size="lg"
          className="w-full"
          disabled={!enough || busy}
          onClick={handleConfirm}
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : null}
          {busy
            ? "Memproses pembayaran…"
            : enough
              ? `Konfirmasi Pembayaran ${formatRupiah(total)}`
              : `Uang kurang ${formatRupiah(total - paidAmount)}`}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {error ? (
          <p className="rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">
            {error}
          </p>
        ) : null}
        <div className="rounded-2xl bg-primary p-4 text-white shadow-sm shadow-primary/20">
          <p className="text-[11px] font-bold uppercase tracking-wider text-white/70">
            Total tagihan
          </p>
          <p className="mt-1 text-3xl font-black tracking-tight tabular">
            {formatRupiah(total)}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {METHODS.map((item) => {
            const Icon = item.icon;
            const active = method === item.value;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => setMethod(item.value)}
                className={cn(
                  "focus-ring flex items-center gap-2 rounded-xl border p-2.5 text-left transition",
                  active
                    ? "border-primary bg-primary-soft"
                    : "border-line bg-surface hover:bg-milk",
                )}
              >
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                    active
                      ? "bg-primary text-white"
                      : "bg-primary-soft text-primary",
                  )}
                >
                  <Icon size={17} />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-extrabold text-ink">
                    {item.label}
                  </span>
                  <span className="block truncate text-[10px] text-muted">
                    {item.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {method === "cash" ? (
          <div className="rounded-2xl border border-line bg-milk p-3">
            <label
              htmlFor="cash-received"
              className="text-xs font-bold text-ink-soft"
            >
              Uang diterima
            </label>
            <div className="mt-1 flex items-center gap-2 rounded-xl border border-line bg-surface px-3 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
              <span className="text-sm font-bold text-muted">Rp</span>
              <input
                id="cash-received"
                inputMode="numeric"
                autoComplete="off"
                value={cashInput ? formatRupiah(Number(cashInput)).replace("Rp", "") : ""}
                onChange={(event) =>
                  setCashInput(event.target.value.replace(/\D/g, ""))
                }
                placeholder="0"
                className="h-12 w-full bg-transparent text-right text-xl font-black text-ink outline-none tabular placeholder:text-muted/50"
              />
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {suggestions.map((value, index) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setCashInput(String(value))}
                  className="focus-ring rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] font-bold text-ink-soft transition hover:border-primary/40 hover:text-primary"
                >
                  {index === 0 ? "Uang pas" : formatRupiah(value)}
                </button>
              ))}
            </div>

            <div className="mt-3 flex items-center justify-between rounded-xl bg-surface px-3 py-2.5">
              <span className="text-xs font-bold text-muted">Kembalian</span>
              <span
                className={cn(
                  "text-lg font-black tabular",
                  enough ? "text-success" : "text-danger",
                )}
              >
                {formatRupiah(change)}
              </span>
            </div>
            {!enough && paidAmount > 0 ? (
              <p className="mt-1.5 text-[11px] font-bold text-danger">
                Uang masih kurang {formatRupiah(total - paidAmount)}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="rounded-2xl border border-line bg-milk p-4 text-center">
            <p className="text-sm font-extrabold text-ink">
              Konfirmasi pembayaran {activeMethod?.label}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Setelah dikonfirmasi, pesanan dianggap lunas dan masuk ke antrean
              dapur.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
