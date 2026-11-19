"use client";

import { ThemeToggleButton } from "@/components/common/ThemeToggleButton";
import UserDropdown from "@/components/header/UserDropdown";
import { useSidebar } from "@/context/SidebarContext";
import { usePathname } from "next/navigation";

const TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/penjualan": "Penjualan",
  "/produk": "Produk",
  "/inventori/bahan": "Bahan Baku",
  "/inventori/snapshot": "Snapshot Stok",
  "/inventori/mutasi": "Pergerakan Stok",
  "/inventori/rekap": "Rekap Pergerakan Stok",
  "/inventori/stok-keluar": "Stok Keluar",
  "/inventori/stok-opname": "Stok Opname",
  "/inventori/lokasi": "Lokasi Stok",
  "/inventori": "Inventori",
};

function resolveTitle(pathname: string): string {
  if (TITLES[pathname]) return TITLES[pathname];
  const match = Object.keys(TITLES).find(
    (key) => key !== "/" && pathname.startsWith(`${key}/`),
  );
  return match ? TITLES[match] : "Dashboard";
}

const AppHeader: React.FC = () => {
  const { toggleSidebar, toggleMobileSidebar } = useSidebar();
  const pathname = usePathname();

  const handleToggle = () => {
    if (window.innerWidth >= 1280) {
      toggleSidebar();
    } else {
      toggleMobileSidebar();
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-coffee-linen bg-white/85 px-4 backdrop-blur-md md:px-6 dark:border-coffee-night-border dark:bg-coffee-night-soft/85">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleToggle}
          aria-label="Buka/tutup menu"
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-coffee-linen text-coffee-muted transition-colors hover:bg-coffee-milk hover:text-coffee-brown xl:hidden dark:border-coffee-night-border dark:text-coffee-cream/70 dark:hover:bg-white/5"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </button>
        <div>
          <h1 className="text-base font-semibold text-coffee-espresso md:text-lg dark:text-coffee-cream">
            {resolveTitle(pathname)}
          </h1>
          <p className="hidden text-theme-xs text-coffee-muted sm:block">
            Semoet Cafe · Panel Pemilik
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <ThemeToggleButton />
        <UserDropdown />
      </div>
    </header>
  );
};

export default AppHeader;
