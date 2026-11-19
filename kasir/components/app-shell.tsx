"use client";

import {
  BarChart3,
  BellRing,
  Calculator,
  CalendarDays,
  Clock3,
  Coffee,
  DoorOpen,
  History,
  Loader2,
  LogOut,
  MessageCircle,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Printer,
  ReceiptText,
  Store,
  Volume2,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { ReceiptModal } from "@/components/receipt-modal";
import { ShiftModal } from "@/components/shift-modal";
import { Button, PageLoader, Select } from "@/components/ui";
import {
  api,
  apiErrorFrom,
  request,
  type ApiChatConversation,
  type ApiShift,
} from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  formatClock,
  formatDateLong,
  formatDuration,
  formatRupiah,
  formatTime,
  ORDER_TYPE_SHORT,
} from "@/lib/format";
import {
  playNewOrderSound,
  requestNotificationPermission,
  showOrderNotification,
  unlockNotificationAudio,
} from "@/lib/notifications";
import { useKasir } from "@/lib/store";
import type { Order } from "@/lib/types";
import { useToday } from "@/lib/use-today";

const SIDEBAR_COLLAPSED_KEY = "semoet.kasir.sidebarCollapsed";

const NAV = [
  { href: "/", label: "Kasir", icon: Store, exact: true },
  { href: "/pesanan", label: "Pesanan", icon: ReceiptText },
  { href: "/riwayat", label: "Riwayat", icon: History },
  { href: "/stok", label: "Stok", icon: Package },
  { href: "/toko", label: "Toko", icon: DoorOpen },
  { href: "/printer", label: "Printer", icon: Printer },
  { href: "/reservasi", label: "Reservasi", icon: CalendarDays },
  { href: "/chat", label: "Chat", icon: MessageCircle },
  { href: "/kalkulator", label: "Kalkulator", icon: Calculator },
  { href: "/laporan", label: "Laporan", icon: BarChart3 },
];

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    authStatus,
    user,
    logout,
    hydrated,
    loading,
    error,
    orders,
    incomingOrders,
    dismissIncomingOrders,
    reservations,
    branch,
    branches,
    branchId,
    setBranchId,
    refreshAll,
    refreshing,
  } = useKasir();
  const today = useToday();
  const [now, setNow] = useState<Date | null>(null);
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);
  const [shift, setShift] = useState<ApiShift | null>(null);
  const [shiftOpen, setShiftOpen] = useState(false);
  const [shiftError, setShiftError] = useState<string | null>(null);
  const [shiftVersion, setShiftVersion] = useState(0);
  const [chatWaiting, setChatWaiting] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const lastAlertOrderIdRef = useRef<string | null>(null);

  // Preferensi lebar sidebar disimpan supaya tidak berubah saat halaman
  // di-refresh atau terminal kasir dibuka ulang.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setSidebarCollapsed(
          window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1",
        );
      } catch {
        // localStorage bisa diblokir; sidebar tetap memakai lebar default.
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const toggleSidebar = () => {
    setSidebarCollapsed((previous) => {
      const next = !previous;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // abaikan
      }
      return next;
    });
  };

  // Halaman Toko bisa membuka modal shift yang sama lewat event ringan.
  useEffect(() => {
    const openShift = () => setShiftOpen(true);
    window.addEventListener("semoet:open-shift", openShift);
    return () => window.removeEventListener("semoet:open-shift", openShift);
  }, []);

  // Shift aktif selalu mengikuti cabang yang dipilih. Polling ringan supaya
  // kalau shift ditutup dari terminal lain, kartu di sidebar ikut berubah.
  useEffect(() => {
    if (authStatus !== "authenticated" || !branchId) return;
    let cancelled = false;

    const loadShift = async () => {
      try {
        const result = await api<{ shift: ApiShift | null }>(
          "/admin/shifts/active",
          { query: { branchId } },
        );
        if (cancelled) return;
        setShift(result.shift);
        setShiftError(null);
      } catch (err) {
        if (!cancelled) {
          setShiftError(apiErrorFrom(err, "Gagal memuat shift"));
        }
      }
    };

    void loadShift();
    const timer = window.setInterval(() => void loadShift(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [authStatus, branchId, shiftVersion]);

  // Jumlah chat yang menunggu balasan untuk badge menu Chat. Endpoint admin
  // hanya dipakai untuk hitungan, jadi cukup minta satu baris.
  useEffect(() => {
    if (authStatus !== "authenticated") return;
    let cancelled = false;

    const loadChatWaiting = async () => {
      try {
        const result = await request<ApiChatConversation[]>(
          "/admin/chat/conversations",
          { query: { status: "waiting", limit: 1 } },
        );
        if (!cancelled) setChatWaiting(result.meta?.total ?? 0);
      } catch {
        // Badge tidak penting; jangan ganggu halaman kasir kalau gagal.
      }
    };

    void loadChatWaiting();
    const timer = window.setInterval(() => void loadChatWaiting(), 30_000);
    const onChatChanged = () => void loadChatWaiting();
    window.addEventListener("semoet:chat-changed", onChatChanged);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("semoet:chat-changed", onChatChanged);
    };
  }, [authStatus]);

  const refreshShift = () => {
    setShiftVersion((value) => value + 1);
    window.dispatchEvent(new Event("semoet:shift-changed"));
  };

  // Jangan tampilkan shift milik cabang lama saat cabang baru sedang dimuat.
  const visibleShift =
    shift && branchId && shift.branchId === branchId ? shift : null;

  useEffect(() => {
    const update = () => setNow(new Date());
    const initial = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 30_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, []);

  // Buka izin audio pada interaksi pertama. Browser modern memblokir audio
  // yang diputar tanpa gesture pengguna. Setelah login, sekalian minta izin
  // notifikasi desktop (kalau belum pernah diminta).
  useEffect(() => {
    let unlocked = false;
    const unlock = () => {
      if (unlocked) return;
      unlocked = true;
      void unlockNotificationAudio();
      if (authStatus === "authenticated") {
        void requestNotificationPermission();
      }
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [authStatus]);

  // Bunyikan alarm + notifikasi saat ada order baru dari web pelanggan.
  useEffect(() => {
    const latest = incomingOrders[0];
    if (!latest || latest.id === lastAlertOrderIdRef.current) return;
    lastAlertOrderIdRef.current = latest.id;
    void playNewOrderSound();
    showOrderNotification(latest, () => router.push("/pesanan"));
  }, [incomingOrders, router]);

  // Halaman kasir hanya boleh dibuka setelah login. Halaman /login sendiri
  // tetap dirender tanpa shell supaya form masuk tidak tertutup sidebar.
  useEffect(() => {
    if (authStatus === "guest" && pathname !== "/login") {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [authStatus, pathname, router]);

  if (authStatus === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas">
        <div className="flex flex-col items-center gap-3 text-muted">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
          <p className="text-sm font-semibold">Memeriksa sesi kasir…</p>
        </div>
      </div>
    );
  }

  if (authStatus === "guest") {
    if (pathname === "/login") return <>{children}</>;
    return <PageLoader label="Mengalihkan ke halaman masuk…" />;
  }

  // LoginPage yang mengarahkan ke halaman tujuan setelah sesi aktif.
  if (pathname === "/login") return <>{children}</>;

  const pendingOrders = orders.filter(
    (order) =>
      order.status === "placed" ||
      order.status === "accepted" ||
      order.status === "preparing" ||
      order.status === "ready",
  ).length;
  const pendingReservations =
    today !== null
      ? reservations.filter(
          (reservation) =>
            reservation.status === "requested" && reservation.date >= today,
        ).length
      : 0;

  const displayBranch = branch?.name ?? "Semoet Cafe";
  const displayCashier = user?.displayName ?? "Kasir";
  const latestIncoming = incomingOrders[0] ?? null;

  const badgeFor = (href: string): number => {
    if (href === "/pesanan") return pendingOrders;
    if (href === "/reservasi") return pendingReservations;
    if (href === "/chat") return chatWaiting;
    return 0;
  };

  const branchSelect = (
    <Select
      aria-label="Pilih cabang"
      value={branchId ?? ""}
      onChange={(event) => setBranchId(event.target.value)}
      className="h-9 rounded-xl border-line/70 bg-milk text-xs font-bold"
    >
      {branches.map((item) => (
        <option key={item.id} value={item.id}>
          {item.name}
        </option>
      ))}
    </Select>
  );

  return (
    <div className="min-h-dvh bg-canvas">
      {/* Sidebar desktop */}
      <aside
        className={cn(
          "no-print fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-line bg-surface transition-[width] duration-200 ease-out lg:flex",
          sidebarCollapsed ? "w-20" : "w-64",
        )}
      >
        <div
          className={cn(
            "flex items-center gap-3 pb-4 pt-5",
            sidebarCollapsed ? "flex-col px-2" : "px-5",
          )}
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-white shadow-sm shadow-primary/25">
            <Coffee size={22} />
          </span>
          {!sidebarCollapsed ? (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black tracking-tight text-ink">
                Semoet Kasir
              </p>
              <p className="truncate text-[11px] text-muted">{displayBranch}</p>
            </div>
          ) : null}
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={
              sidebarCollapsed ? "Perbesar sidebar" : "Perkecil sidebar"
            }
            aria-expanded={!sidebarCollapsed}
            title={sidebarCollapsed ? "Perbesar sidebar" : "Perkecil sidebar"}
            className={cn(
              "focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-primary-soft hover:text-primary",
              sidebarCollapsed ? "" : "ml-auto",
            )}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen size={16} />
            ) : (
              <PanelLeftClose size={16} />
            )}
          </button>
        </div>

        <nav
          className={cn(
            "flex flex-1 flex-col gap-1 pt-2",
            sidebarCollapsed ? "px-2" : "px-3",
          )}
        >
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href, item.exact);
            const badge = badgeFor(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={sidebarCollapsed ? item.label : undefined}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "focus-ring group flex items-center rounded-xl text-sm font-bold transition",
                  sidebarCollapsed
                    ? "justify-center px-0 py-3"
                    : "gap-3 px-3 py-2.5",
                  active
                    ? "bg-primary text-white shadow-sm shadow-primary/20"
                    : "text-ink-soft hover:bg-primary-soft hover:text-primary",
                )}
              >
                {sidebarCollapsed ? (
                  <span className="relative shrink-0">
                    <Icon size={18} />
                    {badge > 0 ? (
                      <span className="absolute -right-2.5 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-warning px-1 text-[9px] font-black text-white ring-2 ring-surface">
                        {badge}
                      </span>
                    ) : null}
                  </span>
                ) : (
                  <>
                    <Icon size={18} className="shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    {badge > 0 ? (
                      <span
                        className={cn(
                          "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-black",
                          active
                            ? "bg-white/20 text-white"
                            : "bg-warning text-white",
                        )}
                      >
                        {badge}
                      </span>
                    ) : null}
                  </>
                )}
              </Link>
            );
          })}
        </nav>

        <div
          className={cn(
            "border-t border-line",
            sidebarCollapsed ? "p-2" : "p-4",
          )}
        >
          {sidebarCollapsed ? (
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => setShiftOpen(true)}
                title={
                  visibleShift
                    ? `Shift aktif: ${visibleShift.staffName}`
                    : "Mulai shift"
                }
                aria-label="Buka pengaturan shift"
                className="focus-ring flex h-11 w-11 items-center justify-center rounded-xl bg-milk text-primary transition hover:bg-primary-soft"
              >
                <span className="relative">
                  <Clock3 size={18} />
                  {visibleShift ? (
                    <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-success ring-2 ring-milk" />
                  ) : null}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setSidebarCollapsed(false)}
                title={`Ganti cabang (${displayBranch})`}
                aria-label="Ganti cabang"
                className="focus-ring flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface text-muted transition hover:bg-primary-soft hover:text-primary"
              >
                <Store size={16} />
              </button>
              <button
                type="button"
                onClick={() => void refreshAll()}
                disabled={refreshing || loading}
                title="Muat ulang data"
                aria-label="Muat ulang data"
                className="focus-ring flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface text-muted transition hover:bg-primary-soft hover:text-primary disabled:opacity-50"
              >
                <Loader2
                  size={16}
                  className={refreshing ? "animate-spin" : undefined}
                />
              </button>
              <button
                type="button"
                onClick={() => void playNewOrderSound()}
                title="Tes suara notifikasi"
                aria-label="Tes suara notifikasi"
                className="focus-ring flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface text-muted transition hover:bg-primary-soft hover:text-primary"
              >
                <Volume2 size={16} />
              </button>
              <button
                type="button"
                onClick={() => void logout()}
                title="Keluar"
                aria-label="Keluar"
                className="focus-ring flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface text-muted transition hover:bg-danger/10 hover:text-danger"
              >
                <LogOut size={16} />
              </button>
              {shiftError ? (
                <span
                  className="h-2 w-2 rounded-full bg-danger"
                  title={shiftError}
                />
              ) : null}
            </div>
          ) : (
            <>
              <div className="rounded-2xl bg-milk p-3.5">
                <button
                  type="button"
                  onClick={() => setShiftOpen(true)}
                  className="focus-ring w-full text-left"
                  aria-label="Buka pengaturan shift"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted">
                      {visibleShift ? "Shift aktif" : "Shift belum dibuka"}
                    </p>
                    <Clock3 size={13} className="text-primary" />
                  </div>
                  <p className="mt-1 truncate text-sm font-black text-ink">
                    {visibleShift?.staffName ?? "Pilih akun staf"}
                  </p>
                  <p className="text-[11px] text-muted">
                    {visibleShift
                      ? visibleShift.plannedStartAt &&
                        visibleShift.plannedEndAt
                        ? `Rencana ${formatTime(
                            visibleShift.plannedStartAt,
                          )}–${formatTime(visibleShift.plannedEndAt)}`
                        : `${formatTime(
                            visibleShift.openedAt,
                          )} · ${formatDuration(visibleShift.durationMinutes)}`
                      : now
                        ? formatDateLong(now)
                        : "—"}
                  </p>
                  <p className="mt-1 text-2xl font-black tracking-tight text-primary tabular">
                    {formatClock(now)}
                  </p>
                  <p className="mt-1 text-[10px] font-bold text-primary">
                    {visibleShift ? "Ganti / tutup shift" : "Mulai shift →"}
                  </p>
                </button>
                {shiftError ? (
                  <p className="mt-1 text-[10px] font-semibold text-danger">
                    {shiftError}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => void playNewOrderSound()}
                  className="focus-ring mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-surface py-1.5 text-[11px] font-bold text-ink-soft transition hover:bg-primary-soft"
                >
                  <Volume2 size={12} />
                  Tes suara
                </button>
              </div>

              <div className="mt-2 flex flex-col gap-2">
                {branchSelect}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void refreshAll()}
                    disabled={refreshing || loading}
                    className="focus-ring flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface text-xs font-bold text-ink-soft transition hover:bg-primary-soft disabled:opacity-50"
                  >
                    <Loader2
                      size={14}
                      className={refreshing ? "animate-spin" : undefined}
                    />
                    Muat ulang
                  </button>
                  <button
                    type="button"
                    onClick={() => void logout()}
                    className="focus-ring flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface text-xs font-bold text-ink-soft transition hover:bg-danger/10 hover:text-danger"
                  >
                    <LogOut size={14} />
                    Keluar
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </aside>

      {/* Header mobile */}
      <header className="no-print sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white">
            <Coffee size={18} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-black leading-tight text-ink">
              Semoet Kasir
            </p>
            <p className="truncate text-[10px] text-muted">{displayBranch}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setShiftOpen(true)}
            className="focus-ring text-right"
            aria-label="Buka pengaturan shift"
          >
            <p className="max-w-28 truncate text-[10px] text-muted">
              {visibleShift?.staffName ?? displayCashier}
            </p>
            <p className="text-sm font-black text-primary tabular">
              {formatClock(now)}
            </p>
          </button>
          <button
            type="button"
            onClick={() => void playNewOrderSound()}
            aria-label="Tes suara notifikasi"
            className="focus-ring flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface text-muted"
          >
            <Volume2 size={16} />
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            aria-label="Keluar"
            className="focus-ring flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface text-muted"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <div
        className={cn(
          "transition-[padding] duration-200 ease-out",
          sidebarCollapsed ? "lg:pl-20" : "lg:pl-64",
        )}
      >
        <main className="mx-auto w-full max-w-[1500px] px-4 pb-28 pt-4 lg:px-8 lg:pb-10 lg:pt-7">
          {error ? (
            <div className="mb-3 rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">
              {error}
            </div>
          ) : null}
          {loading && !hydrated ? (
            <PageLoader label="Memuat data kasir…" />
          ) : (
            children
          )}
        </main>
      </div>

      {/* Bottom nav mobile */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <div className="no-scrollbar mx-auto flex max-w-lg items-stretch overflow-x-auto">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href, item.exact);
            const badge = badgeFor(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                className={cn(
                  "focus-ring relative flex min-w-[52px] flex-1 flex-col items-center gap-1 whitespace-nowrap py-2.5 text-[9px] font-extrabold transition",
                  active ? "text-primary" : "text-muted",
                )}
              >
                <span className="relative">
                  <Icon size={19} />
                  {badge > 0 ? (
                    <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-warning px-1 text-[9px] font-black text-white">
                      {badge}
                    </span>
                  ) : null}
                </span>
                {item.label}
                {active ? (
                  <span className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-primary" />
                ) : null}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Toast pesanan baru: tampil di semua halaman kasir. */}
      {latestIncoming ? (
        <div
          role="alert"
          aria-live="assertive"
          className="no-print animate-pop fixed inset-x-3 top-20 z-[70] mx-auto max-w-sm overflow-hidden rounded-2xl border-2 border-warning bg-surface shadow-2xl shadow-espresso/20 sm:left-auto sm:right-4 sm:top-4 sm:mx-0 sm:w-96"
        >
          <div className="flex items-start gap-3 p-4">
            <span className="flex h-11 w-11 shrink-0 animate-pulse items-center justify-center rounded-xl bg-warning text-white">
              <BellRing size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-ink">
                Pesanan baru masuk!
              </p>
              <p className="truncate text-xs font-semibold text-ink-soft">
                {latestIncoming.code} ·{" "}
                {latestIncoming.customerName || "Walk-in"}
              </p>
              <p className="mt-0.5 text-[11px] font-semibold text-muted">
                {ORDER_TYPE_SHORT[latestIncoming.type]} ·{" "}
                {latestIncoming.items.length} item
              </p>
              <p className="mt-0.5 text-sm font-black text-primary tabular">
                {formatRupiah(latestIncoming.total)}
              </p>

              {/* Ringkasan item supaya kasir bisa langsung membacakan ke dapur. */}
              <div className="mt-2 max-h-32 space-y-1.5 overflow-y-auto rounded-lg border border-line bg-milk/70 p-2">
                {latestIncoming.items.map((item) => (
                  <div key={item.key} className="text-[11px] leading-snug">
                    <p className="font-bold text-ink">
                      {item.qty}x {item.name}
                      {item.variantName ? (
                        <span className="font-normal text-muted">
                          {" "}
                          ({item.variantName})
                        </span>
                      ) : null}
                    </p>
                    {item.modifiers.length > 0 ? (
                      <p className="text-[10px] text-muted">
                        +{" "}
                        {item.modifiers
                          .map((modifier) => modifier.name)
                          .join(", ")}
                      </p>
                    ) : null}
                    {item.note ? (
                      <p className="text-[10px] font-semibold text-warning">
                        Catatan: {item.note}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>

              {latestIncoming.note ? (
                <p className="mt-1.5 rounded-lg border border-warning/30 bg-warning/10 px-2 py-1 text-[10px] font-semibold text-ink">
                  Catatan pesanan: {latestIncoming.note}
                </p>
              ) : null}

              {incomingOrders.length > 1 ? (
                <p className="mt-1 text-[11px] font-bold text-warning">
                  +{incomingOrders.length - 1} pesanan baru lainnya
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={dismissIncomingOrders}
              aria-label="Tutup notifikasi"
              className="focus-ring -mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-milk hover:text-ink"
            >
              <X size={16} />
            </button>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-line bg-milk px-4 py-2.5">
            <Button
              size="sm"
              className="flex-1"
              onClick={() => {
                dismissIncomingOrders();
                router.push("/pesanan");
              }}
            >
              <ReceiptText size={14} />
              Lihat Pesanan
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDetailOrder(latestIncoming)}
            >
              Detail
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void playNewOrderSound()}
              aria-label="Tes suara notifikasi"
              title="Tes suara notifikasi"
            >
              <Volume2 size={14} />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={dismissIncomingOrders}
            >
              Nanti
            </Button>
          </div>
        </div>
      ) : null}

      {shiftOpen ? (
        <ShiftModal
          open
          onClose={() => setShiftOpen(false)}
          branchId={branchId}
          branchName={displayBranch}
          shift={visibleShift}
          user={user}
          onChanged={refreshShift}
        />
      ) : null}

      <ReceiptModal
        order={detailOrder}
        onClose={() => setDetailOrder(null)}
      />
    </div>
  );
}
