"use client";

/**
 * Menu — GET /categories + GET /products (search, filter kategori, sortir).
 * Mendukung deep-link dari beranda: ?categorySlug= & ?placement= & ?search=
 */
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { FilterSheet } from "@/components/filter-sheet";
import { ProductCard, type CardProduct } from "@/components/product-card";
import { ErrorState } from "@/components/ui/error-state";
import { Loader } from "@/components/ui/loader";
import { SectionHeader } from "@/components/ui/section-header";
import { TopBar } from "@/components/ui/top-bar";
import { apiErrorFrom } from "@/services/client";
import { listCategories, listProducts, type ProductSort } from "@/services/catalog.service";
import { listPlacementProducts } from "@/services/home.service";
import { cartCount, useCartStore } from "@/store/cart-store";

import type { Placement, ProductCategory } from "@/types/api";

const SORTS: { value: ProductSort; label: string }[] = [
  { value: "featured", label: "Rekomendasi" },
  { value: "popular", label: "Populer" },
  { value: "price_asc", label: "Termurah" },
  { value: "price_desc", label: "Termahal" },
  { value: "newest", label: "Terbaru" },
  { value: "name", label: "A–Z" },
];

const PLACEMENTS: Placement[] = [
  "favorite",
  "new",
  "family_bundle",
  "meeting_bundle",
  "birthday_bundle",
  "buffet_bundle",
  "event",
];

const PLACEMENT_LABEL: Record<Placement, string> = {
  favorite: "Menu favorit",
  new: "Menu baru",
  family_bundle: "Paket keluarga",
  meeting_bundle: "Paket meeting",
  birthday_bundle: "Paket ulang tahun",
  buffet_bundle: "Paket buffet",
  event: "Menu event",
};

function toPlacement(value?: string | null): Placement | null {
  return value && (PLACEMENTS as string[]).includes(value) ? (value as Placement) : null;
}

export default function MenuScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const categoryParam = searchParams.get("categorySlug");
  const placementParam = searchParams.get("placement");
  const searchParam = searchParams.get("search");

  const items = useCartStore((state) => state.items);
  const count = cartCount(items);

  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [products, setProducts] = useState<CardProduct[]>([]);
  const [activeSlug, setActiveSlug] = useState<string | null>(categoryParam);
  const [activePlacement, setActivePlacement] = useState<Placement | null>(toPlacement(placementParam));
  const [sort, setSort] = useState<ProductSort>("featured");
  const [search, setSearch] = useState(searchParam ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState(searchParam ?? "");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);

  const pageRef = useRef(1);
  const hasMoreRef = useRef(true);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Debounce pencarian 400ms.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    listCategories()
      .then((result) => setCategories(result.items))
      .catch(() => setCategories([]));
  }, []);

  // Sinkronkan deep-link (mis. dari chip beranda) ke state.
  useEffect(() => {
    if (categoryParam === null) return;
    setActivePlacement(null);
    setActiveSlug(categoryParam);
  }, [categoryParam]);

  useEffect(() => {
    if (placementParam === null) return;
    setActivePlacement(toPlacement(placementParam));
  }, [placementParam]);

  useEffect(() => {
    if (searchParam === null) return;
    setSearch(searchParam);
  }, [searchParam]);

  const fetchPage = useCallback(
    async (page: number, replace: boolean) => {
      try {
        setError(null);
        if (activePlacement) {
          const placementItems = await listPlacementProducts(activePlacement, page);
          hasMoreRef.current = placementItems.length >= 20;
          setProducts((prev) => (replace ? placementItems : [...prev, ...placementItems]));
          return;
        }
        const result = await listProducts({
          page,
          search: debouncedSearch || undefined,
          categorySlug: activeSlug ?? undefined,
          sort,
        });
        hasMoreRef.current = Boolean(result.meta?.hasNext);
        setProducts((prev) => (replace ? result.items : [...prev, ...result.items]));
      } catch (err) {
        setError(apiErrorFrom(err, "Gagal memuat menu"));
      }
    },
    [activeSlug, activePlacement, debouncedSearch, sort, setProducts],
  );

  // Muat ulang tiap filter berubah.
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

  // Infinite scroll saat sentinel terlihat.
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

  const categoryOptions = useMemo(
    () => [
      { label: "Semua", value: null },
      ...categories.map((category) => ({ label: category.name, value: category.slug })),
    ],
    [categories],
  );
  const sortOptions = useMemo(() => SORTS.map((item) => ({ label: item.label, value: item.value })), []);

  const selectCategory = (value: string | null) => {
    setActivePlacement(null);
    setActiveSlug(value);
    setFilterOpen(false);
  };

  const resetFilters = () => {
    setActiveSlug(null);
    setActivePlacement(null);
    setSort("featured");
    setSearch("");
    setFilterOpen(false);
    router.replace("/menu");
  };

  const filterActive = !activePlacement && (activeSlug !== null || sort !== "featured");

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-30 bg-surface md:top-16">
        <div className="mx-auto max-w-6xl">
          <TopBar
            searchValue={search}
            onChangeSearch={setSearch}
            onPressFilter={() => setFilterOpen(true)}
            filterActive={filterActive}
            cartCount={count}
            onPressCart={() => router.push("/cart")}
            placeholder="Cari es kopi susu…"
          />
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 pb-10 pt-3.5 md:px-6">
        {activePlacement ? (
          <SectionHeader
            title={PLACEMENT_LABEL[activePlacement]}
            subtitle="Produk pilihan Semoet Cafe"
            actionLabel="Semua menu"
            onAction={resetFilters}
          />
        ) : categories.length > 0 ? (
          <div className="no-scrollbar -mx-4 mb-3.5 flex gap-2 overflow-x-auto px-4 md:-mx-6 md:px-6">
            {[{ id: "all", slug: null as string | null, name: "Semua" }, ...categories].map((category) => {
              const slug = "slug" in category ? (category.slug as string | null) : null;
              const active = slug === activeSlug;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => selectCategory(slug)}
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
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
            <div ref={sentinelRef} className="h-8" />
            {loadingMore ? <Loader label="Memuat lagi…" fullscreen={false} /> : null}
          </>
        )}
      </div>

      <FilterSheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Filter menu"
        categories={categoryOptions}
        activeCategory={activeSlug}
        onSelectCategory={selectCategory}
        sorts={sortOptions}
        activeSort={sort}
        onSelectSort={(value) => {
          setSort(value as ProductSort);
          setFilterOpen(false);
        }}
        onReset={resetFilters}
      />
    </div>
  );
}
