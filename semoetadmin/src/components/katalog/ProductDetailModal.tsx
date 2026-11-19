"use client";

import AppModal from "@/components/common/AppModal";
import { EmptyBlock, Skeleton } from "@/components/common/DataState";
import ToneBadge from "@/components/common/ToneBadge";
import { useApi } from "@/hooks/useApi";
import { apiPatch, ApiError } from "@/lib/client";
import { formatIdr, formatNumber } from "@/lib/format";
import { productKindLabel } from "@/lib/labels";
import { inputClass, primaryButtonClass } from "@/lib/ui";
import type { AdminProductVariants, Product, ProductModifierGroup } from "@/types/api";
import { useState } from "react";

interface ProductDetailModalProps {
  product: Product | null;
  onClose: () => void;
}

export default function ProductDetailModal({ product, onClose }: ProductDetailModalProps) {
  const open = Boolean(product);
  const variants = useApi<AdminProductVariants>(
    open ? `/admin/products/${product!.id}/variants` : null,
  );
  const modifiers = useApi<ProductModifierGroup[]>(open ? `/products/${product!.id}/modifiers` : null);

  // Hanya menyimpan nilai yang diubah; sisanya mengikuti data server.
  const [costDraft, setCostDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const closeModal = () => {
    setCostDraft({});
    setSaveError(null);
    setSavedAt(null);
    onClose();
  };

  const handleSave = async () => {
    if (!product || !variants.data) return;
    setSaving(true);
    setSaveError(null);
    try {
      const items = variants.data.variants.map((variant) => ({
        variantId: variant.id,
        costIdr: Math.max(0, Math.round(Number(costDraft[variant.id] ?? variant.costIdr) || 0)),
      }));
      await apiPatch(`/admin/products/${product.id}/variant-costs`, { items });
      setCostDraft({});
      setSavedAt(Date.now());
      variants.reload();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Gagal menyimpan HPP");
    } finally {
      setSaving(false);
    }
  };

  const hasVariants = (variants.data?.variants.length ?? 0) > 0;

  return (
    <AppModal
      isOpen={open}
      onClose={closeModal}
      title={product?.name ?? "Detail Produk"}
      desc={
        product
          ? `${product.category?.name ?? "Tanpa Kategori"} · ${productKindLabel(product.productKind)}`
          : undefined
      }
      size="lg"
      footer={
        hasVariants ? (
          <div className="flex w-full items-center justify-between gap-3">
            <div className="text-theme-xs">
              {saveError ? (
                <span className="text-coffee-danger">{saveError}</span>
              ) : savedAt ? (
                <span className="text-coffee-success">HPP tersimpan.</span>
              ) : (
                <span className="text-coffee-muted">Atur harga modal tiap varian di sini.</span>
              )}
            </div>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className={primaryButtonClass}
            >
              {saving ? "Menyimpan…" : "Simpan HPP"}
            </button>
          </div>
        ) : undefined
      }
    >
      {product && (
        <div className="space-y-6">
          {product.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- gambar produk dari CDN eksternal
            <img
              src={product.imageUrl}
              alt={product.name}
              className="h-56 w-full rounded-xl object-cover"
            />
          )}

          <div className="flex flex-wrap items-center gap-2">
            <ToneBadge tone={product.isActive ? "success" : "muted"}>
              {product.isActive ? "Aktif" : "Nonaktif"}
            </ToneBadge>
            {product.isFeatured && <ToneBadge tone="coffee">Unggulan</ToneBadge>}
            <ToneBadge tone={product.isAvailable === false ? "danger" : "success"}>
              {product.isAvailable === false ? "Habis" : "Tersedia"}
            </ToneBadge>
          </div>

          <dl className="space-y-3 text-theme-sm">
            <Row
              label="Rentang Harga"
              value={
                product.maxPriceIdr && product.maxPriceIdr !== product.basePriceIdr
                  ? `${formatIdr(product.basePriceIdr)} – ${formatIdr(product.maxPriceIdr)}`
                  : formatIdr(product.basePriceIdr)
              }
            />
            <Row
              label="Rating"
              value={
                product.rating && product.rating.count > 0
                  ? `★ ${product.rating.average.toFixed(1)} · ${formatNumber(product.rating.count)} ulasan`
                  : "Belum ada ulasan"
              }
            />
            <Row label="Slug" value={product.slug} mono />
          </dl>

          {product.descriptionShort && (
            <div>
              <h4 className="mb-1.5 text-theme-sm font-semibold text-coffee-espresso dark:text-coffee-cream">
                Deskripsi
              </h4>
              <p className="text-theme-sm text-coffee-dark dark:text-coffee-cream/80">
                {product.descriptionShort}
              </p>
            </div>
          )}

          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h4 className="text-theme-sm font-semibold text-coffee-espresso dark:text-coffee-cream">
                Varian &amp; Harga Modal ({variants.data?.variants.length ?? 0})
              </h4>
            </div>
            {variants.loading && !variants.data ? (
              <Skeleton className="h-20 w-full" />
            ) : !hasVariants ? (
              <EmptyBlock message="Tidak ada varian" />
            ) : (
              <ul className="space-y-2">
                {variants.data!.variants.map((variant) => {
                  const rawCost = costDraft[variant.id] ?? String(variant.costIdr);
                  const costValue = Math.max(0, Math.round(Number(rawCost) || 0));
                  const unitProfit = variant.priceIdr - costValue;
                  return (
                    <li
                      key={variant.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-coffee-linen px-3 py-2 text-theme-sm dark:border-coffee-night-border"
                    >
                      <div className="min-w-[140px]">
                        <span className="flex items-center gap-2">
                          <span className="font-medium text-coffee-espresso dark:text-coffee-cream">
                            {variant.name}
                          </span>
                          {variant.isDefault && <ToneBadge tone="coffee">Utama</ToneBadge>}
                          {!variant.isActive && <ToneBadge tone="muted">Nonaktif</ToneBadge>}
                        </span>
                        <span className="mt-0.5 block text-theme-xs text-coffee-muted">
                          Harga jual {formatIdr(variant.priceIdr)}
                          {costValue > 0 && <> · Laba/unit {formatIdr(unitProfit)}</>}
                        </span>
                      </div>
                      <label className="flex items-center gap-2">
                        <span className="text-theme-xs font-medium text-coffee-muted">HPP</span>
                        <input
                          type="number"
                          min={0}
                          step={500}
                          inputMode="numeric"
                          value={rawCost}
                          onChange={(event) =>
                            setCostDraft((prev) => ({ ...prev, [variant.id]: event.target.value }))
                          }
                          className={`${inputClass} w-32 text-end`}
                          aria-label={`Harga modal varian ${variant.name}`}
                        />
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section>
            <h4 className="mb-2 text-theme-sm font-semibold text-coffee-espresso dark:text-coffee-cream">
              Grup Modifier ({modifiers.data?.length ?? 0})
            </h4>
            {modifiers.loading && !modifiers.data ? (
              <Skeleton className="h-20 w-full" />
            ) : (modifiers.data?.length ?? 0) === 0 ? (
              <EmptyBlock message="Tidak ada modifier" />
            ) : (
              <div className="space-y-3">
                {modifiers.data!.map((group) => (
                  <div
                    key={group.id}
                    className="rounded-xl border border-coffee-linen p-3 dark:border-coffee-night-border"
                  >
                    <p className="flex items-center gap-2 text-theme-sm font-medium text-coffee-espresso dark:text-coffee-cream">
                      {group.name}
                      {group.isRequired && <ToneBadge tone="warning">Wajib</ToneBadge>}
                      <span className="text-theme-xs text-coffee-muted">
                        pilih {group.minSelect}–{group.maxSelect}
                      </span>
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {group.options.map((option) => (
                        <span
                          key={option.id}
                          className="inline-flex items-center rounded-lg border border-coffee-linen px-2 py-0.5 text-theme-xs dark:border-coffee-night-border"
                        >
                          {option.name}
                          {option.priceDeltaIdr > 0 && (
                            <span className="ms-1 font-semibold text-coffee-brown dark:text-coffee-caramel">
                              +{formatIdr(option.priceDeltaIdr)}
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </AppModal>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-dashed border-coffee-linen pb-2.5 last:border-0 dark:border-coffee-night-border">
      <dt className="text-coffee-muted">{label}</dt>
      <dd
        className={`text-end font-medium text-coffee-espresso dark:text-coffee-cream ${mono ? "font-mono text-theme-xs" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
