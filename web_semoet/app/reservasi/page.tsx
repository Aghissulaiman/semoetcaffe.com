"use client";

/**
 * Tab Reservasi — sistem reservasi tamu.
 *
 * Berisi: sapaan, tombol buat reservasi baru, dan daftar "Reservasi Saya"
 * (GET /me/reservations) dengan aksi buka detail & batal.
 */
import {
  CalendarDays,
  CalendarPlus,
  Clock,
  Image as ImageIcon,
  Info,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { ReservationCard } from "@/components/reservation-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Loader } from "@/components/ui/loader";
import { RESERVATION_GREETING } from "@/lib/reservation-content";
import { apiErrorFrom } from "@/services/client";
import { listMyReservations } from "@/services/reservation.service";
import { useAuthStore } from "@/store/auth-store";

import type { Reservation } from "@/types/api";

const ACTIVE_STATUSES: Reservation["status"][] = ["requested", "confirmed", "seated"];

function HeroPill({ icon: Icon, label }: { icon: typeof Clock; label: string }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white">
      <Icon size={13} />
      {label}
    </span>
  );
}

export default function ReservasiPage() {
  const router = useRouter();
  const status = useAuthStore((state) => state.status);
  const isAuthenticated = status === "authenticated";

  const [items, setItems] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (showSpinner = true) => {
      if (!isAuthenticated) {
        setItems([]);
        setLoading(false);
        return;
      }
      if (showSpinner) setLoading(true);
      setError(null);
      try {
        const res = await listMyReservations({ limit: 20 });
        setItems(res.items);
      } catch (err) {
        setError(apiErrorFrom(err, "Gagal memuat reservasi"));
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

  const infoButton = (
    <Button
      title="Info"
      icon={Info}
      variant="soft"
      size="sm"
      fullWidth={false}
      onClick={() => router.push("/reservasi/info")}
    />
  );

  if (status === "loading") return <Loader label="Memuat reservasi…" />;

  if (!isAuthenticated) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-black text-ink">Reservasi</h1>
            <p className="text-xs text-muted">Booking meja & event</p>
          </div>
          {infoButton}
        </div>
        <EmptyState
          icon={CalendarDays}
          title="Masuk untuk reservasi"
          description="Masuk dulu ya supaya reservasimu tersimpan di akun dan bisa dicek kapan saja."
          actionLabel="Masuk / Daftar"
          onAction={() => router.push("/auth/login")}
        />
        <Button
          title="Lihat info & ketentuan"
          icon={Info}
          variant="ghost"
          onClick={() => router.push("/reservasi/info")}
        />
      </div>
    );
  }

  const upcoming = items.filter((item) => ACTIVE_STATUSES.includes(item.status));
  const past = items.filter((item) => !ACTIVE_STATUSES.includes(item.status));

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-ink">Reservasi</h1>
          <p className="text-xs text-muted">Booking meja & event</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            aria-label="Muat ulang"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-primary transition hover:bg-cream focus-ring">
            <RefreshCw size={17} className={refreshing ? "animate-spin" : undefined} />
          </button>
          {infoButton}
        </div>
      </div>

      <div className="flex flex-col gap-3.5">
        {/* Sapaan + CTA */}
        <section className="flex flex-col gap-3.5 rounded-[22px] bg-primary p-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-white/20 text-white">
              <CalendarDays size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-wide text-white/80">
                Reservasi meja & event
              </p>
              <p className="text-[17px] font-extrabold text-white">Semoet Cafe</p>
            </div>
          </div>

          <p className="text-sm font-semibold leading-[21px] text-white">{RESERVATION_GREETING}</p>

          <div className="flex flex-wrap gap-2">
            <HeroPill icon={Clock} label="Slot otomatis" />
            <HeroPill icon={ImageIcon} label="Pilih area bergambar" />
            <HeroPill icon={Wallet} label="Info DP" />
          </div>

          <Button
            title="Buat Reservasi"
            icon={CalendarPlus}
            fullWidth={false}
            onClick={() => router.push("/reservasi/baru")}
            className="self-start bg-white text-primary hover:bg-white/90"
          />
        </section>

        {loading ? <Loader label="Memuat reservasi…" fullscreen={false} /> : null}

        {error && !loading ? <ErrorState message={error} onRetry={() => void load()} /> : null}

        {!loading && !error ? (
          <>
            <section className="flex flex-col gap-2.5">
              <h2 className="text-[15px] font-extrabold text-ink">Akan datang</h2>
              {upcoming.length === 0 ? (
                <p className="text-[13px] text-muted">
                  Belum ada reservasi aktif. Ketuk “Buat Reservasi” untuk mulai booking.
                </p>
              ) : (
                upcoming.map((item) => <ReservationCard key={item.id} reservation={item} />)
              )}
            </section>

            {past.length > 0 ? (
              <section className="mt-1 flex flex-col gap-2.5">
                <h2 className="text-[15px] font-extrabold text-ink">Riwayat</h2>
                {past.map((item) => (
                  <ReservationCard key={item.id} reservation={item} />
                ))}
              </section>
            ) : null}

            <div className="mt-1 flex items-center gap-2.5 rounded-[14px] bg-primary-soft p-3">
              <Info size={18} className="shrink-0 text-primary" />
              <p className="text-xs leading-[18px] text-muted">
                Aturan DP, paket wedding, dan ketentuan lain ada di halaman Info.
              </p>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
