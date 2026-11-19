"use client";

/**
 * Layar pilih menu kafe untuk reservasi — mengikuti tampilan Menu:
 * pencarian, chip kategori, dan grid kartu bergambar.
 *
 * Ketuk kartu → detail produk (mode reservasi) untuk memilih varian &
 * modifier, lalu kembali ke sini. Pilihan tersimpan di
 * `useReservationDraftStore` dan dikirim bersama reservasi.
 */
import { Check, Utensils } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { FilterSheet } from "@/components/filter-sheet";
import { ProductCard } from "@/components/product-card";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Loader } from "@/components/ui/loader";
import { ScreenHeader } from "@/components/ui/screen-header";
import { TopBar } from "@/components/ui/top-bar";
import { formatRupiah } from "@/lib/format";
import { apiErrorFrom } from "@/services/client";
import { listCategories, listProducts, type ProductSort } from "@/services/catalog.service";
import {
  menuPickLabel,
  menuPicksTotal,
  useReservationDraftStore,
} from "@/store/reservation-draft-store";

import type { Product, ProductCategory } from "@/types/api";

/** Layar ini selalu memakai sortir A–Z agar mudah dicari. */
const SORT: ProductSort = "name";

export default function MenuPickerPage() {
  const router = useRouter();

  const menuPicks = useReservationDraftStore((state) => state.menuPicks);
  const setMenuPicks = useReservationDraftStore((state) => state.setMenuPicks);

  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);

  const pageRef = useRef(1);
  const hasMoreRef = useRef(true);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Debounce pencarian 400ms (sama seperti layar Menu).
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    listCategories()
      .then((result) => setCategories(result.items))
      .catch(() => setCategories([]));
  }, []);

  const fetchPage = useCallback(
    async (page: number, replace: boolean) => {
      try {
        setError(null);
        const result = await listProducts({
          page,
          search: debouncedSearch || undefined,
          categorySlug: activeCategory ?? undefined,
          sort: SORT,
        });
        hasMoreRef.current = Boolean(result.meta?.hasNext);
        setProducts((prev) => (replace ? result.items : [...prev, ...result.items]));
      } catch (err) {
        setError(apiErrorFrom(err, "Gagal memuat menu"));
      }
    },
    [activeCategory, debouncedSearch],
  );

  useEffect(() => {
    pageRef.current = 1;
    setLoading(true);
    fetchPage(1, true).finally(() => setLoading(false));
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMoreRef.current) return;
    setLoadingMore(true);
    pageRef.current += 1;
    fetchPage(pageRef.current, false).finally(() => setLoadingMore(false));
  }, [fetchPage, loadingMore]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "240px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore]);

  const openProduct = (product: Product) => {
    router.push(`/product/${encodeURIComponent(product.slug)}?mode=reservation`);
  };

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.replace("/reservasi/baru");
  };

  const pickedCount = menuPicks.reduce((sum, pick) => sum + pick.quantity, 0);
  const pickedTotal = menuPicksTotal(menuPicks);

  const categoryOptions = useMemo(
    () => [
      { label: "Semua", value: null },
      ...categories.map((category) => ({ label: category.name, value: category.slug })),
    ],
    [categories],
  );

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      <ScreenHeader
        title="Pilih Menu"
        subtitle="Ketuk menu untuk atur varian & jumlah"
        onBack={goBack}
      />

      <div className="sticky top-0 z-20 bg-surface md:top-16">
        <div className="mx-auto max-w-6xl">
          <TopBar
            searchValue={search}
            onChangeSearch={setSearch}
            onPressFilter={() => setFilterOpen(true)}
            filterActive={activeCategory !== null}
            cartCount={0}
            onPressCart={() => undefined}
            placeholder="Cari menu…"
          />
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl flex-1 px-4 pb-40 pt-3.5 md:px-6">
        {/* Ringkasan pilihan */}
        {menuPicks.length > 0 ? (
          <div className="mb-3.5 flex flex-col gap-1.5 rounded-[14px] border border-primary bg-primary-soft p-3">
            <div className="flex items-center gap-1.5">
              <Utensils size={15} className="text-primary" />
              <p className="text-[13px] font-extrabold text-primary">{pickedCount} item dipilih</p>
            </div>
            {menuPicks.map((pick, index) => (
              <p key={`${pick.productId}-${index}`} className="truncate text-xs text-ink">
                {menuPickLabel(pick)}
              </p>
            ))}
          </div>
        ) : null}

        {/* Chip kategori */}
        {categories.length > 0 ? (
          <div className="no-scrollbar -mx-4 mb-3.5 flex gap-2 overflow-x-auto px-4 md:-mx-6 md:px-6">
            {[{ id: "all", slug: null as string | null, name: "Semua" }, ...categories].map((category) => {
              const slug = "slug" in category ? (category.slug as string | null) : null;
              const active = slug === activeCategory;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setActiveCategory(slug)}
                  aria-pressed={active}
                  className={
                    active
                      ? "shrink-0 rounded-full bg-primary px-3.5 py-2.5 text-[13px] font-bold text-white focus-ring"
                      : "shrink-0 rounded-full bg-primary-soft px-3.5 py-2.5 text-[13px] font-bold text-primary transition hover:bg-cream focus-ring"
                  }>
                  {category.name}
                </button>
              );
            })}
          </div>
        ) : null}

        {loading ? (
          <Loader label="Memuat menu…" />
        ) : error && products.length === 0 ? (
          <ErrorState
            message={error}
            onRetry={() => {
              pageRef.current = 1;
              setLoading(true);
              fetchPage(1, true).finally(() => setLoading(false));
            }}
          />
        ) : products.length === 0 ? (
          <ErrorState message="Menu tidak ditemukan. Coba kata kunci atau kategori lain." />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  showPromo={false}
                  onPressOverride={() => openProduct(product)}
                />
              ))}
            </div>
            <div ref={sentinelRef} className="h-8" />
            {loadingMore ? <Loader label="Memuat lagi…" fullscreen={false} /> : null}
          </>
        )}
      </div>

      {/* Footer: total + selesai */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface px-4 py-3">
        <div className="mx-auto flex max-w-6xl flex-col gap-2">
          {pickedCount > 0 ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] text-muted">{pickedCount} item dipilih</span>
              <span className="text-base font-black text-ink">{formatRupiah(pickedTotal)}</span>
            </div>
          ) : null}
          <div className="flex items-center gap-2.5">
            {menuPicks.length > 0 ? (
              <button
                type="button"
                onClick={() => setMenuPicks([])}
                className="flex h-[46px] shrink-0 items-center justify-center rounded-full border border-line px-5 text-[13px] font-bold text-danger transition hover:bg-[#f7e4e0] focus-ring">
                Kosongkan
              </button>
            ) : null}
            <div className="min-w-0 flex-1">
              <Button
                title={pickedCount > 0 ? `Selesai (${pickedCount} item)` : "Selesai"}
                icon={pickedCount > 0 ? Check : undefined}
                onClick={goBack}
              />
            </div>
          </div>
        </div>
      </div>

      <FilterSheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Filter menu"
        categories={categoryOptions}
        activeCategory={activeCategory}
        onSelectCategory={(value) => {
          setActiveCategory(value);
          setFilterOpen(false);
        }}
        onReset={() => {
          setActiveCategory(null);
          setSearch("");
          setFilterOpen(false);
        }}
      />
    </div>
  );
}
