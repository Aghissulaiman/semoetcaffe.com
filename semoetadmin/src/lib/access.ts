/**
 * Peta menu admin → izin minimum yang dibutuhkan.
 *
 * Satu sumber kebenaran untuk tiga hal sekaligus:
 * 1. filter menu di sidebar (`filterMenuGroups`),
 * 2. penjaga halaman (`canAccessPath`),
 * 3. pratinjau akses di form Peran (`MENU_GROUPS`).
 */

export interface MenuChild {
  label: string;
  href: string;
  /** Izin minimum; `null` berarti tidak ada syarat tambahan. */
  permission: string | null;
}

export interface MenuItem extends MenuChild {
  children?: MenuChild[];
}

export interface MenuGroup {
  label: string;
  items: MenuItem[];
}

export const MENU_GROUPS: MenuGroup[] = [
  {
    label: "Utama",
    items: [
      { label: "Dashboard", href: "/", permission: "order:read" },
      { label: "Penjualan", href: "/penjualan", permission: "order:read" },
      { label: "Laporan", href: "/laporan", permission: "order:read" },
      { label: "Produk", href: "/produk", permission: "order:read" },
    ],
  },
  {
    label: "Operasional",
    items: [
      {
        label: "Reservasi",
        href: "/reservasi",
        permission: null,
        children: [
          { label: "Daftar Reservasi", href: "/reservasi", permission: "reservation:read" },
          { label: "Ruangan", href: "/reservasi/ruangan", permission: "branch:read" },
          { label: "Ketentuan DP", href: "/reservasi/ketentuan-dp", permission: "reservation:read" },
        ],
      },
      { label: "Booking Event", href: "/event-booking", permission: "event:read" },
      {
        label: "Menu",
        href: "/katalog",
        permission: null,
        children: [
          { label: "Katalog", href: "/katalog", permission: "menu:read" },
          { label: "Kategori", href: "/kategori", permission: "menu:read" },
          { label: "Promo", href: "/promo", permission: "promo:read" },
        ],
      },
      { label: "Chat & Support", href: "/chat", permission: "chat:read" },
      { label: "Moderasi Moment", href: "/moment", permission: "moment:read" },
    ],
  },
  {
    label: "Pembelian",
    items: [
      {
        label: "Pembelian",
        href: "/pembelian",
        permission: null,
        children: [
          { label: "Purchase Order", href: "/pembelian", permission: "purchase:read" },
          { label: "Penerimaan Barang", href: "/pembelian/penerimaan", permission: "purchase:read" },
          { label: "Hutang Supplier", href: "/pembelian/hutang", permission: "purchase:read" },
        ],
      },
      {
        label: "Bahan",
        href: "/inventori",
        permission: null,
        children: [
          { label: "Bahan Baku", href: "/inventori/bahan", permission: "inventory:read" },
          { label: "Snapshot Stok", href: "/inventori/snapshot", permission: "inventory:read" },
          { label: "Pergerakan Stok", href: "/inventori/mutasi", permission: "inventory:read" },
          { label: "Rekap Stok", href: "/inventori/rekap", permission: "inventory:read" },
          { label: "Stok Keluar", href: "/inventori/stok-keluar", permission: "inventory:read" },
          { label: "Stok Opname", href: "/inventori/stok-opname", permission: "inventory:read" },
          { label: "Lokasi Stok", href: "/inventori/lokasi", permission: "inventory:read" },
        ],
      },
      { label: "Supplier", href: "/supplier", permission: "purchase:read" },
    ],
  },
  {
    label: "Keuangan",
    items: [
      { label: "Pengeluaran", href: "/pengeluaran", permission: "expense:read" },
    ],
  },
  {
    label: "Manajemen",
    items: [
      { label: "Pengguna", href: "/pengguna", permission: "user:read" },
      { label: "Peran & Izin", href: "/peran", permission: "user:read" },
      { label: "Event", href: "/event", permission: "event:read" },
    ],
  },
  {
    label: "Sistem",
    items: [{ label: "Aktivitas & Audit", href: "/audit-log", permission: "audit:read" }],
  },
];

/**
 * Cek izin dengan dukungan wildcard `resource:manage`.
 * `user:manage` dianggap mencakup `user:read`, `user:create`, dst.
 */
export function hasPermission(
  permissions: string[] | null | undefined,
  key: string | null | undefined,
): boolean {
  if (!key) return true;
  if (!permissions?.length) return false;
  if (permissions.includes(key)) return true;

  const resource = key.split(":")[0];
  return Boolean(resource) && permissions.includes(`${resource}:manage`);
}

/** Menu yang boleh tampil untuk daftar izin tertentu. */
export function filterMenuGroups(permissions: string[] | null | undefined): MenuGroup[] {
  return MENU_GROUPS.map((group) => {
    const items = group.items
      .map((item) => {
        if (!item.children?.length) return item;
        return {
          ...item,
          children: item.children.filter((child) =>
            hasPermission(permissions, child.permission),
          ),
        };
      })
      .filter((item) => {
        // Induk dengan submenu hanya tampil bila masih ada submenu yang lolos.
        if (item.children) return item.children.length > 0;
        return hasPermission(permissions, item.permission);
      });

    return { ...group, items };
  }).filter((group) => group.items.length > 0);
}

/** Entri daun (tanpa induk) untuk pencocokan path → izin. */
const LEAF_MENU = MENU_GROUPS.flatMap((group) =>
  group.items.flatMap((item) =>
    item.children?.length
      ? item.children.map((child) => ({
          href: child.href,
          permission: child.permission,
        }))
      : [{ href: item.href, permission: item.permission }],
  ),
);

/**
 * Izin minimum untuk sebuah path. Pencocokan memakai prefix terpanjang agar
 * halaman detail (mis. `/reservasi/<id>`) mewarisi izin menu induknya.
 */
export function permissionForPath(pathname: string): string | null {
  const clean = pathname.split("?")[0] || "/";
  let best: { href: string; permission: string | null } | null = null;

  for (const entry of LEAF_MENU) {
    const href = entry.href.split("?")[0] || "/";
    const matches =
      href === "/" ? clean === "/" : clean === href || clean.startsWith(`${href}/`);
    if (!matches) continue;
    if (!best || href.length > best.href.length) best = { href, permission: entry.permission };
  }

  return best?.permission ?? null;
}

/** Boleh membuka path ini? Path tak dikenal (mis. /akses-ditolak) selalu boleh. */
export function canAccessPath(
  permissions: string[] | null | undefined,
  pathname: string,
): boolean {
  return hasPermission(permissions, permissionForPath(pathname));
}

/** Halaman pertama yang boleh dibuka, dipakai tombol di halaman akses ditolak. */
export function firstAllowedPath(permissions: string[] | null | undefined): string {
  for (const group of MENU_GROUPS) {
    for (const item of group.items) {
      if (item.children?.length) {
        const child = item.children.find((entry) =>
          hasPermission(permissions, entry.permission),
        );
        if (child) return child.href;
        continue;
      }
      if (hasPermission(permissions, item.permission)) return item.href;
    }
  }
  return "/akses-ditolak";
}
