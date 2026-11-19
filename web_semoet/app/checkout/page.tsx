"use client";

/**
 * Checkout — ringkasan pesanan, alamat/jam ambil, voucher, metode pembayaran.
 */
import {
  Banknote,
  Bike,
  CheckCircle2,
  CreditCard,
  Landmark,
  MapPin,
  QrCode,
  ReceiptText,
  ShoppingBag,
  Tag,
  Trash2,
  Wallet,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { StoreClosedAlert } from "@/components/store-closed-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Loader } from "@/components/ui/loader";
import { ScreenHeading } from "@/components/ui/screen-heading";
import { TextField } from "@/components/ui/text-field";
import { cn } from "@/lib/cn";
import { formatRupiah } from "@/lib/format";
import { useCartHydrated } from "@/lib/use-cart-hydrated";
import { listAddresses } from "@/services/address.service";
import { ApiError } from "@/services/client";
import { createOrder } from "@/services/order.service";
import { claimVoucher, validateVoucher } from "@/services/promo.service";
import { useAuthStore } from "@/store/auth-store";
import { cartSubtotal, lineTotal, useCartStore } from "@/store/cart-store";
import { useStoreClosed } from "@/store/store-status-store";

import type { Address, PaymentMethod } from "@/types/api";

const FULFILLMENTS: { value: "pickup" | "delivery"; label: string; icon: typeof ShoppingBag }[] = [
  { value: "pickup", label: "Ambil di Tempat", icon: ShoppingBag },
  { value: "delivery", label: "Diantar", icon: Bike },
];

const PAYMENT_METHODS: {
  value: PaymentMethod;
  label: string;
  hint: string;
  icon: typeof QrCode;
}[] = [
  { value: "qris", label: "QRIS", hint: "Scan kode QR, bayar langsung", icon: QrCode },
  {
    value: "virtual_account",
    label: "Virtual Account",
    hint: "Transfer via bank",
    icon: Landmark,
  },
  { value: "ewallet", label: "E-Wallet", hint: "GoPay, OVO, ShopeePay, dll.", icon: Wallet },
  { value: "cash", label: "Bayar di Tempat", hint: "Bayar tunai di kasir", icon: Banknote },
];

/** Slot jam pengambilan 15 menit, mulai 30 menit dari sekarang. */
function pickupSlots(): { label: string; value: string }[] {
  const slots: { label: string; value: string }[] = [];
  const start = new Date(Date.now() + 30 * 60 * 1000);
  start.setMinutes(start.getMinutes() + ((15 - (start.getMinutes() % 15)) % 15), 0, 0);
  for (let i = 0; i < 8; i += 1) {
    const at = new Date(start.getTime() + i * 15 * 60 * 1000);
    slots.push({
      label: at.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
      value: at.toISOString(),
    });
  }
  return slots;
}

function newIdempotencyKey(): string {
  return `ord-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function Radio({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2",
        active ? "border-primary" : "border-line",
      )}>
      {active ? <span className="h-[11px] w-[11px] rounded-full bg-primary" /> : null}
    </span>
  );
}

export default function CheckoutPage() {
  const router = useRouter();
  const hydrated = useCartHydrated();
  const { user, status } = useAuthStore();

  const items = useCartStore((state) => state.items);
  const branchId = useCartStore((state) => state.branchId);
  const cartFulfillment = useCartStore((state) => state.fulfillmentType);
  const clearCart = useCartStore((state) => state.clear);
  const storeClosed = useStoreClosed();

  const [initialSlots] = useState(() => pickupSlots());
  const [fulfillment, setFulfillment] = useState<"delivery" | "pickup">(
    cartFulfillment === "delivery" ? "delivery" : "pickup",
  );
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [slots, setSlots] = useState(initialSlots);
  const [pickupAt, setPickupAt] = useState<string | null>(initialSlots[0]?.value ?? null);
  const [payment, setPayment] = useState<PaymentMethod>("qris");
  const [voucherCode, setVoucherCode] = useState("");
  const [appliedVoucher, setAppliedVoucher] = useState<{
    code: string;
    voucherId?: string;
    discountIdr: number;
  } | null>(null);
  const [voucherError, setVoucherError] = useState<string | null>(null);
  const [applyingVoucher, setApplyingVoucher] = useState(false);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guard: redirect ke login jika belum authenticated.
  useEffect(() => {
    if (status !== "loading" && status !== "authenticated") {
      router.replace("/auth/login");
    }
  }, [status, router]);

  const subtotal = cartSubtotal(items);
  const discount = appliedVoucher?.discountIdr ?? 0;
  const total = Math.max(0, subtotal - discount);

  const loadAddresses = useCallback(async () => {
    try {
      const list = await listAddresses();
      setAddresses(list);
      setAddressId((prev) => prev ?? list.find((addr) => addr.isDefault)?.id ?? list[0]?.id ?? null);
    } catch {
      // Gagal memuat alamat — tetap bisa pilih metode ambil sendiri.
    }
  }, []);

  useEffect(() => {
    void loadAddresses();
  }, [loadAddresses]);

  // Slot dikembalikan tiap 5 menit supaya jam yang lewat tidak bisa dipilih.
  useEffect(() => {
    const timer = setInterval(() => {
      const fresh = pickupSlots();
      setSlots(fresh);
      setPickupAt((prev) => (prev && Date.parse(prev) > Date.now() ? prev : fresh[0]?.value ?? null));
    }, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const defaultAddress = useMemo(
    () => addresses.find((addr) => addr.id === addressId) ?? null,
    [addresses, addressId],
  );

  const canSubmit =
    items.length > 0 &&
    !loading &&
    !storeClosed &&
    Boolean(branchId) &&
    (fulfillment === "pickup" ? Boolean(pickupAt) : Boolean(addressId));

  const applyVoucher = async () => {
    const code = voucherCode.trim().toUpperCase();
    if (!code) return;
    setApplyingVoucher(true);
    setVoucherError(null);
    try {
      let target = code;
      let result: Awaited<ReturnType<typeof validateVoucher>>;
      try {
        result = await validateVoucher({ code: target, subtotalIdr: subtotal });
      } catch (err) {
        // User mengetik kode campaign (mis. HEMAT10) yang belum diklaim — klaim dulu.
        if (err instanceof ApiError && err.status === 404) {
          const claimed = await claimVoucher(code);
          target = claimed.code ?? code;
          result = await validateVoucher({ code: target, subtotalIdr: subtotal });
        } else {
          throw err;
        }
      }
      if (result.isValid) {
        setAppliedVoucher({ code: target, voucherId: result.voucherId, discountIdr: result.discountIdr });
        setVoucherCode("");
      } else {
        setAppliedVoucher(null);
        setVoucherError(result.message ?? "Voucher tidak valid untuk pesanan ini.");
      }
    } catch (err) {
      setAppliedVoucher(null);
      setVoucherError(err instanceof Error ? err.message : "Voucher tidak valid.");
    } finally {
      setApplyingVoucher(false);
    }
  };

  const removeVoucher = () => {
    setAppliedVoucher(null);
    setVoucherError(null);
  };

  const submit = async () => {
    if (storeClosed) {
      setError("Toko sedang tutup. Pesanan belum bisa dibuat.");
      return;
    }
    if (!canSubmit || !branchId) {
      if (!branchId) setError("Pilih cabang tujuan di layar keranjang.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const order = await createOrder(
        {
          branchId,
          fulfillmentType: fulfillment,
          items: items.map((item) => ({
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            modifiers: item.modifiers.map((mod) => ({ optionId: mod.optionId, quantity: mod.quantity })),
            specialInstructions: item.specialInstructions,
          })),
          addressId: fulfillment === "delivery" ? addressId : null,
          pickupAt: fulfillment === "pickup" ? pickupAt : null,
          customerNotes: notes.trim() || null,
          promoCode: appliedVoucher && !appliedVoucher.voucherId ? appliedVoucher.code : null,
          voucherId: appliedVoucher?.voucherId ?? null,
        },
        newIdempotencyKey(),
      );

      clearCart();
      router.replace(
        payment !== "cash" ? `/order/${order.id}?autopay=${payment}` : `/order/${order.id}`,
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace("/auth/login");
        return;
      }
      setError(err instanceof Error ? err.message : "Gagal membuat pesanan.");
    } finally {
      setLoading(false);
    }
  };

  if (status === "loading" || !hydrated) return <Loader label="Menyiapkan checkout…" />;

  if (status !== "authenticated") {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-4">
        <ScreenHeading title="Checkout" onBack={() => router.back()} className="mb-4" />
        <EmptyState
          icon={ReceiptText}
          title="Masuk untuk checkout"
          description="Masuk dulu supaya pesananmu tersimpan di akun."
          actionLabel="Masuk / Daftar"
          onAction={() => router.push("/auth/login")}
        />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-4">
        <ScreenHeading title="Checkout" onBack={() => router.back()} className="mb-4" />
        <EmptyState
          icon={ReceiptText}
          title="Keranjang kosong"
          description="Tambahkan menu dulu sebelum checkout."
          actionLabel="Buka Menu"
          onAction={() => router.push("/menu")}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-3xl flex-col px-4 py-4">
      <div className="flex flex-col gap-3.5 pb-4">
        <ScreenHeading
          title="Checkout"
          subtitle={`${items.length} jenis item`}
          onBack={() => router.back()}
        />

        <StoreClosedAlert />

        {/* Ringkasan pesanan */}
        <Card>
          <div className="flex items-center gap-2">
            <ReceiptText size={16} className="text-primary" />
            <p className="text-[13px] font-extrabold text-ink">Ringkasan Pesanan</p>
          </div>
          <div className="mt-2 flex flex-col gap-3">
            {items.map((item) => (
              <div key={item.key} className="flex items-center gap-2.5">
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="h-10 w-10 shrink-0 rounded-[10px] bg-primary-soft object-cover"
                  />
                ) : (
                  <div className="h-10 w-10 shrink-0 rounded-[10px] bg-primary-soft" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold text-ink">{item.name}</p>
                  <p className="truncate text-[11px] text-muted">
                    {item.variantName}
                    {item.modifiers.length > 0
                      ? ` · ${item.modifiers.map((modifier) => modifier.name).join(", ")}`
                      : ""}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted">×{item.quantity}</span>
                <span className="min-w-[64px] shrink-0 text-right text-[13px] font-extrabold text-ink">
                  {formatRupiah(lineTotal(item))}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Metode pesanan */}
        <Card>
          <div className="flex items-center gap-2">
            <MapPin size={16} className="text-primary" />
            <p className="text-[13px] font-extrabold text-ink">Metode Pesanan</p>
          </div>

          <div className="mt-2.5 flex gap-1 rounded-[14px] bg-primary-soft p-1">
            {FULFILLMENTS.map((option) => {
              const active = fulfillment === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFulfillment(option.value)}
                  aria-pressed={active}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-[11px] py-2.5 text-[12.5px] font-bold transition focus-ring",
                    active ? "bg-primary text-white" : "text-muted hover:text-primary",
                  )}>
                  <option.icon size={16} />
                  {option.label}
                </button>
              );
            })}
          </div>

          {fulfillment === "pickup" ? (
            <div className="mt-3 flex flex-col gap-2">
              <p className="text-xs font-bold text-muted">Jam Pengambilan</p>
              <div className="flex flex-wrap gap-2">
                {slots.map((slot) => (
                  <Chip
                    key={slot.value}
                    label={slot.label}
                    size="sm"
                    active={pickupAt === slot.value}
                    onClick={() => setPickupAt(slot.value)}
                  />
                ))}
              </div>
              <p className="text-xs text-muted">
                {user ? `Pesanan atas nama ${user.displayName}` : "Ambil di kasir cabang terpilih"}
              </p>
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              {addresses.length === 0 ? (
                <>
                  <p className="text-xs text-muted">
                    Belum ada alamat tersimpan. Tambahkan dulu sebelum pesanan diantar.
                  </p>
                  <Button
                    title="Tambah Alamat"
                    variant="outline"
                    size="sm"
                    fullWidth={false}
                    icon={MapPin}
                    onClick={() => router.push("/addresses")}
                  />
                </>
              ) : (
                <div className="overflow-hidden rounded-[14px] border border-line">
                  {addresses.map((address, index) => {
                    const active = addressId === address.id;
                    return (
                      <button
                        key={address.id}
                        type="button"
                        onClick={() => setAddressId(address.id)}
                        aria-pressed={active}
                        className={cn(
                          "flex w-full items-center gap-2.5 p-3 text-left transition focus-ring",
                          active ? "bg-primary-soft" : "hover:bg-primary-soft/40",
                          index > 0 && "border-t border-line",
                        )}>
                        <MapPin
                          size={18}
                          className={cn("shrink-0", active ? "text-primary" : "text-muted")}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="text-[13px] font-bold text-ink">{address.label}</span>
                            {address.isDefault ? (
                              <span className="rounded-lg bg-primary-soft px-1.5 py-px text-[10px] font-bold text-primary">
                                Utama
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 line-clamp-2 block text-[11.5px] text-muted">
                            {address.addressLine}
                          </span>
                        </span>
                        <Radio active={active} />
                      </button>
                    );
                  })}
                </div>
              )}
              <button
                type="button"
                onClick={() => router.push("/addresses")}
                className="self-start text-xs font-bold text-primary hover:underline">
                Kelola alamat
              </button>
            </div>
          )}

          {fulfillment === "delivery" && defaultAddress ? (
            <p className="mt-1 text-xs text-muted">
              {defaultAddress.city}
              {defaultAddress.postalCode ? ` • ${defaultAddress.postalCode}` : ""}
            </p>
          ) : null}
        </Card>

        {/* Metode pembayaran */}
        <Card>
          <div className="flex items-center gap-2">
            <CreditCard size={16} className="text-primary" />
            <p className="text-[13px] font-extrabold text-ink">Metode Pembayaran</p>
          </div>
          <div className="mt-1.5">
            {PAYMENT_METHODS.map((method, index) => {
              const active = payment === method.value;
              return (
                <button
                  key={method.value}
                  type="button"
                  onClick={() => setPayment(method.value)}
                  aria-pressed={active}
                  className={cn(
                    "flex w-full items-center gap-3 py-3 text-left transition focus-ring",
                    index > 0 && "border-t border-line",
                  )}>
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border",
                      active
                        ? "border-primary bg-primary-soft text-primary"
                        : "border-line bg-surface text-muted",
                    )}>
                    <method.icon size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-ink">{method.label}</span>
                    <span className="block text-[11.5px] text-muted">{method.hint}</span>
                  </span>
                  <Radio active={active} />
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-muted">
            {payment === "cash"
              ? "Bayar tunai langsung di kasir saat pesanan diambil."
              : "Non-cash diproses aman lewat Midtrans setelah pesanan dibuat."}
          </p>
        </Card>

        {/* Voucher */}
        <Card>
          <div className="flex items-center gap-2">
            <Tag size={16} className="text-primary" />
            <p className="text-[13px] font-extrabold text-ink">Voucher</p>
          </div>
          <div className="mt-2.5">
            {appliedVoucher ? (
              <div className="flex items-center gap-2.5 rounded-[14px] bg-primary-soft p-3">
                <Tag size={20} className="shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-extrabold text-primary">{appliedVoucher.code}</p>
                  <p className="text-xs text-muted">Hemat {formatRupiah(discount)}</p>
                </div>
                <Button
                  title="Hapus"
                  icon={Trash2}
                  variant="ghost"
                  size="sm"
                  fullWidth={false}
                  onClick={removeVoucher}
                />
              </div>
            ) : (
              <div className="flex items-end gap-2.5">
                <div className="min-w-0 flex-1">
                  <TextField
                    label="Kode voucher"
                    placeholder="CONTOH-KODE"
                    value={voucherCode}
                    onChange={(event) => setVoucherCode(event.target.value.toUpperCase())}
                    autoCapitalize="characters"
                    error={voucherError}
                  />
                </div>
                <Button
                  title="Pakai"
                  variant="soft"
                  fullWidth={false}
                  onClick={() => void applyVoucher()}
                  loading={applyingVoucher}
                  className="mb-0.5"
                />
              </div>
            )}
          </div>
        </Card>

        {/* Catatan */}
        <TextField
          label="Catatan untuk barista (opsional)"
          placeholder="Contoh: tanpa gula, level pedas 2"
          multiline
          rows={3}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={500}
        />

        {error ? <Badge tone="danger" label={error} /> : null}
      </div>

      {/* Bar total & buat pesanan */}
      <div className="sticky bottom-0 z-20 mt-auto flex flex-col gap-2 border-t border-line bg-surface/98 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-muted">Subtotal</span>
          <span className="text-sm font-semibold text-ink">{formatRupiah(subtotal)}</span>
        </div>
        {discount > 0 ? (
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] text-muted">Diskon voucher</span>
            <span className="text-sm font-semibold text-danger">-{formatRupiah(discount)}</span>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-3 border-t border-line pt-2">
          <span className="text-[15px] font-extrabold text-ink">Total</span>
          <span className="text-lg font-black text-primary">{formatRupiah(total)}</span>
        </div>
        <Button
          title={
            storeClosed
              ? "Toko sedang tutup"
              : payment === "cash"
                ? "Buat Pesanan"
                : "Lanjut ke Pembayaran"
          }
          icon={payment === "cash" ? CheckCircle2 : CreditCard}
          onClick={() => void submit()}
          loading={loading}
          disabled={!canSubmit}
          size="lg"
        />
      </div>
    </div>
  );
}
