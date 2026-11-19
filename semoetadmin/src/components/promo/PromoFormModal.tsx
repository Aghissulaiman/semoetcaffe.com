"use client";

import AppModal from "@/components/common/AppModal";
import { Skeleton } from "@/components/common/DataState";
import { useApi } from "@/hooks/useApi";
import { ApiError, apiPatch, apiPost, buildQuery } from "@/lib/client";
import { formatIdr, toDateTimeInputValue } from "@/lib/format";
import {
  fieldLabelClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
  textareaClass,
} from "@/lib/ui";
import type { AdminPromoDetail, Product, ProductCategory, Promo } from "@/types/api";
import { useEffect, useMemo, useState } from "react";

type PromoMode = "voucher" | "direct";

interface PromoFormModalProps {
  isOpen: boolean;
  promo: Promo | null;
  onClose: () => void;
  onSaved: () => void;
}

interface FormState {
  mode: PromoMode;
  code: string;
  name: string;
  description: string;
  discountType: string;
  discountValue: string;
  minimumOrderIdr: string;
  maximumDiscountIdr: string;
  startsAt: string;
  endsAt: string;
  globalQuota: string;
  perUserQuota: string;
  isActive: boolean;
  productIds: string[];
  categoryIds: string[];
}

function defaultStart(): string {
  const date = new Date();
  date.setMinutes(0, 0, 0);
  return toDateTimeInputValue(date);
}

function defaultEnd(): string {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  date.setMinutes(0, 0, 0);
  return toDateTimeInputValue(date);
}

function initialForm(): FormState {
  return {
    mode: "voucher",
    code: "",
    name: "",
    description: "",
    discountType: "percentage",
    discountValue: "10",
    minimumOrderIdr: "0",
    maximumDiscountIdr: "",
    startsAt: defaultStart(),
    endsAt: defaultEnd(),
    globalQuota: "",
    perUserQuota: "",
    isActive: true,
    productIds: [],
    categoryIds: [],
  };
}

function formFromPromo(promo: AdminPromoDetail): FormState {
  return {
    mode: promo.mode === "direct" || !promo.code ? "direct" : "voucher",
    code: promo.code ?? "",
    name: promo.name,
    description: promo.description ?? "",
    discountType: promo.discountType,
    discountValue: String(promo.discountValue),
    minimumOrderIdr: String(promo.minimumOrderIdr ?? 0),
    maximumDiscountIdr:
      promo.maximumDiscountIdr === null ? "" : String(promo.maximumDiscountIdr),
    startsAt: toDateTimeInputValue(promo.startsAt),
    endsAt: toDateTimeInputValue(promo.endsAt),
    globalQuota: promo.globalQuota === null ? "" : String(promo.globalQuota),
    perUserQuota: promo.perUserQuota === null ? "" : String(promo.perUserQuota),
    isActive: promo.isActive,
    productIds: promo.eligibleProducts.map((item) => item.id),
    categoryIds: promo.eligibleCategories.map((item) => item.id),
  };
}

function toNullableInt(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : null;
}

