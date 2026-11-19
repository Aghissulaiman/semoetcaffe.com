   "use client";

/**
 * Favorit — daftar produk yang disukai (GET /me/favorites).
 */
import { Heart, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { ProductCard } from "@/components/product-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Loader } from "@/components/ui/loader";
import { ScreenHeading } from "@/components/ui/screen-heading";
import { apiErrorFrom } from "@/services/client";
import { listFavorites, removeFavorite } from "@/services/favorite.service";
import { useAuthStore } from "@/store/auth-store";

import type { FavoriteProduct } from "@/types/api";

export default function FavoritesPage() {
  const router = useRouter();
  const status = useAuthStore((state) => state.status);
  const isAuthenticated = status === "authenticated";

  const [products, setProducts] = useState<FavoriteProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (showSpinner = true) => {
      if (!isAuthenticated) {
        setProducts([]);
        setLoading(false);
        return;
      }
      if (showSpinner) setLoading(true);
      setError(null);
      try {
        const res = await listFavorites(1, 50);
        setProducts(res.items);
      } catch (err) {
        setError(apiErrorFrom(err, "Gagal memuat favorit"));
      } finally {
        setLoading(false);
      }
    },
    [isAuthenticated],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load(false);
    setRefreshing(false);
  };

  const unfavorite = async (productId: string) => {
    // Optimis: sembunyikan dulu, kembalikan bila request gagal.
    setProducts((prev) => prev.filter((item) => item.id !== productId));
    try {
      await removeFavorite(productId);
    } catch {
      await load(false);
    }
  };

  const heading = (
    <div className="mb-4 flex items-start justify-between gap-3">
      <ScreenHeading
        title="Favorit"
        subtitle={isAuthenticated ? `${products.length} menu disimpan` : "Menu yang kamu suka"}
        onBack={() => router.back()}
      />
      {isAuthenticated ? (
        <button
          type="button"
          onClick={() => void refresh()}
          aria-label="Muat ulang"
          className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary transition hover:bg-cream focus-ring">
          <RefreshCw size={17} className={refreshing ? "animate-spin" : undefined} />
        </button>
      ) : null}
    </div>
  );

  if (status === "loading") return <Loader label="Memuat favorit…" />;

  if (!isAuthenticated) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-4">
        {heading}
        <EmptyState
          icon={Heart}
          title="Masuk untuk melihat favorit"
          description="Simpan menu favoritmu supaya gampang dipesan lagi nanti."
          actionLabel="Masuk / Daftar"
          onAction={() => router.push("/auth/login")}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-4">
      {heading}

      {loading ? (
        <Loader label="Memuat favorit…" />
      ) : error && products.length === 0 ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : products.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="Belum ada favorit"
          description="Ketuk ikon hati pada menu untuk menyimpannya di sini."
          actionLabel="Buka Menu"
          onAction={() => router.push("/menu")}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {products.map((item) => (
            <ProductCard
              key={item.id}
              product={item}
              isFavorite
              onToggleFavorite={() => void unfavorite(item.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
