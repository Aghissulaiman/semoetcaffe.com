"use client";

import ComponentCard from "@/components/common/ComponentCard";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { EmptyBlock, ErrorBlock, Skeleton } from "@/components/common/DataState";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import Pagination from "@/components/common/Pagination";
import ProductCard from "@/components/katalog/ProductCard";
import ProductDetailModal from "@/components/katalog/ProductDetailModal";
import ProductFormModal from "@/components/katalog/ProductFormModal";
import DeletedProductsPanel from "@/components/katalog/DeletedProductsPanel";
import { useApi } from "@/hooks/useApi";
import { apiDelete, buildQuery } from "@/lib/client";
import { formatNumber } from "@/lib/format";
import { productKindLabel } from "@/lib/labels";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "@/lib/ui";
import type { Product, ProductCategory } from "@/types/api";
import { useState } from "react";

const LIMIT = 12;
const PRODUCT_KINDS = [
  "coffee",
  "drink",
  "food",
  "snack",
  "dessert",
  "bundle",
  "buffet",
  "event",
  "standard",
  "other",
];
const SORTS: { value: string; label: string }[] = [
  { value: "featured", label: "Unggulan" },
  { value: "newest", label: "Terbaru" },
  { value: "name", label: "Nama (A–Z)" },
  { value: "price_asc", label: "Harga termurah" },
  { value: "price_desc", label: "Harga tertinggi" },
  { value: "popular", label: "Terpopuler" },
];

