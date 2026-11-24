"use client";

import SemoetLogo from "@/components/common/SemoetLogo";
import { useSidebar } from "@/context/SidebarContext";
import { useSession } from "@/hooks/useSession";
import { filterMenuGroups, type MenuGroup } from "@/lib/access";
import { useOrderNotification } from "@/components/common/NotificationSound";
import {
  BoxCubeIcon,
  BoxIconLine,
  CalenderIcon,
  ChatIcon,
  ChevronDownIcon,
  CoffeeIcon,
  DocsIcon,
  DollarLineIcon,
  EyeIcon,
  GridIcon,
  GroupIcon,
  ListIcon,
  LockIcon,
  PaperPlaneIcon,
  PieChartIcon,
  TaskIcon,
} from "@/icons";
import { cn } from "@/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";

type NavChild = {
  label: string;
  href: string;
  /** Cocokkan juga untuk sub-route (mis. /reservasi/ruangan). */
  matchPrefix?: boolean;
};

type NavItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
  /** Cocokkan juga untuk sub-route (mis. /penjualan/detail). */
  matchPrefix?: boolean;
  /** Sub-menu yang bisa dibuka/tutup di sidebar. */
  children?: NavChild[];
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

/** Ikon per tautan menu (dipetakan dari metadata izin di `lib/access`). */
const NAV_ICONS: Record<string, React.ReactNode> = {
  "/": <GridIcon />,
  "/penjualan": <DollarLineIcon />,
  "/laporan": <PieChartIcon />,
  "/produk": <BoxCubeIcon />,
  "/reservasi": <CalenderIcon />,
  "/event-booking": <PaperPlaneIcon />,
  "/katalog": <ListIcon />,
  "/chat": <ChatIcon />,
  "/moment": <EyeIcon />,
  "/pembelian": <TaskIcon />,
  "/inventori": <CoffeeIcon />,
  "/supplier": <BoxIconLine />,
  "/pengeluaran": <DollarLineIcon />,
  "/pengguna": <GroupIcon />,
  "/peran": <LockIcon />,
  "/event": <CalenderIcon />,
  "/audit-log": <DocsIcon />,
};

/** Ubah metadata menu (label, href, izin) menjadi item sidebar bergaya. */
function toNavGroups(groups: MenuGroup[]): NavGroup[] {
  return groups.map((group) => ({
    label: group.label,
    items: group.items.map((item) => ({
      label: item.label,
      href: item.href,
      icon: NAV_ICONS[item.href] ?? <GridIcon />,
      matchPrefix: item.href !== "/",
      children: item.children?.map((child) => ({
        label: child.label,
        href: child.href,
      })),
    })),
  }));
}

