"use client";

/**
 * Pemberitahuan toko tutup untuk web pelanggan.
 *
 * - Popup muncul sekali saat halaman pertama dibuka (atau saat cabang/status
 *   tutup berubah), lalu bisa ditutup.
 * - Setelah popup ditutup, banner tipis tetap tampil di atas halaman selama
 *   toko masih tutup.
 */
import { Store } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AppDialog } from "@/components/ui/app-dialog";
import {
  formatStoreNextOpen,
  timezoneLabel,
} from "@/lib/format";

import type { PublicStoreStatus } from "@/types/api";

interface StoreClosedNoticeProps {
  status: PublicStoreStatus | null;
}

function clockLabel(value: string): string {
  return value.replace(":", ".");
}

function scheduleLabel(status: PublicStoreStatus): string {
  const zone = timezoneLabel(status.timezone);
  return `${clockLabel(status.schedule.opensAt)}–${clockLabel(
    status.schedule.closesAt,
  )}${zone ? ` ${zone}` : ""}`;
}

export function StoreClosedNotice({ status }: StoreClosedNoticeProps) {
  const router = useRouter();
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  if (!status || status.isOpen) return null;

  const closedKey = `${status.branchId}:${status.updatedAt ?? ""}:${
    status.nextOpenAt ?? ""
  }`;
  const nextOpen =
    formatStoreNextOpen(status.nextOpenAt, status.timezone) ||
    `pukul ${clockLabel(status.schedule.opensAt)}`;
  const schedule = scheduleLabel(status);
  const manuallyClosed = status.mode === "closed";
  const detail = manuallyClosed
    ? `Jam operasional ${schedule}.`
    : `Buka lagi ${nextOpen}. Jam operasional ${schedule}.`;
  const showPopup = dismissedKey !== closedKey;

  const dismiss = () => setDismissedKey(closedKey);

  return (
    <>
      <div
        role="status"
        className="border-b border-[#e9c9a8] bg-[#fbeedd] text-[#6b3f1d]">
        <div className="mx-auto flex w-full max-w-6xl items-start gap-2.5 px-4 py-2.5 md:px-6">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f7dcc1] text-warning">
            <Store size={15} />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-extrabold leading-5">
              {manuallyClosed ? "Toko sedang tutup sementara" : "Toko sedang tutup"}
            </p>
            <p className="text-[12px] leading-5">
              <span className="font-bold">{status.branchName}</span>.{" "}
              {manuallyClosed ? (
                <>
                  Jam operasional{" "}
                  <span className="font-bold">{schedule}</span>.
                </>
              ) : (
                <>
                  Buka lagi <span className="font-bold">{nextOpen}</span>. Jam
                  operasional <span className="font-bold">{schedule}</span>.
                </>
              )}{" "}
              <Link
                href="/cart"
                className="font-bold underline underline-offset-2 hover:text-ink">
                Ganti cabang
              </Link>
              .
            </p>
          </div>
        </div>
      </div>

      <AppDialog
        visible={showPopup}
        onClose={dismiss}
        title={
          manuallyClosed
            ? "Toko saat ini tutup sementara"
            : "Toko saat ini sedang tutup"
        }
        message={`${status.branchName} sedang tutup. ${detail} Pilih cabang lain di keranjang bila ingin memesan dari cabang yang sedang buka.`}
        icon={Store}
        tone="warning"
        confirmLabel="Pilih cabang"
        onConfirm={() => {
          dismiss();
          router.push("/cart");
        }}
        cancelLabel="Mengerti"
      />
    </>
  );
}
