"use client";

/**
 * Detail produk — GET /products/:slug (produk, varian, modifier, gambar)
 * + GET /products/:id/reviews untuk cuplikan ulasan.
 */
import {
  ArrowLeft,
  Check,
  Coffee,
  Heart,
  Lock,
  ShoppingCart,
  Sparkles,
  Store,
  Utensils,
} from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { StoreClosedAlert } from "@/components/store-closed-alert";
import { AppDialog, type DialogTone } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Loader } from "@/components/ui/loader";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { RatingStars } from "@/components/ui/rating-stars";
import { TextField } from "@/components/ui/text-field";
import { cn } from "@/lib/cn";
import { formatRupiah } from "@/lib/format";
import { apiErrorFrom } from "@/services/client";
import { getProductDetail, listProductReviews } from "@/services/catalog.service";
import { addFavorite, removeFavorite } from "@/services/favorite.service";
import { useAuthStore } from "@/store/auth-store";
import { useCartStore } from "@/store/cart-store";
import { useReservationDraftStore } from "@/store/reservation-draft-store";
import { useStoreClosed } from "@/store/store-status-store";

import type { ModifierGroup, ProductDetail, Review } from "@/types/api";

interface DialogState {
  title: string;
  message?: string;
  icon?: LucideIcon;
  tone?: DialogTone;
  confirmLabel?: string;
  confirmVariant?: "primary" | "danger" | "soft";
  cancelLabel?: string;
  onConfirm?: () => void;
  /** Bila true, menutup dialog (X/batal) ikut kembali ke layar sebelumnya. */
  backOnClose?: boolean;
}