const AppSidebar: React.FC = () => {
  const { isExpanded, isHovered, isMobileOpen, setIsHovered, toggleMobileSidebar } =
    useSidebar();
  const pathname = usePathname();
  const { me } = useSession();
  const { play: playNotificationSound } = useOrderNotification();

  // Mainkan notifikasi saat komponen sidebar dimount (sekali saja)
  useEffect(() => {
    playNotificationSound();
  }, [playNotificationSound]);

  const showFull = isExpanded || isHovered || isMobileOpen;

  // Menu difilter sesuai izin peran. Selama sesi dimuat, menu belum ditampilkan
  // agar tautan tanpa izin tidak sempat berkedip.
  const navGroups = useMemo(
    () => (me ? toNavGroups(filterMenuGroups(me.permissions)) : []),
    [me],
  );

  /** Menu induk yang dibuka/ditutup manual; default mengikuti sub-menu aktif. */
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});

  const pathMatches = (href: string, matchPrefix?: boolean) => {
    if (href === "/") return pathname === "/";
    return matchPrefix
      ? pathname === href || pathname.startsWith(`${href}/`)
      : pathname === href;
  };

  const isActive = (item: NavItem) => {
    if (item.children?.length && showFull) {
      const parentActive = pathMatches(item.href, item.matchPrefix);
      const anyChildActive = item.children.some((child) =>
        pathMatches(child.href, child.matchPrefix),
      );
      // Tetap anggap parent aktif kalau sedang berada di salah satu submenu.
      return parentActive || anyChildActive;
    }
    return pathMatches(item.href, item.matchPrefix);
  };

  const closeMobile = () => {
    if (isMobileOpen) toggleMobileSidebar();
  };

  return (
    <aside
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "fixed start-0 top-0 z-50 flex h-screen flex-col border-e border-coffee-linen bg-white px-4 transition-all duration-300 ease-in-out dark:border-coffee-night-border dark:bg-coffee-night-soft",
        showFull ? "w-[290px]" : "w-[90px]",
        isMobileOpen ? "translate-x-0" : "-translate-x-full",
        "xl:translate-x-0",
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          "flex h-16 shrink-0 items-center",
          showFull ? "justify-start px-2" : "justify-center",
        )}
      >
        <Link href="/" aria-label="Semoet Admin">
          <SemoetLogo compact={!showFull} />
        </Link>
      </div>

      {/* Navigasi */}
      <nav className="custom-scrollbar mt-2 flex-1 overflow-y-auto pb-6">
        {!me && showFull && (
          <p className="px-3 py-2 text-theme-xs text-coffee-muted">Memuat menu…</p>
        )}
        {navGroups.map((group) => (
          <div key={group.label} className="mb-5">
            <p
              className={cn(
                "mb-2 px-3 text-theme-xs font-semibold uppercase tracking-wider text-coffee-muted/70",
                !showFull && "sr-only",
              )}
            >
              {group.label}
            </p>
            <ul className="flex flex-col gap-1">
              {group.items.map((item) => {
                const active = isActive(item);
                const children = item.children ?? [];
                const parentActive = pathMatches(item.href, item.matchPrefix);
                const otherChildActive = children.some(
                  (child) => child.href !== item.href && pathMatches(child.href, child.matchPrefix),
                );
                const expanded = Boolean(children.length) && (openMenus[item.href] ?? parentActive);

                const baseClass = cn(
                  "group flex w-full items-center rounded-lg text-sm font-medium transition-colors",
                  showFull ? "gap-3 px-3 py-2.5" : "justify-center px-2 py-2.5",
                  active
                    ? "bg-coffee-brown text-coffee-milk shadow-theme-xs dark:bg-coffee-caramel dark:text-coffee-night"
                    : otherChildActive
                      ? "text-coffee-brown dark:text-coffee-caramel"
                      : "text-coffee-dark hover:bg-coffee-milk hover:text-coffee-espresso dark:text-coffee-cream/70 dark:hover:bg-white/5 dark:hover:text-coffee-cream",
                );

                const iconClass = cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center [&>svg]:h-5 [&>svg]:w-5",
                  !active &&
                    !otherChildActive &&
                    "text-coffee-muted group-hover:text-coffee-brown dark:group-hover:text-coffee-caramel",
                );

                // Sidebar ringkas / tanpa sub-menu: tampil sebagai tautan biasa.
                if (showFull && children.length > 0) {
                  return (
                    <li key={item.href}>
                      <button
                        type="button"
                        aria-expanded={expanded}
                        onClick={() =>
                          setOpenMenus((prev) => ({
                            ...prev,
                            [item.href]: !expanded,
                          }))
                        }
                        className={baseClass}
                      >
                        <span className={iconClass}>{item.icon}</span>
                        <span className="flex-1 truncate text-start">{item.label}</span>
                        <ChevronDownIcon
                          className={cn(
                            "h-4 w-4 shrink-0 text-coffee-muted transition-transform duration-200",
                            expanded && "rotate-180",
                          )}
                        />
                      </button>
                      {expanded && (
                        <ul className="ms-3.5 mt-1 flex flex-col gap-1 border-s border-coffee-linen ps-3 dark:border-coffee-night-border">
                          {children.map((child) => {
                            const activeChild = pathMatches(child.href, child.matchPrefix);
                            return (
                              <li key={child.href}>
                                <Link
                                  href={child.href}
                                  onClick={closeMobile}
                                  className={cn(
                                    "flex items-center gap-2 rounded-lg px-3 py-2 text-theme-sm transition-colors",
                                    activeChild
                                      ? "bg-coffee-brown/10 font-semibold text-coffee-brown dark:bg-coffee-caramel/15 dark:text-coffee-caramel"
                                      : "text-coffee-muted hover:bg-coffee-milk hover:text-coffee-espresso dark:hover:bg-white/5 dark:hover:text-coffee-cream",
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "h-1.5 w-1.5 shrink-0 rounded-full",
                                      activeChild
                                        ? "bg-coffee-brown dark:bg-coffee-caramel"
                                        : "bg-coffee-muted/40",
                                    )}
                                  />
                                  <span className="truncate">{child.label}</span>
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                }

                return (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      title={!showFull ? item.label : undefined}
                      onClick={closeMobile}
                      className={baseClass}
                    >
                      <span className={iconClass}>{item.icon}</span>
                      {showFull && <span className="truncate">{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div
        className={cn(
          "shrink-0 border-t border-coffee-linen py-4 dark:border-coffee-night-border",
          showFull ? "px-2" : "px-0",
        )}
      >
        <div
          className={cn(
            "flex items-center gap-2 text-coffee-muted",
            !showFull && "justify-center",
          )}
        >
          <CoffeeIcon />
          {showFull && (
            <span className="text-theme-xs">
              Semoet Admin
              <span className="block text-coffee-muted/70">Manajemen Penjualan</span>
            </span>
          )}
        </div>
      </div>
    </aside>
  );
};

export default AppSidebar;