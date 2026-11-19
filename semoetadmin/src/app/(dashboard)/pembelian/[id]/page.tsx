"use client";

import ComponentCard from "@/components/common/ComponentCard";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { ErrorBlock, LoadingBlock } from "@/components/common/DataState";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ToneBadge from "@/components/common/ToneBadge";
import GoodsReceiptDetailModal from "@/components/pembelian/GoodsReceiptDetailModal";
import GoodsReceiptModal from "@/components/pembelian/GoodsReceiptModal";
import PurchaseOrderCancelModal from "@/components/pembelian/PurchaseOrderCancelModal";
import PurchaseOrderConfirmModal from "@/components/pembelian/PurchaseOrderConfirmModal";
import PurchaseOrderFormModal from "@/components/pembelian/PurchaseOrderFormModal";
import { useApi } from "@/hooks/useApi";
import { apiDelete, apiPost } from "@/lib/client";
import { formatDate, formatDateTime, formatIdr, formatNumber } from "@/lib/format";
import {
  goodsReceiptStatusLabel,
  goodsReceiptStatusTone,
  purchaseOrderStatusLabel,
  purchaseOrderStatusTone,
  purchasePaymentStatusLabel,
  purchasePaymentStatusTone,
  supplierPaymentMethodLabel,
} from "@/lib/labels";
import { dangerButtonClass, primaryButtonClass, secondaryButtonClass } from "@/lib/ui";
import type { GoodsReceipt, PurchaseOrderDetail } from "@/types/api";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

const smallButtonClass =
  "inline-flex h-9 items-center justify-center rounded-lg border border-coffee-linen px-3 text-theme-xs font-semibold transition-colors hover:bg-coffee-milk dark:border-coffee-night-border dark:hover:bg-white/5";

/**
 * Detail purchase order: ringkasan, rincian bahan, penerimaan barang, dan
 * pembayaran hutang supplier.
 */