export default function ProductDetailScreen() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const slug = typeof params.slug === "string" ? params.slug : "";
  // Mode reservasi: "Tambah" menyimpan pilihan ke draf reservasi (bukan keranjang).
  const reservationMode = searchParams.get("mode") === "reservation";

  const isAuthenticated = useAuthStore((state) => state.status === "authenticated");
  const addItem = useCartStore((state) => state.addItem);
  const addMenuPick = useReservationDraftStore((state) => state.addMenuPick);
  const storeClosed = useStoreClosed();

  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [variantId, setVariantId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [favorite, setFavorite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const load = useCallback(async () => {
    if (!slug) {
      setError("Produk tidak ditemukan");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setError(null);
      const result = await getProductDetail(slug);
      // Backend lama bisa mengirim array null untuk produk tanpa varian /
      // modifier. Normalisasi di sini supaya render tidak pernah meledak.
      const variants = result.variants ?? [];
      const modifierGroups = result.modifierGroups ?? [];
      const images = result.images ?? [];
      setDetail({
        ...result,
        variants,
        modifierGroups,
        images,
        rating: result.rating ?? { average: 0, count: 0 },
      });
      setFavorite(result.isFavorite);
      const defaultVariant = variants.find((variant) => variant.isDefault) ?? variants[0] ?? null;
      setVariantId(defaultVariant?.id ?? null);
      const initial: Record<string, string[]> = {};
      for (const group of modifierGroups) {
        initial[group.id] = group.isRequired
          ? group.options.slice(0, group.minSelect).map((option) => option.id)
          : [];
      }
      setSelected(initial);
      setReviews(await listProductReviews(result.id, 1, 3).then((page) => page.items).catch(() => []));
    } catch (err) {
      setError(apiErrorFrom(err, "Gagal memuat produk"));
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const variant = useMemo(
    () => detail?.variants.find((item) => item.id === variantId) ?? detail?.variants[0] ?? null,
    [detail, variantId],
  );

  const modifierTotal = useMemo(() => {
    return Object.entries(selected).reduce((total, [groupId, optionIds]) => {
      const group = detail?.modifierGroups.find((item) => item.id === groupId);
      if (!group) return total;
      return (
        total +
        optionIds.reduce((sum, optionId) => {
          const option = group.options.find((item) => item.id === optionId);
          return sum + (option?.priceDeltaIdr ?? 0);
        }, 0)
      );
    }, 0);
  }, [detail, selected]);

  const unitPrice = (variant?.promoPriceIdr ?? variant?.priceIdr ?? 0) + modifierTotal;
  // Reservasi memakai harga normal (promo menu hanya berlaku untuk order).
  const reservationUnitPrice = (variant?.priceIdr ?? 0) + modifierTotal;

  const toggleOption = (group: ModifierGroup, optionId: string) => {
    setSelected((prev) => {
      const current = prev[group.id] ?? [];
      const isSelected = current.includes(optionId);
      if (isSelected) {
        if (group.isRequired && current.length <= group.minSelect) return prev;
        return { ...prev, [group.id]: current.filter((id) => id !== optionId) };
      }
      if (current.length >= group.maxSelect) {
        // Lepas pilihan paling awal agar batas maksimum terpenuhi.
        return { ...prev, [group.id]: [...current.slice(1), optionId] };
      }
      return { ...prev, [group.id]: [...current, optionId] };
    });
  };

  const toggleFavorite = async () => {
    if (!detail) return;
    if (!isAuthenticated) {
      setDialog({
        title: "Masuk dulu",
        message: "Login untuk menyimpan menu favorit.",
        icon: Lock,
        tone: "primary",
        confirmLabel: "Masuk",
        onConfirm: () => {
          setDialog(null);
          router.push("/auth/login");
        },
        cancelLabel: "Batal",
      });
      return;
    }
    setBusy(true);
    try {
      if (favorite) await removeFavorite(detail.id);
      else await addFavorite(detail.id);
      setFavorite(!favorite);
    } catch (err) {
      setDialog({
        title: "Gagal",
        message: apiErrorFrom(err),
        icon: Coffee,
        tone: "danger",
      });
    } finally {
      setBusy(false);
    }
  };

  const addToCart = () => {
    if (!detail || !variant) return;

    // Mode reservasi: simpan pilihan (varian + modifier + jumlah) ke draf
    // reservasi, lalu kembalikan pengguna ke layar pilih menu.
    if (reservationMode) {
      const modifierNames = detail.modifierGroups
        .flatMap((group) =>
          (selected[group.id] ?? []).map(
            (optionId) => group.options.find((option) => option.id === optionId)?.name ?? "",
          ),
        )
        .filter(Boolean);
      const modifierOptionIds = Object.values(selected).flat();

      addMenuPick({
        productId: detail.id,
        variantId: variant.id,
        name: detail.name,
        priceIdr: reservationUnitPrice,
        quantity,
        variantName: detail.variants.length > 1 ? variant.name : undefined,
        modifierNames: modifierNames.length > 0 ? modifierNames : undefined,
        modifierOptionIds: modifierOptionIds.length > 0 ? modifierOptionIds : undefined,
      });

      setDialog({
        title: "Ditambahkan ke reservasi",
        message: `${detail.name}${
          detail.variants.length > 1 ? ` (${variant.name})` : ""
        } x${quantity} masuk ke pesanan reservasi.`,
        icon: Utensils,
        tone: "success",
        confirmLabel: "Pilih menu lain",
        confirmVariant: "primary",
        onConfirm: () => {
          setDialog(null);
          setQuantity(1);
          setNotes("");
        },
        cancelLabel: "Selesai, kembali",
        backOnClose: true,
      });
      return;
    }

    if (storeClosed) {
      setDialog({
        title: "Toko sedang tutup",
        message:
          "Pemesanan online belum bisa dilakukan. Silakan kembali saat toko buka.",
        icon: Store,
        tone: "warning",
      });
      return;
    }

    const modifiers = Object.entries(selected).flatMap(([groupIdValue, optionIds]) =>
      optionIds.map((optionId) => {
        const group = detail.modifierGroups.find((item) => item.id === groupIdValue);
        const option = group?.options.find((item) => item.id === optionId);
        return {
          optionId,
          groupId: groupIdValue,
          name: option?.name ?? "",
          priceDeltaIdr: option?.priceDeltaIdr ?? 0,
          quantity: 1,
        };
      }),
    );

    addItem({
      productId: detail.id,
      variantId: variant.id,
      name: detail.name,
      variantName: variant.name,
      imageUrl: detail.images.find((image) => image.isPrimary)?.url ?? detail.images[0]?.url ?? detail.imageUrl,
      unitPriceIdr: variant.promoPriceIdr ?? variant.priceIdr,
      modifiers,
      quantity,
      specialInstructions: notes.trim() || null,
    });

    setDialog({
      title: "Ditambahkan ke keranjang",
      message: `${detail.name} (${variant.name}) siap untuk checkout.`,
      icon: ShoppingCart,
      tone: "success",
      confirmLabel: "Ke keranjang",
      confirmVariant: "primary",
      onConfirm: () => {
        setDialog(null);
        router.push("/cart");
      },
      cancelLabel: "Lanjut belanja",
    });
  };

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.replace("/menu");
  };

  if (loading) return <Loader label="Memuat produk…" />;

  if (error || !detail) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-4">
        <ErrorState message={error ?? "Produk tidak ditemukan"} onRetry={() => void load()} />
        <Button title="Kembali" variant="soft" onClick={goBack} />
      </div>
    );
  }

  const rating = detail.rating;
  const heroImage =
    detail.images.find((image) => image.isPrimary)?.url ?? detail.images[0]?.url ?? detail.imageUrl;
  const displayedPrice = reservationMode ? reservationUnitPrice : unitPrice;

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl flex-col px-4 py-4">
      <div className="flex flex-1 flex-col gap-5 md:flex-row">
        {/* Hero */}
        <div className="md:sticky md:top-20 md:h-fit md:w-[45%] md:self-start">
          <div className="relative overflow-hidden rounded-[22px] bg-primary-soft">
            {heroImage ? (
              <img
                src={heroImage}
                alt={detail.name}
                className="aspect-[4/3] w-full object-cover md:aspect-square"
              />
            ) : (
              <div className="flex aspect-[4/3] w-full items-center justify-center text-muted md:aspect-square">
                <Coffee size={64} />
              </div>
            )}

            <button
              type="button"
              onClick={goBack}
              aria-label="Kembali"
              className="absolute left-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface text-ink shadow-sm transition hover:bg-primary-soft focus-ring">
              <ArrowLeft size={20} />
            </button>
            <button
              type="button"
              onClick={() => void toggleFavorite()}
              disabled={busy}
              aria-label={favorite ? "Hapus dari favorit" : "Tambah ke favorit"}
              aria-pressed={favorite}
              className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface shadow-sm transition hover:bg-primary-soft focus-ring disabled:opacity-60">
              <Heart
                size={20}
                className={favorite ? "text-danger" : "text-ink"}
                fill={favorite ? "currentColor" : "none"}
              />
            </button>
          </div>
        </div>

        {/* Detail */}
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-3">
              <h1 className="min-w-0 flex-1 text-[22px] font-black leading-tight text-ink">
                {detail.name}
              </h1>
              <RatingStars rating={rating.average} count={rating.count} className="shrink-0 pt-1" />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <p
                className={cn(
                  "text-xl font-extrabold",
                  !reservationMode && variant?.promo ? "text-danger" : "text-primary",
                )}>
                {formatRupiah(displayedPrice)}
                <span className="text-[13px] font-semibold text-muted"> / {variant?.name ?? "-"}</span>
              </p>
              {!reservationMode && variant?.promo ? (
                <>
                  <span className="text-[13px] text-muted line-through">
                    {formatRupiah(variant.promo.originalPriceIdr)}
                  </span>
                  <span className="rounded-full bg-primary-soft px-2 py-[3px] text-[10px] font-extrabold text-danger">
                    PROMO {variant.promo.name}
                  </span>
                </>
              ) : null}
            </div>

            {detail.description ? (
              <p className="text-sm leading-[21px] text-muted">{detail.description}</p>
            ) : null}
          </div>

          {reservationMode ? (
            <div className="flex items-start gap-2 rounded-[14px] bg-primary-soft p-3">
              <Sparkles size={16} className="mt-0.5 shrink-0 text-primary" />
              <p className="text-xs leading-[18px] text-muted">
                Mode reservasi: pilihan ini masuk ke pesanan menu reservasi, bukan keranjang.
              </p>
            </div>
          ) : (
            <StoreClosedAlert />
          )}

          {/* Varian */}
          {detail.variants.length > 1 ? (
            <section className="flex flex-col gap-2.5">
              <h2 className="text-sm font-extrabold text-ink">Ukuran / Varian</h2>
              <div className="flex flex-wrap gap-2">
                {detail.variants.map((item) => {
                  const active = item.id === variantId;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setVariantId(item.id)}
                      aria-pressed={active}
                      className={cn(
                        "rounded-full border-[1.5px] px-4 py-2.5 text-[13px] font-bold transition focus-ring",
                        active
                          ? "border-primary bg-primary-soft text-primary"
                          : "border-line bg-surface text-ink hover:border-primary/40",
                      )}>
                      {item.name} ·{" "}
                      {formatRupiah(!reservationMode && item.promoPriceIdr ? item.promoPriceIdr : item.priceIdr)}
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          {/* Modifier */}
          {detail.modifierGroups.map((group) => (
            <section key={group.id} className="flex flex-col gap-2.5">
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-extrabold text-ink">{group.name}</h2>
                <span className="text-xs text-muted">
                  {group.isRequired ? "wajib" : "opsional"} · maks {group.maxSelect}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {group.options.map((option) => {
                  const active = (selected[group.id] ?? []).includes(option.id);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => toggleOption(group, option.id)}
                      aria-pressed={active}
                      className={cn(
                        "flex items-center gap-3 rounded-[14px] border p-3 text-left transition focus-ring",
                        active
                          ? "border-primary bg-primary-soft"
                          : "border-line bg-surface hover:border-primary/40",
                      )}>
                      <span
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border-[1.5px]",
                          active ? "border-primary bg-primary text-white" : "border-line text-transparent",
                        )}>
                        <Check size={13} />
                      </span>
                      <span className="min-w-0 flex-1 text-sm font-semibold text-ink">{option.name}</span>
                      {option.priceDeltaIdr > 0 ? (
                        <span className="shrink-0 text-[13px] font-bold text-primary">
                          +{formatRupiah(option.priceDeltaIdr)}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}

          {/* Catatan */}
          <TextField
            label={reservationMode ? "Catatan menu" : "Catatan untuk barista"}
            placeholder="Contoh: tanpa gula, es sedikit…"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={500}
            multiline
            rows={3}
          />

          {/* Ulasan */}
          {reviews.length > 0 ? (
            <section className="flex flex-col gap-2.5">
              <h2 className="text-sm font-extrabold text-ink">Ulasan pelanggan</h2>
              {reviews.map((review) => (
                <div key={review.id} className="flex flex-col gap-1.5 rounded-[14px] border border-line p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] font-extrabold text-ink">
                      {review.userName ?? "Pelanggan"}
                    </p>
                    <RatingStars
                      rating={review.foodRating ?? review.serviceRating}
                      size={12}
                      showValue={false}
                    />
                  </div>
                  {review.text ? (
                    <p className="text-[13px] leading-[19px] text-muted">{review.text}</p>
                  ) : null}
                </div>
              ))}
            </section>
          ) : null}
        </div>
      </div>

      {/* Footer: jumlah + tambah */}
      <div className="sticky bottom-0 z-20 mt-4 border-t border-line bg-surface/98 py-3 backdrop-blur">
        <div className="flex items-center gap-3.5">
          <QuantityStepper value={quantity} onChange={(value) => setQuantity(Math.max(1, value))} />
          <Button
            title={
              reservationMode
                ? `Tambah ke reservasi · ${formatRupiah(reservationUnitPrice * quantity)}`
                : storeClosed
                  ? "Toko sedang tutup"
                  : `Tambah · ${formatRupiah(unitPrice * quantity)}`
            }
            onClick={addToCart}
            disabled={!reservationMode && storeClosed}
            size="lg"
            className="flex-1"
          />
        </div>
      </div>

      <AppDialog
        visible={Boolean(dialog)}
        onClose={() => {
          const shouldGoBack = dialog?.backOnClose ?? false;
          setDialog(null);
          if (shouldGoBack) goBack();
        }}
        title={dialog?.title ?? ""}
        message={dialog?.message}
        icon={dialog?.icon}
        tone={dialog?.tone}
        confirmLabel={dialog?.confirmLabel}
        confirmVariant={dialog?.confirmVariant}
        onConfirm={dialog?.onConfirm}
        cancelLabel={dialog?.cancelLabel}
      />
    </div>
  );
}
