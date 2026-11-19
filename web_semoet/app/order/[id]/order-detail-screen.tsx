"use client";

/**
 * Detail pesanan — status, item, rincian total, bayar / batalkan.
 */
import {
  AlertTriangle,
  HelpCircle,
  MessageCircle,
  RefreshCw,
  ShoppingBag,
  Star,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { OrderStatusTimeline } from "@/components/order-status-timeline";
import { PaymentInstructionsSheet } from "@/components/payment-instructions-sheet";
import { ReportIssueSheet } from "@/components/report-issue-sheet";
import { ReviewSheet } from "@/components/review-sheet";
import { AppDialog } from "@/components/ui/app-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { ErrorState } from "@/components/ui/error-state";
import { Loader } from "@/components/ui/loader";
import { RatingStars } from "@/components/ui/rating-stars";
import { ScreenHeading } from "@/components/ui/screen-heading";
import {
  formatDateTime,
  formatRupiah,
  FULFILLMENT_LABEL,
  PAYMENT_STATUS_LABEL,
} from "@/lib/format";
import { apiErrorFrom } from "@/services/client";
import { cancelOrder, getOrderDetail } from "@/services/order.service";
import { chargeOrder, listOrderPayments, simulatePaymentSuccess } from "@/services/payment.service";
import { listMyReviews } from "@/services/review.service";

import type {
  ChargeResult,
  MyReview,
  OrderDetail,
  OrderItem,
  OrderStatus,
  PaymentMethod,
} from "@/types/api";

const PAY_METHODS: PaymentMethod[] = ["qris", "virtual_account", "ewallet", "cash"];

const PAY_METHOD_LABEL: Record<string, string> = {
  qris: "QRIS",
  virtual_account: "Virtual Account",
  ewallet: "E-Wallet",
  cash: "Bayar di Tempat",
};

const CANCELLABLE: OrderDetail["orderStatus"][] = ["placed", "accepted"];

/** Status yang masih berjalan — dipakai untuk auto-refresh berkala. */
const ACTIVE_STATUSES: OrderStatus[] = [
  "placed",
  "accepted",
  "preparing",
  "ready",
  "out_for_delivery",
];

export default function OrderDetailScreen() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const id = typeof params.id === "string" ? params.id : "";
  const autopay = searchParams.get("autopay");

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [payMethod, setPayMethod] = useState<PaymentMethod>("qris");
  const [charge, setCharge] = useState<ChargeResult | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reviews, setReviews] = useState<MyReview[]>([]);
  const [reviewItem, setReviewItem] = useState<OrderItem | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  // Cegah autopay terpanggil berulang saat order di-refresh.
  const autoPayStarted = useRef(false);

  const load = useCallback(
    async (showSpinner = true) => {
      if (!id) return;
      if (showSpinner) setLoading(true);
      setError(null);
      try {
        setOrder(await getOrderDetail(id));
      } catch (err) {
        setError(apiErrorFrom(err, "Gagal memuat pesanan"));
      } finally {
        setLoading(false);
      }
    },
    [id],
  );

  const refresh = async () => {
    setRefreshing(true);
    await load(false);
    setRefreshing(false);
  };

  const pay = useCallback(
    async (method: PaymentMethod) => {
      if (!order) return;
      setBusy(true);
      setError(null);
      try {
        // Idempotency key stabil per (order, metode) supaya menekan "Bayar"
        // berulang tidak membuat transaksi Midtrans baru.
        const result = await chargeOrder(order.id, method, `pay-${order.id}-${method}`);
        setCharge(result);
        // Refresh order detail setelah charge agar status pembayaran terupdate
        await load(false);
      } catch (err) {
        setError(apiErrorFrom(err, "Gagal memulai pembayaran"));
      } finally {
        setBusy(false);
      }
    },
    [order, load],
  );

  // Simulasi khusus demo/development: butuh ID transaksi pembayaran, bukan ID
  // pesanan. Ambil transaksi terakhir dari pesanan bila belum ada charge aktif.
  const simulate = useCallback(async () => {
    if (!order) return;
    setBusy(true);
    setError(null);
    try {
      let paymentId = charge?.payment?.id ?? null;
      if (!paymentId) {
        const payments = await listOrderPayments(order.id);
        const pending = payments.items.find((item) => item.status === "pending");
        paymentId = pending?.id ?? payments.items[0]?.id ?? null;
      }
      if (!paymentId) {
        setError("Belum ada transaksi pembayaran. Tekan “Bayar Sekarang” terlebih dahulu.");
        return;
      }
      await simulatePaymentSuccess(paymentId);
      setCharge(null);
      await load(false);
    } catch (err) {
      setError(apiErrorFrom(err, "Gagal menyimulasikan pembayaran"));
    } finally {
      setBusy(false);
    }
  }, [order, charge, load]);

  useEffect(() => {
    void load();
  }, [load]);

  const currentOrderId = order?.id;
  const currentOrderStatus = order?.orderStatus;

  // Ulasan hanya relevan untuk pesanan selesai. Ambil sekali per pesanan agar
  // item yang sudah dinilai bisa langsung ditandai di layar detail.
  useEffect(() => {
    if (!currentOrderId || currentOrderStatus !== "completed") {
      setReviews([]);
      return;
    }

    let cancelled = false;
    listMyReviews({ limit: 50 })
      .then((result) => {
        if (!cancelled) setReviews(result.items);
      })
      .catch(() => {
        if (!cancelled) setReviews([]);
      });

    return () => {
      cancelled = true;
    };
  }, [currentOrderId, currentOrderStatus]);

  // Autopay: dibuka dari checkout dengan `autopay=<metode>`.
  useEffect(() => {
    if (!order || autoPayStarted.current || !autopay) return;
    autoPayStarted.current = true;
    const method = (PAY_METHODS as readonly string[]).includes(autopay)
      ? (autopay as PaymentMethod)
      : "qris";
    setPayMethod(method);
    void pay(method);
  }, [order, autopay, pay]);

  const isActiveOrder = order ? ACTIVE_STATUSES.includes(order.orderStatus) : false;

  // Auto-refresh tiap 15 detik selama pesanan masih berjalan supaya pelanggan
  // otomatis tahu begitu statusnya berubah (mis. pesanan siap diambil).
  useEffect(() => {
    if (!isActiveOrder) return;
    const timer = setInterval(() => {
      void load(false);
    }, 15_000);
    return () => clearInterval(timer);
  }, [isActiveOrder, load]);

  const cancel = async () => {
    if (!order) return;
    setBusy(true);
    setError(null);
    try {
      await cancelOrder(order.id, "Dibatalkan oleh customer");
      setCancelOpen(false);
      await load(false);
    } catch (err) {
      setError(apiErrorFrom(err, "Gagal membatalkan pesanan"));
    } finally {
      setBusy(false);
    }
  };

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.replace("/orders");
  };

  if (loading) return <Loader label="Memuat pesanan…" />;

  if (error && !order) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-4">
        <ScreenHeading title="Detail Pesanan" onBack={goBack} className="mb-4" />
        <ErrorState message={error} onRetry={() => void load()} />
      </div>
    );
  }

  if (!order) return null;

  const needsPayment = order.paymentStatus === "unpaid" || order.paymentStatus === "pending";
  // Pesanan yang sudah lunas tidak bisa dibatalkan sendiri — pembatalan/refund
  // harus lewat kasir.
  const canCancel = CANCELLABLE.includes(order.orderStatus) && order.paymentStatus !== "paid";
  const paidButCancellableStage =
    order.paymentStatus === "paid" && CANCELLABLE.includes(order.orderStatus);
  const isCompleted = order.orderStatus === "completed";
  const reviewByItem = new Map(reviews.map((review) => [review.orderItemId, review]));

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <ScreenHeading
          title={order.orderNumber}
          subtitle={order.branchName ?? undefined}
          onBack={goBack}
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
        {/* Status & linimasa pesanan */}
        <OrderStatusTimeline
          status={order.orderStatus}
          fulfillmentType={order.fulfillmentType}
          paymentStatus={order.paymentStatus}
          placedAt={order.placedAt}
          acceptedAt={order.acceptedAt}
          completedAt={order.completedAt}
          cancelledAt={order.cancelledAt}
          pickupAt={order.pickupAt}
        />

        {/* Info pesanan */}
        <Card className="bg-primary-soft/30">
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap gap-2">
              <Badge
                label={PAYMENT_STATUS_LABEL[order.paymentStatus]}
                tone={
                  order.paymentStatus === "paid"
                    ? "success"
                    : order.paymentStatus === "failed"
                      ? "danger"
                      : "warning"
                }
                size="sm"
              />
              <Badge label={FULFILLMENT_LABEL[order.fulfillmentType] ?? order.fulfillmentType} size="sm" />
            </div>
            <p className="text-[13px] text-muted">
              Dipesan {formatDateTime(order.placedAt)}
              {order.pickupAt ? ` · Jam ambil ${formatDateTime(order.pickupAt)}` : ""}
            </p>
            {order.customerNotes ? (
              <p className="text-[13px] italic text-muted">“{order.customerNotes}”</p>
            ) : null}
          </div>
        </Card>

        {/* Item */}
        <Card>
          <div className="flex flex-col gap-3">
            <h2 className="text-[15px] font-extrabold text-ink">Item</h2>
            {order.items.map((item) => (
              <div key={item.id} className="flex gap-3">
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt={item.productName}
                    className="h-[54px] w-[54px] shrink-0 rounded-xl bg-primary-soft object-cover"
                  />
                ) : (
                  <div className="h-[54px] w-[54px] shrink-0 rounded-xl bg-primary-soft" />
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="text-sm font-bold text-ink">
                    {item.productName}{" "}
                    <span className="font-normal text-muted">· {item.variantName}</span>
                  </p>
                  {item.modifiers.length > 0 ? (
                    <p className="text-xs text-muted">
                      {item.modifiers
                        .map((mod) => `${mod.optionName}${mod.quantity > 1 ? ` ×${mod.quantity}` : ""}`)
                        .join(", ")}
                    </p>
                  ) : null}
                  {item.specialInstructions ? (
                    <p className="text-[11px] italic text-muted">“{item.specialInstructions}”</p>
                  ) : null}
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="text-xs text-muted">×{item.quantity}</span>
                    <span className="text-sm font-extrabold text-primary">
                      {formatRupiah(item.lineTotalIdr)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {isCompleted ? (
          <Card>
            <div className="flex flex-col gap-3.5">
              <div className="flex items-start gap-2.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f6efd3] text-gold">
                  <Star size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[15px] font-extrabold text-ink">Ulasan Pesanan</h2>
                  <p className="text-xs leading-5 text-muted">
                    Beri rating untuk item yang sudah kamu nikmati. Ulasan hanya
                    tersedia setelah pesanan selesai.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2.5">
                {order.items.map((item) => {
                  const review = reviewByItem.get(item.id);
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 rounded-[14px] border border-line p-2.5">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.productName}
                          className="h-11 w-11 shrink-0 rounded-xl bg-primary-soft object-cover"
                        />
                      ) : (
                        <div className="h-11 w-11 shrink-0 rounded-xl bg-primary-soft" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-bold text-ink">
                          {item.productName}
                        </p>
                        {review ? (
                          <div className="mt-0.5 flex flex-col gap-0.5">
                            <RatingStars
                              rating={review.averageRating}
                              size={12}
                              showValue={false}
                            />
                            {review.text ? (
                              <p className="line-clamp-2 text-[11px] leading-4 text-muted">
                                {review.text}
                              </p>
                            ) : (
                              <p className="text-[11px] font-semibold text-success">
                                Ulasan terkirim
                              </p>
                            )}
                          </div>
                        ) : (
                          <p className="text-[11px] text-muted">Belum diulas</p>
                        )}
                      </div>
                      <Button
                        title={review ? "Ubah" : "Beri ulasan"}
                        size="sm"
                        variant={review ? "ghost" : "soft"}
                        fullWidth={false}
                        onClick={() => setReviewItem(item)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        ) : null}

        {isCompleted ? (
          <Card className="border-warning/40 bg-[#fbeedd]/40">
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-2.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#fbeedd] text-warning">
                  <AlertTriangle size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[15px] font-extrabold text-ink">
                    Ada masalah dengan pesanan?
                  </h2>
                  <p className="text-xs leading-5 text-muted">
                    Laporkan lewat chat support. Sertakan nomor pesanan agar tim
                    kami bisa mengecek lebih cepat.
                  </p>
                </div>
              </div>
              <Button
                title="Laporkan ke Chat"
                icon={MessageCircle}
                variant="outline"
                onClick={() => setReportOpen(true)}
              />
            </div>
          </Card>
        ) : null}

        {/* Rincian biaya */}
        <Card>
          <div className="flex flex-col gap-2">
            <h2 className="text-[15px] font-extrabold text-ink">Rincian Biaya</h2>
            <Row label="Subtotal" value={formatRupiah(order.subtotalIdr)} />
            {order.discountIdr > 0 ? (
              <Row label="Diskon" value={`-${formatRupiah(order.discountIdr)}`} />
            ) : null}
            {order.taxIdr > 0 ? <Row label="Pajak" value={formatRupiah(order.taxIdr)} /> : null}
            {order.deliveryFeeIdr > 0 ? (
              <Row label="Ongkir" value={formatRupiah(order.deliveryFeeIdr)} />
            ) : null}
            {order.serviceFeeIdr > 0 ? (
              <Row label="Biaya layanan" value={formatRupiah(order.serviceFeeIdr)} />
            ) : null}
            <div className="flex items-center justify-between gap-3 border-t border-line pt-2">
              <span className="text-[15px] font-extrabold text-ink">Total</span>
              <span className="text-base font-black text-primary">{formatRupiah(order.totalIdr)}</span>
            </div>
          </div>
        </Card>

        {error ? <Badge tone="danger" label={error} /> : null}

        {/* Aksi */}
        {needsPayment ? (
          <div className="flex flex-col gap-2.5">
            <p className="text-[13px] font-bold text-ink">Metode Pembayaran</p>
            <div className="flex flex-wrap gap-2">
              {PAY_METHODS.map((method) => (
                <Chip
                  key={method}
                  label={PAY_METHOD_LABEL[method] ?? method}
                  active={payMethod === method}
                  onClick={() => setPayMethod(method)}
                />
              ))}
            </div>
            {payMethod === "cash" ? (
              <>
                <p className="text-xs text-muted">
                  Pesanan tunai dibayar langsung di kasir saat pengambilan — tunjukkan nomor pesanan ini.
                </p>
                <Button title="Bayar di Kasir" variant="soft" disabled size="lg" />
              </>
            ) : (
              <Button
                title="Bayar Sekarang"
                onClick={() => void pay(payMethod)}
                loading={busy}
                size="lg"
              />
            )}
          </div>
        ) : null}

        {canCancel ? (
          <Button
            title="Batalkan Pesanan"
            icon={XCircle}
            variant="danger"
            onClick={() => setCancelOpen(true)}
            loading={busy}
          />
        ) : paidButCancellableStage ? (
          <p className="text-center text-xs text-muted">
            Pesanan sudah dibayar. Untuk pembatalan atau refund, hubungi kasir cabang.
          </p>
        ) : null}

        <Button
          title="Simulasi Bayar Selesai"
          variant="outline"
          onClick={() => void simulate()}
          disabled={busy || order.paymentStatus === "paid"}
        />
        <Button
          title="Pesan Lagi"
          icon={ShoppingBag}
          variant="soft"
          onClick={() => router.replace("/menu")}
        />

        <Link
          href="/faq"
          className="mx-auto flex items-center gap-1.5 text-xs font-bold text-muted transition hover:text-primary focus-ring">
          <HelpCircle size={14} />
          Pusat Bantuan & FAQ
        </Link>
      </div>

      <PaymentInstructionsSheet
        visible={charge !== null}
        charge={charge}
        onClose={() => {
          setCharge(null);
          void load(false);
        }}
        onPaid={() => {
          setCharge(null);
          void load(false);
        }}
      />

      <ReviewSheet
        visible={reviewItem !== null}
        item={reviewItem}
        orderNumber={order.orderNumber}
        existing={reviewItem ? reviewByItem.get(reviewItem.id) ?? null : null}
        onClose={() => setReviewItem(null)}
        onSaved={(saved) => {
          setReviews((prev) => [
            saved,
            ...prev.filter((review) => review.orderItemId !== saved.orderItemId),
          ]);
        }}
      />

      <ReportIssueSheet
        visible={reportOpen}
        order={order}
        onClose={() => setReportOpen(false)}
        onCreated={(conversationId) => {
          setReportOpen(false);
          router.push(`/chat?conversation=${conversationId}`);
        }}
      />

      <AppDialog
        visible={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Batalkan pesanan?"
        message={`Pesanan ${order.orderNumber} akan dibatalkan. Tindakan ini tidak bisa dibatalkan.`}
        icon={XCircle}
        tone="danger"
        confirmLabel="Ya, batalkan"
        confirmVariant="danger"
        confirmLoading={busy}
        cancelLabel="Tidak jadi"
        onConfirm={() => void cancel()}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-sm font-semibold text-ink">{value}</span>
    </div>
  );
}
