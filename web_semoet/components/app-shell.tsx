"use client";

import {
  CalendarDays,
  Coffee,
  HelpCircle,
  Home,
  ReceiptText,
  ShoppingCart,
  User,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { StoreClosedNotice } from "@/components/store-closed-notice";
import { cn } from "@/lib/cn";
import { useCartHydrated } from "@/lib/use-cart-hydrated";
import { getStoreStatus } from "@/services/store.service";
import { cartCount, useCartStore } from "@/store/cart-store";
import { useAuthStore } from "@/store/auth-store";
import { useStoreStatusStore } from "@/store/store-status-store";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV: NavItem[] = [
  { href: "/", label: "Beranda", icon: Home },
  { href: "/menu", label: "Menu", icon: UtensilsCrossed },
  { href: "/orders", label: "Pesanan", icon: ReceiptText },
  { href: "/reservasi", label: "Reservasi", icon: CalendarDays },
  { href: "/profile", label: "Profil", icon: User },
];

const TAB_ROUTES = ["/", "/menu", "/orders", "/reservasi", "/profile"];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const items = useCartStore((state) => state.items);
  const branchId = useCartStore((state) => state.branchId);
  const cartHydrated = useCartHydrated();
  const count = cartCount(items);
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const storeStatus = useStoreStatusStore((state) => state.status);
  const setStoreStatus = useStoreStatusStore((state) => state.setStatus);

  // Status toko mengikuti cabang yang dipilih di keranjang; bila belum ada,
  // backend memakai cabang aktif pertama.
  useEffect(() => {
    if (!cartHydrated) return;

    // Jangan tampilkan status cabang lama saat pelanggan baru mengganti cabang.
    const current = useStoreStatusStore.getState().status;
    if (current && current.branchId !== branchId) {
      setStoreStatus(null);
    }

    let cancelled = false;

    async function loadStoreStatus() {
      try {
        const next = await getStoreStatus(branchId ?? undefined);
        if (!cancelled) setStoreStatus(next);
      } catch {
        // Notifikasi toko bukan jalur kritis; konten tetap boleh tampil.
      }
    }

    void loadStoreStatus();
    const timer = setInterval(() => void loadStoreStatus(), 30_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [branchId, cartHydrated, setStoreStatus]);

  // Halaman autentikasi tampil penuh tanpa navbar.
  if (pathname.startsWith("/auth")) {
    return <>{children}</>;
  }

  const showTabs = TAB_ROUTES.includes(pathname);

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <StoreClosedNotice status={storeStatus} />
      <header className="sticky top-0 z-40 hidden border-b border-line bg-surface/95 backdrop-blur md:block">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-6 px-6 py-3">
          <Link href="/" className="flex items-center gap-2.5 focus-ring">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-white">
              <Coffee size={21} />
            </span>
            <span className="leading-tight">
              <span className="block text-[15px] font-black tracking-tight text-ink">Semoet Cafe</span>
              <span className="block text-[11px] text-muted">Ngopi enak, seusai hati</span>
            </span>
          </Link>

          <nav className="flex flex-1 items-center gap-1">
            {NAV.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-bold transition focus-ring",
                    active
                      ? "bg-primary-soft text-primary"
                      : "text-muted hover:bg-primary-soft/60 hover:text-primary",
                  )}>
                  <item.icon size={16} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <Link
            href="/faq"
            className="flex items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-bold text-muted transition hover:bg-primary-soft/60 hover:text-primary focus-ring">
            <HelpCircle size={16} />
            Bantuan
          </Link>

          <button
            type="button"
            onClick={() => router.push("/cart")}
            aria-label={`Keranjang, ${count} item`}
            className="relative flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft text-primary transition hover:bg-cream focus-ring">
            <ShoppingCart size={19} />
            {count > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-[1.5px] border-surface bg-danger px-1 text-[10px] font-extrabold text-white">
                {count > 99 ? "99+" : count}
              </span>
            ) : null}
          </button>

          {status === "authenticated" ? (
            <Link
              href="/profile"
              className="flex items-center gap-2 rounded-full border border-line px-3 py-1.5 transition hover:bg-primary-soft focus-ring">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-extrabold text-white">
                {(user?.displayName ?? "P").charAt(0).toUpperCase()}
              </span>
              <span className="max-w-[120px] truncate text-[13px] font-bold text-ink">
                {user?.displayName ?? "Profil"}
              </span>
            </Link>
          ) : (
            <Link
              href="/auth/login"
              className="rounded-full bg-primary px-4 py-2 text-[13px] font-bold text-white transition hover:bg-primary-dark focus-ring">
              Masuk
            </Link>
          )}
        </div>
      </header>

      <main className={cn("flex-1", showTabs ? "pb-24 md:pb-0" : "pb-6 md:pb-0")}>{children}</main>

      {showTabs ? (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/98 backdrop-blur md:hidden">
          <div className="mx-auto flex max-w-md items-stretch justify-between px-2 pb-[env(safe-area-inset-bottom)]">
            {NAV.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-bold transition",
                    active ? "text-primary" : "text-muted",
                  )}>
                  <span
                    className={cn(
                      "flex h-8 w-12 items-center justify-center rounded-full transition",
                      active && "bg-primary-soft",
                    )}>
                    <item.icon size={20} />
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
