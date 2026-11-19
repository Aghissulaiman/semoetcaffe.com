"use client";

/**
 * Beranda — versi ringkas: banner, satu baris sapaan, kategori, lalu semua
 * produk aktif. Tanpa blok-blok besar supaya fokusnya ke menu.
 */
import { CalendarDays, MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { BannerCarousel } from "@/components/banner-carousel";
import { FilterSheet } from "@/components/filter-sheet";
import { ProductCard } from "@/components/product-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Loader } from "@/components/ui/loader";
import { TopBar } from "@/components/ui/top-bar";
import { apiErrorFrom } from "@/services/client";
import { listProducts } from "@/services/catalog.service";
import { getHome } from "@/services/home.service";
import { cartCount, useCartStore } from "@/store/cart-store";

import type { HomePayload, Product, ProductCategory } from "@/types/api";

export default function HomePage() {
  const router = useRouter();
  const items = useCartStore((state) => state.items);
  const count = cartCount(items);

  const [data, setData] = useState<HomePayload | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const payload = await getHome();
      setData(payload);
    } catch (err) {
      setError(apiErrorFrom(err, "Gagal memuat beranda"));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadProducts = useCallback(async () => {
    try {
      const page = await listProducts({ limit: 60, sort: "featured" });
      setProducts(page.items);
    } catch {
      setProducts([]);
    } finally {
      setProductsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadProducts();
  }, [load, loadProducts]);

  const categories = useMemo(() => data?.categories ?? [], [data]);
  const categoryOptions = useMemo(
    () => [
      { label: "Semua menu", value: null },
      ...categories.map((category) => ({ label: category.name, value: category.slug })),
    ],
    [categories],
  );

  const openCategory = (category: ProductCategory) =>
    router.push(`/menu?categorySlug=${encodeURIComponent(category.slug)}`);

  const openMenu = (query?: string) => router.push(query ? `/menu?${query}` : "/menu");

  if (loading) return <Loader label="Menyiapkan menu…" />;

  if (error && !data) {
    return (
      <div className="flex flex-col">
        <div className="sticky top-0 z-30 bg-surface md:top-16">
          <div className="mx-auto w-full max-w-6xl">
            <TopBar
              onPressFilter={() => setFilterOpen(true)}
              onPressSearch={() => openMenu()}
              cartCount={count}
              onPressCart={() => router.push("/cart")}
              placeholder="Cari es kopi susu…"
            />
          </div>
        </div>
        <ErrorState message={error} onRetry={() => { setLoading(true); void load(); }} />
        <FilterSheet
          visible={filterOpen}
          onClose={() => setFilterOpen(false)}
          title="Filter kategori"
          categories={categoryOptions}
          onSelectCategory={(value) => {
            setFilterOpen(false);
            openMenu(value ? `categorySlug=${encodeURIComponent(value)}` : undefined);
          }}
          onReset={() => {
            setFilterOpen(false);
            openMenu();
          }}
        />
      </div>
    );
  }

  const banners = data?.banners ?? [];
  const nearestBranch = data?.nearestBranch ?? null;

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-30 bg-surface md:top-16">
        <div className="mx-auto w-full max-w-6xl">
          <TopBar
            onPressFilter={() => setFilterOpen(true)}
            onPressSearch={() => openMenu()}
            cartCount={count}
            onPressCart={() => router.push("/cart")}
            placeholder="Cari es kopi susu…"
          />
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl pb-10">
        <div className="pt-3">
          <BannerCarousel
            banners={banners}
            onPressBanner={(banner) => {
              if (banner.targetUrl?.startsWith("http")) {
                window.open(banner.targetUrl, "_blank", "noopener,noreferrer");
              }
            }}
          />
        </div>

        <section className="px-4 pt-4 md:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-black leading-tight text-ink md:text-2xl">
                Mau ngopi apa hari ini?
              </h1>
              <p className="mt-0.5 text-xs text-muted">Pesan langsung dari web, tanpa antre.</p>
            </div>
            <button
              type="button"
              onClick={() => router.push("/reservasi")}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-2 text-xs font-bold text-primary transition hover:border-primary/40 hover:bg-primary-soft focus-ring">
              <CalendarDays size={14} />
              Reservasi
            </button>
          </div>
        </section>

        <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto px-4 md:px-6">
          <button
            type="button"
            onClick={() => openMenu()}
            className="shrink-0 rounded-full bg-primary px-3.5 py-2 text-[13px] font-bold text-white transition hover:bg-primary-dark focus-ring">
            Semua
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => openCategory(category)}
              className="shrink-0 rounded-full border border-line bg-surface px-3.5 py-2 text-[13px] font-semibold text-ink transition hover:border-primary/40 hover:bg-primary-soft focus-ring">
              {category.name}
            </button>
          ))}
        </div>

        <section className="mt-5 px-4 md:px-6">
          <div className="mb-3 flex items-end justify-between gap-3">
            <h2 className="text-[17px] font-extrabold text-ink">Menu Semoet</h2>
            <span className="text-xs text-muted">
              {productsLoading ? "Memuat…" : `${products.length} produk`}
            </span>
          </div>

          {productsLoading ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="h-52 animate-pulse rounded-[18px] border border-line bg-primary-soft"
                />
              ))}
            </div>
          ) : products.length === 0 ? (
            <EmptyState
              title="Belum ada menu aktif"
              description="Menu sedang disiapkan. Coba buka halaman menu lagi nanti."
              actionLabel="Buka menu"
              onAction={() => openMenu()}
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </section>

        {nearestBranch ? (
          <div className="mt-6 flex items-center gap-2 px-4 text-xs text-muted md:px-6">
            <MapPin size={14} className="shrink-0 text-primary" />
            <span className="truncate">
              {nearestBranch.name ?? "Semoet Cafe"}
              {nearestBranch.address ? ` · ${nearestBranch.address}` : ""}
            </span>
          </div>
        ) : null}
      </div>

      <FilterSheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Filter kategori"
        categories={categoryOptions}
        onSelectCategory={(value) => {
          setFilterOpen(false);
          openMenu(value ? `categorySlug=${encodeURIComponent(value)}` : undefined);
        }}
        onReset={() => {
          setFilterOpen(false);
          openMenu();
        }}
      />
    </div>
  );
}