export default function KatalogPage() {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Product | null>(null);
  const [form, setForm] = useState<{ open: boolean; product: Product | null }>({
    open: false,
    product: null,
  });
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);
  const [draft, setDraft] = useState({
    q: "",
    categoryId: "",
    productKind: "",
    isActive: "",
    isFeatured: "",
    sort: "featured",
  });
  const [applied, setApplied] = useState(draft);

  const categories = useApi<ProductCategory[]>("/categories");
  const products = useApi<Product[]>(
    `/admin/products${buildQuery({
      page,
      limit: LIMIT,
      q: applied.q,
      categoryId: applied.categoryId,
      productKind: applied.productKind,
      isActive: applied.isActive,
      isFeatured: applied.isFeatured,
      sort: applied.sort,
    })}`,
  );

  const meta = products.meta;
  const categoriesReady = Boolean(categories.data);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await apiDelete(`/admin/products/${deleteTarget.id}`);
    setDeleteTarget(null);
    products.reload();
  };

  return (
    <div className="space-y-6">
      <PageBreadcrumb pageTitle="Katalog" items={[{ label: "Katalog" }]} />

      <form
        onSubmit={(event) => {
          event.preventDefault();
          setApplied(draft);
          setPage(1);
        }}
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-coffee-linen bg-white p-4 dark:border-coffee-night-border dark:bg-coffee-night-soft"
      >
        <label className="flex min-w-[200px] flex-1 flex-col gap-1">
          <span className="text-theme-xs font-medium text-coffee-muted">Cari produk</span>
          <input
            value={draft.q}
            onChange={(event) => setDraft((prev) => ({ ...prev, q: event.target.value }))}
            placeholder="Nama produk"
            className={inputClass}
          />
        </label>
        <label className="flex min-w-[160px] flex-col gap-1">
          <span className="text-theme-xs font-medium text-coffee-muted">Kategori</span>
          <select
            value={draft.categoryId}
            onChange={(event) => setDraft((prev) => ({ ...prev, categoryId: event.target.value }))}
            className={inputClass}
          >
            <option value="">Semua</option>
            {(categories.data ?? []).map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[150px] flex-col gap-1">
          <span className="text-theme-xs font-medium text-coffee-muted">Jenis</span>
          <select
            value={draft.productKind}
            onChange={(event) => setDraft((prev) => ({ ...prev, productKind: event.target.value }))}
            className={inputClass}
          >
            <option value="">Semua</option>
            {PRODUCT_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {productKindLabel(kind)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[140px] flex-col gap-1">
          <span className="text-theme-xs font-medium text-coffee-muted">Status</span>
          <select
            value={draft.isActive}
            onChange={(event) => setDraft((prev) => ({ ...prev, isActive: event.target.value }))}
            className={inputClass}
          >
            <option value="">Semua</option>
            <option value="true">Aktif</option>
            <option value="false">Nonaktif</option>
          </select>
        </label>
        <label className="flex min-w-[160px] flex-col gap-1">
          <span className="text-theme-xs font-medium text-coffee-muted">Urutkan</span>
          <select
            value={draft.sort}
            onChange={(event) => setDraft((prev) => ({ ...prev, sort: event.target.value }))}
            className={inputClass}
          >
            {SORTS.map((sort) => (
              <option key={sort.value} value={sort.value}>
                {sort.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={primaryButtonClass}>
          Terapkan
        </button>
        <button
          type="button"
          onClick={() => {
            const reset = {
              q: "",
              categoryId: "",
              productKind: "",
              isActive: "",
              isFeatured: "",
              sort: "featured",
            };
            setDraft(reset);
            setApplied(reset);
            setPage(1);
          }}
          className={secondaryButtonClass}
        >
          Reset
        </button>
      </form>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Tile label="Total Produk" value={formatNumber(meta?.total)} />
        <Tile
          label="Kategori"
          value={formatNumber(categories.data?.length ?? categories.meta?.total)}
        />
        <Tile label="Ditampilkan" value={formatNumber(products.data?.length)} />
      </div>

      <ComponentCard
        title="Menu & Produk"
        desc="Klik kartu untuk melihat varian & modifier"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setTrashOpen((value) => !value)}
              className={secondaryButtonClass}
            >
              {trashOpen ? "Sembunyikan Riwayat Hapus" : "Riwayat Hapus"}
            </button>
            <button
              type="button"
              onClick={() => setForm({ open: true, product: null })}
              disabled={!categoriesReady}
              className={primaryButtonClass}
            >
              + Tambah Produk
            </button>
          </div>
        }
      >
        {products.loading && !products.data ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-[300px] w-full" />
            ))}
          </div>
        ) : products.error ? (
          <ErrorBlock message={products.error} onRetry={products.reload} />
        ) : (products.data?.length ?? 0) === 0 ? (
          <EmptyBlock message="Tidak ada produk yang cocok" />
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {products.data!.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onSelect={setSelected}
                  onEdit={(item) => setForm({ open: true, product: item })}
                  onDelete={setDeleteTarget}
                />
              ))}
            </div>
            <Pagination
              page={meta?.page ?? page}
              totalPages={meta?.totalPages ?? 1}
              total={meta?.total}
              unit="produk"
              onPageChange={setPage}
            />
          </div>
        )}
      </ComponentCard>

      {trashOpen && (
        <DeletedProductsPanel
          onClose={() => setTrashOpen(false)}
          onChanged={() => {
            products.reload();
            categories.reload();
          }}
        />
      )}

      {form.open && categoriesReady && (
        <ProductFormModal
          key={form.product?.id ?? "new"}
          product={form.product}
          categories={categories.data!}
          onClose={() => setForm({ open: false, product: null })}
          onSaved={() => {
            setForm({ open: false, product: null });
            products.reload();
            categories.reload();
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          isOpen
          key={deleteTarget.id}
          title="Hapus Produk"
          message={`Hapus produk "${deleteTarget.name}"? Produk disembunyikan dari katalog dan masuk Riwayat Hapus. Masih bisa dipulihkan dalam 30 hari sebelum terhapus permanen.`}
          confirmLabel="Hapus"
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      <ProductDetailModal product={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-coffee-linen bg-white p-5 dark:border-coffee-night-border dark:bg-coffee-night-soft">
      <p className="text-theme-sm text-coffee-muted">{label}</p>
      <p className="mt-2 text-xl font-bold text-coffee-espresso dark:text-coffee-cream">{value}</p>
    </div>
  );
}
