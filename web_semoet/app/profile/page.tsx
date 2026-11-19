"use client";

/**
 * Profil — GET /me (profile) + GET /me/points (saldo poin).
 */
import {
  CalendarDays,
  ChevronRight,
  Heart,
  HelpCircle,
  LogOut,
  MapPin,
  MessageCircle,
  ReceiptText,
  Ticket,
  User as UserIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AppDialog } from "@/components/ui/app-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Loader } from "@/components/ui/loader";
import { formatRupiah } from "@/lib/format";
import { getPoints } from "@/services/loyalty.service";
import { getProfile } from "@/services/profile.service";
import { useAuthStore } from "@/store/auth-store";

import type { MePayload, PointsSummary } from "@/types/api";

export default function ProfilePage() {
  const router = useRouter();
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const isAuthenticated = status === "authenticated";

  const [profile, setProfile] = useState<MePayload | null>(null);
  const [points, setPoints] = useState<PointsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);

  const load = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      setError(null);
      const [profileResult, pointsResult] = await Promise.all([
        getProfile().catch(() => null),
        getPoints().catch(() => null),
      ]);
      setProfile(profileResult);
      setPoints(pointsResult);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void load();
  }, [load]);

  const doLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      router.replace("/");
    } catch {
      // Sesi lokal tetap dibersihkan oleh store.
    } finally {
      setLoggingOut(false);
      setLogoutOpen(false);
    }
  };

  if (status === "loading") return <Loader label="Memuat profil…" />;

  if (!isAuthenticated) {
    return (
      <EmptyState
        icon={UserIcon}
        title="Kamu belum masuk"
        description="Masuk untuk menyimpan pesanan, kumpulkan poin, dan pakai voucher."
        actionLabel="Masuk / Daftar"
        onAction={() => router.push("/auth/login")}
      />
    );
  }

  if (loading && !profile) return <Loader label="Memuat profil…" />;

  const displayName = profile?.profile?.displayName ?? user?.displayName ?? "Pelanggan";
  const email = profile?.profile?.email ?? user?.email ?? null;
  const phone = user?.phoneE164 ?? null;
  const tier = points?.tier ?? null;

  const menu = [
    {
      icon: CalendarDays,
      label: "Reservasi & event",
      hint: "Booking meja, DP, wedding",
      href: "/reservasi",
    },
    {
      icon: ReceiptText,
      label: "Pesanan saya",
      hint: "Riwayat & status pesanan",
      href: "/orders",
    },
    {
      icon: Ticket,
      label: "Voucher & poin",
      hint: points ? `${points.balance} poin` : "Klaim voucher, tukar poin",
      href: "/vouchers",
    },
    {
      icon: Heart,
      label: "Favorit",
      hint: "Menu yang kamu suka",
      href: "/favorites",
    },
    {
      icon: MapPin,
      label: "Alamat",
      hint: "Alamat untuk pesanan antar",
      href: "/addresses",
    },
    {
      icon: MessageCircle,
      label: "Chat support",
      hint: "Tanya atau laporkan kendala pesanan",
      href: "/chat",
    },
    {
      icon: HelpCircle,
      label: "Pusat bantuan (FAQ)",
      hint: "Jawaban cepat seputar pesanan",
      href: "/faq",
    },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-4">
      <h1 className="mb-4 text-xl font-black text-ink">Profil</h1>

      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}

      <div className="flex flex-col gap-4">
        <Card>
          <div className="flex items-center gap-3.5">
            <div className="flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-full bg-primary text-2xl font-extrabold text-white">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[17px] font-extrabold text-ink">{displayName}</p>
                {tier ? <Badge label={tier.name} tone="gold" size="sm" /> : null}
              </div>
              <p className="truncate text-xs text-muted">{email ?? phone ?? "-"}</p>
            </div>
          </div>
        </Card>

        <button type="button" onClick={() => router.push("/vouchers")} className="text-left focus-ring">
          <Card className="border-primary bg-primary">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-white/80">Poin sementara</p>
                <p className="text-[28px] font-black text-white">
                  {points ? formatRupiah(points.balance).replace("Rp", "") : "—"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-white/80">
                  {points ? `Perolehan seumur hidup ${points.lifetimeEarned}` : ""}
                </p>
                <p className="text-[13px] font-bold text-white">Tukar poin →</p>
              </div>
            </div>
          </Card>
        </button>

        <div className="flex flex-col gap-2.5">
          {menu.map((row) => (
            <button
              key={row.label}
              type="button"
              onClick={() => router.push(row.href)}
              className="flex items-center gap-3.5 rounded-2xl border border-line bg-surface p-3.5 text-left transition hover:border-primary/40 hover:bg-primary-soft/30 focus-ring">
              <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                <row.icon size={19} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold text-ink">{row.label}</span>
                <span className="block text-xs text-muted">{row.hint}</span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-muted" />
            </button>
          ))}
        </div>

        <Button
          title="Keluar"
          icon={LogOut}
          variant="outline"
          loading={loggingOut}
          onClick={() => setLogoutOpen(true)}
        />
      </div>

      <AppDialog
        visible={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        title="Keluar akun"
        message="Yakin ingin keluar dari akunmu?"
        icon={LogOut}
        tone="danger"
        confirmLabel="Keluar"
        confirmVariant="danger"
        confirmLoading={loggingOut}
        onConfirm={() => void doLogout()}
        cancelLabel="Batal"
      />
    </div>
  );
}
