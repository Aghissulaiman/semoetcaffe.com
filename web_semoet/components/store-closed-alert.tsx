"use client";

/**
 * Peringatan ringkas di dalam halaman saat toko tutup.
 *
 * Berbeda dari StoreClosedNotice yang tampil sebagai banner global, komponen
 * ini dipakai dekat tombol beli/checkout supaya pelanggan tahu kenapa aksi
 * pembelian dinonaktifkan.
 */
import { Store } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/cn";
import { formatStoreNextOpen, timezoneLabel } from "@/lib/format";
import { useStoreStatusStore } from "@/store/store-status-store";

function clockLabel(value: string): string {
  return value.replace(":", ".");
}

function scheduleLabel(status: {
  schedule: { opensAt: string; closesAt: string };
  timezone: string;
}): string {
  const zone = timezoneLabel(status.timezone);
  return `${clockLabel(status.schedule.opensAt)}–${clockLabel(
    status.schedule.closesAt,
  )}${zone ? ` ${zone}` : ""}`;
}

interface StoreClosedAlertProps {
  className?: string;
}

export function StoreClosedAlert({ className }: StoreClosedAlertProps) {
  const status = useStoreStatusStore((state) => state.status);

  if (!status || status.isOpen) return null;

  const manuallyClosed = status.mode === "closed";
  const schedule = scheduleLabel(status);
  const nextOpen =
    formatStoreNextOpen(status.nextOpenAt, status.timezone) ||
    `pukul ${clockLabel(status.schedule.opensAt)}`;

  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2.5 rounded-[14px] border border-[#e9c9a8] bg-[#fbeedd] px-3 py-2.5 text-[#6b3f1d]",
        className,
      )}>
      <Store size={16} className="mt-0.5 shrink-0 text-warning" />
      <div className="min-w-0">
        <p className="text-[12.5px] font-extrabold leading-5">
          {manuallyClosed ? "Toko sedang tutup sementara" : "Toko sedang tutup"}
        </p>
        <p className="text-[11.5px] leading-5">
          Pemesanan online di <span className="font-bold">{status.branchName}</span>{" "}
          belum bisa dilakukan.{" "}
          {manuallyClosed
            ? `Jam operasional ${schedule}.`
            : `Buka lagi ${nextOpen}. Jam operasional ${schedule}.`}{" "}
          <Link
            href="/cart"
            className="font-bold underline underline-offset-2 hover:text-ink">
            Ganti cabang
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