export default function PurchaseOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? null;
  const { data, loading, error, reload } = useApi<PurchaseOrderDetail>(
    id ? `/admin/purchase-orders/${id}` : null,
  );

  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [receiptDetailId, setReceiptDetailId] = useState<string | null>(null);
  const [postTarget, setPostTarget] = useState<GoodsReceipt | null>(null);

  const order = data?.order;
  const items = data?.items ?? [];
  const receipts = data?.receipts ?? [];
  const payments = data?.payments ?? [];

  const remainingQuantity = items.reduce(
    (total, item) => total + Math.max(item.remainingQuantity, 0),
    0,
  );
  const canReceive =
    Boolean(order) &&
    (order!.status === "ordered" || order!.status === "partial") &&
    remainingQuantity > 0;

  const handlePostReceipt = async () => {
    if (!postTarget) return;
    await apiPost(`/admin/goods-receipts/${postTarget.id}/post`, {});
    setPostTarget(null);
    reload();
  };

  const handleDelete = async () => {
    if (!id) return;
    await apiDelete(`/admin/purchase-orders/${id}`);
    router.push("/pembelian");
  };

  return (
    <div className="space-y-6">
      <PageBreadcrumb
        pageTitle="Detail Purchase Order"
        items={[{ label: "Pembelian", href: "/pembelian" }, { label: "Detail PO" }]}
      />

      <div>
        <Link
          href="/pembelian"
          className="text-theme-sm font-medium text-coffee-brown hover:underline dark:text-coffee-caramel"
        >
          ← Kembali ke daftar pembelian
        </Link>
      </div>

      {loading && !data && <LoadingBlock />}
      {error && <ErrorBlock message={error} onRetry={reload} />}

      {order && (
        <>
          <div className="rounded-2xl border border-coffee-linen bg-white p-5 dark:border-coffee-night-border dark:bg-coffee-night-soft">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold text-coffee-espresso dark:text-coffee-cream">
                    {order.number}
                  </h3>
                  <ToneBadge tone={purchaseOrderStatusTone(order.status)}>
                    {purchaseOrderStatusLabel(order.status)}
                  </ToneBadge>
                  <ToneBadge tone={purchasePaymentStatusTone(order.paymentStatus)}>
                    {purchasePaymentStatusLabel(order.paymentStatus)}
                  </ToneBadge>
                </div>
                <p className="mt-1 text-theme-sm text-coffee-muted">
                  {order.supplierName}
                  {order.supplierCode ? ` · ${order.supplierCode}` : ""}
                  {order.branchName ? ` · ${order.branchName}` : ""}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {order.status === "draft" && (
                  <>
                    <button
                      type="button"
                      onClick={() => setEditOpen(true)}
                      className={secondaryButtonClass}
                    >
                      Ubah
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmOpen(true)}
                      className={primaryButtonClass}
                    >
                      Terbitkan PO
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteOpen(true)}
                      className={`${dangerButtonClass} h-10`}
                    >
                      Hapus
                    </button>
                  </>
                )}
                {canReceive && (
                  <button
                    type="button"
                    onClick={() => setReceiptOpen(true)}
                    className={primaryButtonClass}
                  >
                    Terima Barang
                  </button>
                )}
                {order.status !== "draft" &&
                  order.status !== "cancelled" &&
                  order.outstandingIdr > 0 && (
                    <button
                      type="button"
                      onClick={() => router.push(`/pembelian/${order.id}/bayar`)}
                      className={primaryButtonClass}
                    >
                      Catat Pembayaran
                    </button>
                  )}
                {order.status !== "cancelled" && order.status !== "received" && (
                  <button
                    type="button"
                    onClick={() => setCancelOpen(true)}
                    className={dangerButtonClass}
                  >
                    Batalkan
                  </button>
                )}
              </div>
            </div>

            <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <Summary label="Tanggal PO" value={formatDate(order.orderDate)} />
              <Summary
                label="Perkiraan Datang"
                value={order.expectedDate ? formatDate(order.expectedDate) : "—"}
              />
              <Summary
                label="Jatuh Tempo"
                value={order.dueDate ? formatDate(order.dueDate) : "—"}
              />
              <Summary label="Dibuat Oleh" value={order.createdByName ?? "—"} />
              <Summary
                label="Diterima"
                value={order.receivedAt ? formatDateTime(order.receivedAt) : "Belum diterima"}
              />
              {order.notes && (
                <div className="sm:col-span-2 lg:col-span-5">
                  <Summary label="Catatan" value={order.notes} />
                </div>
              )}
              {order.cancelReason && (
                <div className="sm:col-span-2 lg:col-span-5">
                  <Summary label="Alasan Pembatalan" value={order.cancelReason} />
                </div>
              )}
            </dl>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <div className="space-y-5 xl:col-span-2">
              <ComponentCard
                title="Rincian Bahan"
                desc="Kuantitas yang sudah diterima otomatis bertambah saat penerimaan diposting."
              >
                <div className="overflow-x-auto rounded-xl border border-coffee-linen dark:border-coffee-night-border">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-coffee-milk/50 dark:bg-coffee-night-border/50">
                        <th className="px-4 py-2 text-left text-theme-xs font-semibold uppercase tracking-wider text-coffee-muted">
                          Bahan
                        </th>
                        <th className="px-4 py-2 text-right text-theme-xs font-semibold uppercase tracking-wider text-coffee-muted">
                          Dipesan
                        </th>
                        <th className="px-4 py-2 text-right text-theme-xs font-semibold uppercase tracking-wider text-coffee-muted">
                          Diterima
                        </th>
                        <th className="px-4 py-2 text-right text-theme-xs font-semibold uppercase tracking-wider text-coffee-muted">
                          Sisa
                        </th>
                        <th className="px-4 py-2 text-right text-theme-xs font-semibold uppercase tracking-wider text-coffee-muted">
                          Harga
                        </th>
                        <th className="px-4 py-2 text-right text-theme-xs font-semibold uppercase tracking-wider text-coffee-muted">
                          Subtotal
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr
                          key={item.id}
                          className="border-b border-coffee-linen/50 last:border-0 dark:border-coffee-night-border/50"
                        >
                          <td className="px-4 py-2 text-theme-sm">
                            <p className="font-medium text-coffee-dark dark:text-coffee-cream">
                              {item.ingredientName}
                            </p>
                            <p className="text-theme-xs text-coffee-muted">
                              {item.ingredientSku} · {item.baseUnit}
                            </p>
                          </td>
                          <td className="px-4 py-2 text-end text-theme-sm">
                            {formatNumber(item.quantity)}
                          </td>
                          <td className="px-4 py-2 text-end text-theme-sm text-coffee-success">
                            {formatNumber(item.quantityReceived)}
                          </td>
                          <td className="px-4 py-2 text-end text-theme-sm">
                            {formatNumber(item.remainingQuantity)}
                          </td>
                          <td className="px-4 py-2 text-end text-theme-sm">
                            {formatIdr(item.unitPriceIdr)}
                          </td>
                          <td className="px-4 py-2 text-end text-theme-sm font-semibold">
                            {formatIdr(item.lineTotalIdr)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ComponentCard>

              <ComponentCard
                title="Penerimaan Barang"
                desc="Riwayat barang datang. Dokumen draft belum menambah stok."
              >
                {receipts.length === 0 ? (
                  <p className="text-theme-sm text-coffee-muted">Belum ada penerimaan.</p>
                ) : (
                  <div className="space-y-2">
                    {receipts.map((receipt) => (
                      <div
                        key={receipt.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-coffee-linen p-3 dark:border-coffee-night-border"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-theme-sm font-semibold text-coffee-dark dark:text-coffee-cream">
                            {receipt.number}
                          </p>
                          <ToneBadge tone={goodsReceiptStatusTone(receipt.status)}>
                            {goodsReceiptStatusLabel(receipt.status)}
                          </ToneBadge>
                          <span className="text-theme-xs text-coffee-muted">
                            {formatDate(receipt.receivedDate)} · {receipt.stockLocationName}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-theme-sm font-medium">
                            {formatIdr(receipt.totalValueIdr)}
                          </span>
                          <button
                            type="button"
                            onClick={() => setReceiptDetailId(receipt.id)}
                            className={smallButtonClass}
                          >
                            Lihat
                          </button>
                          {receipt.status === "draft" && (
                            <button
                              type="button"
                              onClick={() => setPostTarget(receipt)}
                              className={`${smallButtonClass} text-coffee-brown dark:text-coffee-caramel`}
                            >
                              Posting
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ComponentCard>

              <ComponentCard
                title="Riwayat Pembayaran"
                desc="Pembayaran mengurangi sisa hutang purchase order ini."
              >
                {payments.length === 0 ? (
                  <p className="text-theme-sm text-coffee-muted">Belum ada pembayaran.</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-coffee-linen dark:border-coffee-night-border">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-coffee-milk/50 dark:bg-coffee-night-border/50">
                          <th className="px-4 py-2 text-left text-theme-xs font-semibold uppercase tracking-wider text-coffee-muted">
                            Tanggal
                          </th>
                          <th className="px-4 py-2 text-left text-theme-xs font-semibold uppercase tracking-wider text-coffee-muted">
                            Metode
                          </th>
                          <th className="px-4 py-2 text-left text-theme-xs font-semibold uppercase tracking-wider text-coffee-muted">
                            Referensi
                          </th>
                          <th className="px-4 py-2 text-right text-theme-xs font-semibold uppercase tracking-wider text-coffee-muted">
                            Nominal
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {payments.map((payment) => (
                          <tr
                            key={payment.id}
                            className="border-b border-coffee-linen/50 last:border-0 dark:border-coffee-night-border/50"
                          >
                            <td className="px-4 py-2 text-theme-sm">
                              {formatDate(payment.paidAt)}
                              {payment.createdByName ? (
                                <span className="block text-theme-xs text-coffee-muted">
                                  {payment.createdByName}
                                </span>
                              ) : null}
                            </td>
                            <td className="px-4 py-2 text-theme-sm">
                              {supplierPaymentMethodLabel(payment.method)}
                            </td>
                            <td className="px-4 py-2 text-theme-sm">
                              {payment.reference ?? "—"}
                              {payment.notes ? (
                                <span className="block text-theme-xs text-coffee-muted">
                                  {payment.notes}
                                </span>
                              ) : null}
                            </td>
                            <td className="px-4 py-2 text-end text-theme-sm font-semibold text-coffee-success">
                              {formatIdr(payment.amountIdr)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </ComponentCard>
            </div>

            <div className="space-y-5">
              <ComponentCard title="Ringkasan Nilai">
                <dl className="space-y-2 text-theme-sm">
                  <ValueRow label="Subtotal" value={formatIdr(order.subtotalIdr)} />
                  <ValueRow label="Diskon" value={`− ${formatIdr(order.discountIdr)}`} />
                  <ValueRow label="Pajak / tambahan" value={`+ ${formatIdr(order.taxIdr)}`} />
                  <div className="flex justify-between border-t border-coffee-linen pt-2 font-semibold dark:border-coffee-night-border">
                    <span>Total PO</span>
                    <span className="text-coffee-brown dark:text-coffee-caramel">
                      {formatIdr(order.totalIdr)}
                    </span>
                  </div>
                  <ValueRow
                    label="Sudah dibayar"
                    value={formatIdr(order.paidAmountIdr)}
                    tone="success"
                  />
                  <ValueRow
                    label="Sisa hutang"
                    value={formatIdr(order.outstandingIdr)}
                    tone="danger"
                  />
                </dl>
              </ComponentCard>

              <ComponentCard title="Progres Penerimaan">
                <div className="space-y-2 text-theme-sm">
                  <div className="flex justify-between">
                    <span className="text-coffee-muted">Total dipesan</span>
                    <span className="font-medium">{formatNumber(order.totalQuantity)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-coffee-muted">Sisa belum datang</span>
                    <span className="font-medium">{formatNumber(remainingQuantity)}</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-coffee-linen dark:bg-white/10">
                    <div
                      className="h-full rounded-full bg-coffee-brown transition-all dark:bg-coffee-caramel"
                      style={{
                        width: `${order.totalQuantity > 0 ? Math.min(100, ((order.totalQuantity - remainingQuantity) / order.totalQuantity) * 100) : 0}%`,
                      }}
                    />
                  </div>
                </div>
              </ComponentCard>
            </div>
          </div>
        </>
      )}

      {editOpen && data && (
        <PurchaseOrderFormModal
          detail={data}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            reload();
          }}
        />
      )}

      {confirmOpen && order && (
        <PurchaseOrderConfirmModal
          orderId={order.id}
          orderNumber={order.number}
          onClose={() => setConfirmOpen(false)}
          onConfirmed={reload}
        />
      )}

      {cancelOpen && order && (
        <PurchaseOrderCancelModal
          orderId={order.id}
          orderNumber={order.number}
          onClose={() => setCancelOpen(false)}
          onCancelled={reload}
        />
      )}

      {receiptOpen && order && (
        <GoodsReceiptModal
          order={order}
          items={items}
          onClose={() => setReceiptOpen(false)}
          onSaved={() => {
            setReceiptOpen(false);
            reload();
          }}
        />
      )}

      {deleteOpen && order && (
        <ConfirmDialog
          isOpen
          title="Hapus Purchase Order"
          message={`Hapus draft ${order.number}? Tindakan ini tidak bisa dibatalkan.`}
          confirmLabel="Hapus PO"
          onConfirm={handleDelete}
          onClose={() => setDeleteOpen(false)}
        />
      )}

      {receiptDetailId && (
        <GoodsReceiptDetailModal
          receiptId={receiptDetailId}
          onClose={() => setReceiptDetailId(null)}
          onPost={
            receipts.find((receipt) => receipt.id === receiptDetailId)?.status === "draft"
              ? () => {
                  const target = receipts.find((receipt) => receipt.id === receiptDetailId);
                  if (target) setPostTarget(target);
                  setReceiptDetailId(null);
                }
              : undefined
          }
        />
      )}

      <ConfirmDialog
        isOpen={Boolean(postTarget)}
        title="Posting Penerimaan"
        message={`Posting ${postTarget?.number ?? ""}? Stok bahan akan bertambah sesuai kuantitas yang diterima.`}
        confirmLabel="Posting"
        tone="neutral"
        onConfirm={handlePostReceipt}
        onClose={() => setPostTarget(null)}
      />
    </div>
  );
}

function Summary({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-theme-xs text-coffee-muted">{label}</dt>
      <dd className="mt-0.5 text-theme-sm font-medium text-coffee-dark dark:text-coffee-cream">
        {value}
      </dd>
    </div>
  );
}

function ValueRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "danger";
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-coffee-muted">{label}</dt>
      <dd
        className={
          tone === "success"
            ? "font-medium text-coffee-success"
            : tone === "danger"
              ? "font-medium text-coffee-danger"
              : "font-medium text-coffee-dark dark:text-coffee-cream"
        }
      >
        {value}
      </dd>
    </div>
  );
}
