"use client";

import { Banknote, ChefHat, Coffee, Printer } from "lucide-react";
import { useState } from "react";

import { Badge, Button, Modal } from "@/components/ui";
import {
  formatDateTime,
  formatRupiah,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
  ORDER_TYPE_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
} from "@/lib/format";
import {
  groupItemsByStation,
  loadPrinterSettings,
  printOrderStation,
  type PrintStation,
} from "@/lib/printer";
import { useKasir } from "@/lib/store";
import type { Order } from "@/lib/types";

interface ReceiptModalProps {
  order: Order | null;
  onClose: () => void;
  onPay?: (order: Order) => void;
}

export function ReceiptModal({ order, onClose, onPay }: ReceiptModalProps) {
  const { products } = useKasir();
  const [printError, setPrintError] = useState<string | null>(null);
  const [printing, setPrinting] = useState<PrintStation | null>(null);

  const canPay =
    order !== null &&
    order.paymentStatus !== "paid" &&
    order.status !== "cancelled" &&
    order.status !== "rejected";

  const stationGroups = order
    ? groupItemsByStation(
        order.items,
        products,
        loadPrinterSettings(),
      )
    : null;

  async function handlePrint(station: PrintStation) {
    if (!order || printing) return;
    setPrintError(null);
    setPrinting(station);
    try {
      const settings = loadPrinterSettings();
      const items =
        station === "cashier"
          ? order.items
          : groupItemsByStation(
              order.items,
              products,
              settings,
            )[station];

      if (station !== "cashier" && items.length === 0) {
        setPrintError(
          `Tidak ada item ${station === "bar" ? "bar" : "dapur"} pada pesanan ini.`,
        );
        return;
      }

      await printOrderStation(order, station, items, settings);
    } catch (err) {
      setPrintError(
        err instanceof Error ? err.message : "Gagal mengirim tiket ke printer.",
      );
    } finally {
      setPrinting(null);
    }
  }

  return (
    <Modal
      open={Boolean(order)}
      onClose={onClose}
      title="Detail Pesanan"
      subtitle={
        order
          ? `${order.code} · ${ORDER_STATUS_LABEL[order.status]}`
          : undefined
      }
      size="md"
      footer={
        order ? (
          <div className="flex flex-col gap-2">
            {printError ? (
              <p className="rounded-lg border border-danger/20 bg-danger/10 px-2.5 py-1.5 text-[11px] font-semibold text-danger">
                {printError}
              </p>
            ) : null}
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={Boolean(printing) || !stationGroups?.kitchen.length}
                onClick={() => void handlePrint("kitchen")}
              >
                {printing === "kitchen" ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <ChefHat size={14} />
                )}
                Dapur
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={Boolean(printing) || !stationGroups?.bar.length}
                onClick={() => void handlePrint("bar")}
              >
                {printing === "bar" ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <Coffee size={14} />
                )}
                Bar
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={Boolean(printing)}
                onClick={() => void handlePrint("cashier")}
              >
                {printing === "cashier" ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <Printer size={14} />
                )}
                Struk
              </Button>
            </div>
            <p className="text-center text-[10px] text-muted">
              Koneksi & pembagian tiket diatur di menu Printer.
            </p>
            {canPay && onPay ? (
              <Button
                className="w-full"
                onClick={() => {
                  onClose();
                  onPay(order);
                }}
              >
                <Banknote size={16} />
                Bayar Sekarang
              </Button>
            ) : (
              <Button className="w-full" onClick={onClose}>
                Selesai
              </Button>
            )}
          </div>
        ) : null
      }
    >
      {order ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={ORDER_STATUS_TONE[order.status]}>
              {ORDER_STATUS_LABEL[order.status]}
            </Badge>
            <Badge
              tone={
                order.paymentStatus === "paid"
                  ? "success"
                  : order.paymentStatus === "pending"
                    ? "warning"
                    : "default"
              }
            >
              {PAYMENT_STATUS_LABEL[order.paymentStatus] ?? order.paymentStatus}
            </Badge>
            <Badge tone="brown">{ORDER_TYPE_LABEL[order.type]}</Badge>
          </div>

          <div className="grid grid-cols-2 gap-2.5 rounded-2xl border border-line bg-milk p-3">
            <Info label="No. Pesanan" value={order.code} mono />
            <Info label="Waktu" value={formatDateTime(order.createdAt)} />
            <Info label="Tipe" value={ORDER_TYPE_LABEL[order.type]} />
            <Info label="Meja" value={order.tableNumber ?? "-"} />
            <Info label="Pelanggan" value={order.customerName ?? "Walk-in"} />
            <Info label="Kasir" value={order.cashier} />
            {order.customerPhone ? (
              <Info label="Telepon" value={order.customerPhone} />
            ) : null}
          </div>

          <section>
            <h3 className="text-[11px] font-black uppercase tracking-wide text-muted">
              Item Pesanan
            </h3>
            <ul className="mt-2 flex flex-col gap-2">
              {order.items.map((item) => (
                <li
                  key={item.key}
                  className="rounded-xl border border-line bg-surface p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-ink">
                        <span className="text-primary">{item.qty}x</span>{" "}
                        {item.name}
                      </p>
                      {item.variantName ? (
                        <p className="mt-0.5 text-[11px] text-muted">
                          Varian: {item.variantName}
                        </p>
                      ) : null}
                    </div>
                    <p className="shrink-0 text-xs font-bold text-ink-soft tabular">
                      {formatRupiah(item.price * item.qty)}
                    </p>
                  </div>

                  {item.modifiers.length > 0 ? (
                    <ul className="mt-1.5 flex flex-col gap-0.5">
                      {item.modifiers.map((modifier, index) => (
                        <li
                          key={`${item.key}-${modifier.optionId}-${index}`}
                          className="text-[11px] text-ink-soft"
                        >
                          <span className="font-semibold">
                            {modifier.groupName}:
                          </span>{" "}
                          {modifier.name}
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {item.note ? (
                    <p className="mt-2 rounded-lg border border-warning/30 bg-warning/10 px-2 py-1.5 text-[11px] font-semibold text-ink">
                      <span className="font-black text-warning">
                        Catatan item:
                      </span>{" "}
                      {item.note}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>

          {order.note ? (
            <section className="rounded-xl border border-warning/30 bg-warning/10 p-3">
              <h3 className="text-[10px] font-black uppercase tracking-wide text-warning">
                Catatan Pesanan
              </h3>
              <p className="mt-1 text-xs font-semibold text-ink">{order.note}</p>
            </section>
          ) : null}

          <section className="rounded-2xl border border-line bg-milk p-3">
            <h3 className="text-[11px] font-black uppercase tracking-wide text-muted">
              Pembayaran
            </h3>
            <div className="mt-2 flex flex-col gap-1 text-xs">
              <Row label="Subtotal" value={formatRupiah(order.subtotal)} />
              {order.discount > 0 ? (
                <Row
                  label="Diskon"
                  value={`-${formatRupiah(order.discount)}`}
                  danger
                />
              ) : null}
              <Row label="Pajak" value={formatRupiah(order.tax)} />
              {order.serviceFee > 0 ? (
                <Row
                  label="Biaya layanan"
                  value={formatRupiah(order.serviceFee)}
                />
              ) : null}
              {order.deliveryFee > 0 ? (
                <Row
                  label="Biaya antar"
                  value={formatRupiah(order.deliveryFee)}
                />
              ) : null}
              <div className="mt-1 flex items-center justify-between border-t border-line pt-1.5 text-sm font-black">
                <span>Total</span>
                <span className="tabular">{formatRupiah(order.total)}</span>
              </div>
              <Row
                label="Metode"
                value={
                  order.paymentMethod
                    ? PAYMENT_METHOD_LABEL[order.paymentMethod]
                    : "Belum dibayar"
                }
              />
              <Row
                label="Status bayar"
                value={
                  PAYMENT_STATUS_LABEL[order.paymentStatus] ??
                  order.paymentStatus
                }
              />
              {order.paymentStatus === "paid" ? (
                <>
                  <Row
                    label="Diterima"
                    value={formatRupiah(order.paidAmount)}
                  />
                  <Row label="Kembalian" value={formatRupiah(order.change)} />
                </>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </Modal>
  );
}

function Info({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
        {label}
      </p>
      <p
        className={
          mono
            ? "truncate font-mono text-xs font-black text-ink"
            : "truncate text-xs font-bold text-ink"
        }
      >
        {value}
      </p>
    </div>
  );
}

function Row({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted">{label}</span>
      <span className={danger ? "font-bold text-danger" : "font-bold"}>
        {value}
      </span>
    </div>
  );
}