export default function PromoFormModal({
  isOpen,
  promo,
  onClose,
  onSaved,
}: PromoFormModalProps) {
  const detail = useApi<AdminPromoDetail>(
    isOpen && promo ? `/admin/promos/${promo.id}` : null,
  );
  const products = useApi<Product[]>(
    isOpen ? `/admin/products${buildQuery({ limit: 100, sort: "name" })}` : null,
  );
  const categories = useApi<ProductCategory[]>(isOpen ? "/categories" : null);

  const [form, setForm] = useState<FormState>(initialForm);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadedPromoId, setLoadedPromoId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setLoadedPromoId(null);
      return;
    }
    if (!promo) {
      setForm(initialForm());
      setSearch("");
      setError(null);
      setLoadedPromoId(null);
      return;
    }
    if (detail.data && loadedPromoId !== detail.data.id) {
      setForm(formFromPromo(detail.data));
      setLoadedPromoId(detail.data.id);
      setError(null);
    }
  }, [isOpen, promo, detail.data, loadedPromoId]);

  const filteredProducts = useMemo(() => {
    const list = products.data ?? [];
    const keyword = search.trim().toLowerCase();
    if (!keyword) return list;
    return list.filter(
      (item) =>
        item.name.toLowerCase().includes(keyword) ||
        item.category?.name?.toLowerCase().includes(keyword),
    );
  }, [products.data, search]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const toggleId = (key: "productIds" | "categoryIds", id: string) => {
    setForm((prev) => {
      const current = prev[key];
      return {
        ...prev,
        [key]: current.includes(id)
          ? current.filter((item) => item !== id)
          : [...current, id],
      };
    });
  };

  const isDirect = form.mode === "direct";
  const loadingDetail = Boolean(promo) && detail.loading && !detail.data;

  const handleSave = async () => {
    setError(null);

    if (form.name.trim().length < 3) {
      setError("Nama promo minimal 3 karakter.");
      return;
    }
    if (!isDirect && form.code.trim().length < 3) {
      setError("Kode voucher minimal 3 karakter.");
      return;
    }
    if (isDirect && form.productIds.length + form.categoryIds.length === 0) {
      setError("Pilih minimal satu menu atau kategori untuk diskon langsung.");
      return;
    }
    if (!form.startsAt || !form.endsAt) {
      setError("Periode promo wajib diisi.");
      return;
    }
    if (new Date(form.endsAt) <= new Date(form.startsAt)) {
      setError("Waktu selesai harus setelah waktu mulai.");
      return;
    }
    if (form.discountType === "percentage" && Number(form.discountValue) > 100) {
      setError("Diskon persentase maksimal 100%.");
      return;
    }

    const body: Record<string, unknown> = {
      code: isDirect ? null : form.code.trim().toUpperCase(),
      name: form.name.trim(),
      description: form.description.trim() || null,
      discountType: form.discountType,
      discountValue: Number(form.discountValue || 0),
      minimumOrderIdr: isDirect ? 0 : Number(form.minimumOrderIdr || 0),
      maximumDiscountIdr: toNullableInt(form.maximumDiscountIdr),
      startsAt: new Date(form.startsAt).toISOString(),
      endsAt: new Date(form.endsAt).toISOString(),
      globalQuota: toNullableInt(form.globalQuota),
      perUserQuota: toNullableInt(form.perUserQuota),
      isActive: form.isActive,
      productIds: form.productIds,
      categoryIds: form.categoryIds,
    };

    setSaving(true);
    try {
      if (promo) {
        await apiPatch(`/admin/promos/${promo.id}`, body);
      } else {
        await apiPost("/admin/promos", body);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan promo");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppModal
      isOpen={isOpen}
      onClose={onClose}
      title={promo ? "Ubah Promo" : "Tambah Promo"}
      desc="Buat kode voucher atau diskon langsung pada menu."
      size="xl"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className={secondaryButtonClass}
            disabled={saving}
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleSave}
            className={primaryButtonClass}
            disabled={saving || loadingDetail}
          >
            {saving ? "Menyimpan…" : "Simpan"}
          </button>
        </>
      }
    >
      {loadingDetail ? (
        <Skeleton className="h-[420px] w-full" />
      ) : detail.error ? (
        <div className="rounded-xl border border-coffee-danger/30 bg-coffee-danger/5 px-4 py-3 text-theme-sm text-coffee-danger">
          {detail.error}
        </div>
      ) : (
        <div className="space-y-5">
          {error && (
            <div className="rounded-xl border border-coffee-danger/30 bg-coffee-danger/5 px-4 py-3 text-theme-sm text-coffee-danger">
              {error}
            </div>
          )}

          <div>
            <p className={fieldLabelClass}>Jenis Promo *</p>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => set("mode", "voucher")}
                className={`rounded-xl border p-4 text-start transition-colors ${
                  form.mode === "voucher"
                    ? "border-coffee-brown bg-coffee-brown/5 dark:border-coffee-caramel dark:bg-coffee-caramel/10"
                    : "border-coffee-linen hover:bg-coffee-milk/60 dark:border-coffee-night-border dark:hover:bg-white/5"
                }`}
              >
                <p className="text-theme-sm font-semibold text-coffee-espresso dark:text-coffee-cream">
                  Kode Voucher
                </p>
                <p className="mt-1 text-theme-xs text-coffee-muted">
                  Pelanggan mengklaim dan memasukkan kode promo saat checkout.
                </p>
              </button>
              <button
                type="button"
                onClick={() => {
                  setForm((prev) => ({
                    ...prev,
                    mode: "direct",
                    discountType: prev.discountType === "free_item" ? "percentage" : prev.discountType,
                    minimumOrderIdr: "0",
                  }));
                }}
                className={`rounded-xl border p-4 text-start transition-colors ${
                  form.mode === "direct"
                    ? "border-coffee-brown bg-coffee-brown/5 dark:border-coffee-caramel dark:bg-coffee-caramel/10"
                    : "border-coffee-linen hover:bg-coffee-milk/60 dark:border-coffee-night-border dark:hover:bg-white/5"
                }`}
              >
                <p className="text-theme-sm font-semibold text-coffee-espresso dark:text-coffee-cream">
                  Diskon Langsung Menu
                </p>
                <p className="mt-1 text-theme-xs text-coffee-muted">
                  Harga menu otomatis turun tanpa kode selama periode promo.
                </p>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className={fieldLabelClass}>Nama Promo *</span>
              <input
                value={form.name}
                onChange={(event) => set("name", event.target.value)}
                placeholder="Contoh: Promo Ramadan, Diskon Kopi Senin"
                className={inputClass}
              />
            </label>

            {!isDirect && (
              <label className="flex flex-col gap-1.5">
                <span className={fieldLabelClass}>Kode Voucher *</span>
                <input
                  value={form.code}
                  onChange={(event) => set("code", event.target.value.toUpperCase())}
                  placeholder="RAMADAN2027"
                  className={`${inputClass} font-mono uppercase`}
                />
              </label>
            )}

            <label className={`flex flex-col gap-1.5 ${isDirect ? "sm:col-span-2" : ""}`}>
              <span className={fieldLabelClass}>Jenis Diskon *</span>
              <select
                value={form.discountType}
                onChange={(event) => set("discountType", event.target.value)}
                className={inputClass}
              >
                <option value="percentage">Persentase (%)</option>
                <option value="fixed">Nominal (Rp)</option>
                {!isDirect && <option value="free_item">Item Gratis</option>}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className={fieldLabelClass}>
                {form.discountType === "percentage"
                  ? "Besar Diskon (%) *"
                  : form.discountType === "fixed"
                    ? "Besar Diskon (Rp) *"
                    : "Nilai Diskon"}
              </span>
              <input
                type="number"
                min={0}
                value={form.discountValue}
                onChange={(event) => set("discountValue", event.target.value)}
                className={inputClass}
              />
              {form.discountType === "fixed" && form.discountValue && (
                <span className="text-theme-xs text-coffee-muted">
                  {formatIdr(Number(form.discountValue))}
                  {isDirect ? " per menu" : " per transaksi"}
                </span>
              )}
            </label>

            <label className="flex flex-col gap-1.5">
              <span className={fieldLabelClass}>Maks. Diskon (Rp)</span>
              <input
                type="number"
                min={0}
                value={form.maximumDiscountIdr}
                onChange={(event) => set("maximumDiscountIdr", event.target.value)}
                placeholder="Kosongkan bila tanpa batas"
                className={inputClass}
              />
              <span className="text-theme-xs text-coffee-muted">
                {isDirect ? "Batas diskon per menu." : "Batas total diskon transaksi."}
              </span>
            </label>

            {!isDirect && (
              <label className="flex flex-col gap-1.5">
                <span className={fieldLabelClass}>Minimum Belanja (Rp)</span>
                <input
                  type="number"
                  min={0}
                  value={form.minimumOrderIdr}
                  onChange={(event) => set("minimumOrderIdr", event.target.value)}
                  className={inputClass}
                />
              </label>
            )}

            <label className="flex flex-col gap-1.5">
              <span className={fieldLabelClass}>Kuota Global</span>
              <input
                type="number"
                min={0}
                value={form.globalQuota}
                onChange={(event) => set("globalQuota", event.target.value)}
                placeholder="Tak terbatas"
                className={inputClass}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className={fieldLabelClass}>Kuota per Pengguna</span>
              <input
                type="number"
                min={0}
                value={form.perUserQuota}
                onChange={(event) => set("perUserQuota", event.target.value)}
                placeholder="Tak terbatas"
                className={inputClass}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className={fieldLabelClass}>Mulai *</span>
              <input
                type="datetime-local"
                value={form.startsAt}
                onChange={(event) => set("startsAt", event.target.value)}
                className={inputClass}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className={fieldLabelClass}>Selesai *</span>
              <input
                type="datetime-local"
                value={form.endsAt}
                onChange={(event) => set("endsAt", event.target.value)}
                className={inputClass}
              />
            </label>

            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className={fieldLabelClass}>Deskripsi</span>
              <textarea
                value={form.description}
                onChange={(event) => set("description", event.target.value)}
                rows={2}
                placeholder="Keterangan singkat promo (opsional)"
                className={textareaClass}
              />
            </label>
          </div>

          <div className="rounded-xl border border-coffee-linen p-4 dark:border-coffee-night-border">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className={fieldLabelClass}>
                  Sasaran Menu {isDirect ? "*" : "(opsional)"}
                </p>
                <p className="mt-1 text-theme-xs text-coffee-muted">
                  {isDirect
                    ? "Diskon hanya berlaku untuk menu/kategori yang dipilih."
                    : "Kosongkan agar voucher berlaku untuk semua menu."}
                </p>
              </div>
              <span className="rounded-full bg-coffee-milk px-2.5 py-1 text-theme-xs font-medium text-coffee-brown dark:bg-white/10 dark:text-coffee-caramel">
                {form.productIds.length + form.categoryIds.length} dipilih
              </span>
            </div>

            {categories.data && categories.data.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-theme-xs font-semibold text-coffee-dark dark:text-coffee-cream/80">
                  Kategori
                </p>
                <div className="flex flex-wrap gap-2">
                  {categories.data.map((category) => {
                    const checked = form.categoryIds.includes(category.id);
                    return (
                      <button
                        key={category.id}
                        type="button"
                        onClick={() => toggleId("categoryIds", category.id)}
                        className={`rounded-full border px-3 py-1.5 text-theme-xs font-medium transition-colors ${
                          checked
                            ? "border-coffee-brown bg-coffee-brown text-coffee-milk dark:border-coffee-caramel dark:bg-coffee-caramel dark:text-coffee-night"
                            : "border-coffee-linen text-coffee-dark hover:bg-coffee-milk dark:border-coffee-night-border dark:text-coffee-cream dark:hover:bg-white/5"
                        }`}
                      >
                        {category.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-4">
              <p className="mb-2 text-theme-xs font-semibold text-coffee-dark dark:text-coffee-cream/80">
                Menu
              </p>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari menu…"
                className={`${inputClass} mb-2`}
              />
              {products.loading && !products.data ? (
                <Skeleton className="h-28 w-full" />
              ) : (filteredProducts.length ?? 0) === 0 ? (
                <p className="rounded-lg border border-dashed border-coffee-linen px-3 py-4 text-center text-theme-xs text-coffee-muted dark:border-coffee-night-border">
                  Tidak ada menu yang cocok.
                </p>
              ) : (
                <div className="grid max-h-52 grid-cols-1 gap-2 overflow-y-auto pe-1 sm:grid-cols-2">
                  {filteredProducts.map((product) => {
                    const checked = form.productIds.includes(product.id);
                    return (
                      <label
                        key={product.id}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-theme-xs transition-colors ${
                          checked
                            ? "border-coffee-brown/40 bg-coffee-brown/5 dark:border-coffee-caramel/40 dark:bg-coffee-caramel/10"
                            : "border-coffee-linen hover:bg-coffee-milk/60 dark:border-coffee-night-border dark:hover:bg-white/5"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleId("productIds", product.id)}
                          className="h-4 w-4 accent-coffee-brown"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-coffee-espresso dark:text-coffee-cream">
                            {product.name}
                          </span>
                          <span className="block truncate text-coffee-muted">
                            {product.category?.name ?? "-"} · {formatIdr(product.basePriceIdr)}
                          </span>
                        </span>
                        {!product.isActive && (
                          <span className="rounded bg-coffee-muted/10 px-1.5 py-0.5 text-[10px] text-coffee-muted">
                            Nonaktif
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <label className="flex items-center gap-2 text-theme-sm text-coffee-dark dark:text-coffee-cream/80">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => set("isActive", event.target.checked)}
              className="h-4 w-4 accent-coffee-brown"
            />
            Aktifkan promo ini
          </label>
        </div>
      )}
    </AppModal>
  );
}
