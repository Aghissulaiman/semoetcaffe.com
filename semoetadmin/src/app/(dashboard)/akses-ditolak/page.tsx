"use client";

import ComponentCard from "@/components/common/ComponentCard";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { useSession } from "@/hooks/useSession";
import { firstAllowedPath, hasPermission } from "@/lib/access";
import { logout } from "@/lib/auth-client";
import { primaryButtonClass, secondaryButtonClass } from "@/lib/ui";
import Link from "next/link";

/**
 * Halaman tujuan saat peran pengguna tidak punya izin membuka suatu menu.
 * Sidebar tetap tampil sehingga pengguna bisa berpindah ke menu yang diizinkan.
 */
export default function AksesDitolakPage() {
  const { me } = useSession();
  const nextPath = firstAllowedPath(me?.permissions);
  const hasAnyMenu = nextPath !== "/akses-ditolak";
  const canOpenDashboard = hasPermission(me?.permissions, "order:read");

  return (
    <div>
      <PageBreadcrumb pageTitle="Akses Ditolak" items={[{ label: "Akses Ditolak" }]} />

      <ComponentCard
        title="Halaman ini tidak tersedia untuk peran Anda"
        desc="Izin akses diatur oleh pemilik/admin melalui menu Peran & Izin."
      >
        <div className="flex flex-col items-start gap-4">
          <div className="rounded-xl border border-coffee-warning/30 bg-coffee-warning/10 p-4 text-theme-sm text-coffee-dark dark:text-coffee-cream">
            <p>
              Peran Anda belum memiliki izin untuk membuka halaman ini. Bila akses
              memang dibutuhkan, minta admin menambahkan izin pada peran yang Anda
              pakai.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {hasAnyMenu ? (
              <Link href={nextPath} className={primaryButtonClass}>
                Buka halaman yang tersedia
              </Link>
            ) : (
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={() => {
                  void logout();
                }}
              >
                Keluar
              </button>
            )}
            {canOpenDashboard && nextPath !== "/" && (
              <Link href="/" className={secondaryButtonClass}>
                Ke Dashboard
              </Link>
            )}
          </div>
        </div>
      </ComponentCard>
    </div>
  );
}
