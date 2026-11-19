"use client";

import ComponentCard from "@/components/common/ComponentCard";
import { EmptyBlock, ErrorBlock, Skeleton } from "@/components/common/DataState";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import CateringPackageCard from "@/components/event/CateringPackageCard";
import EventPackageCard from "@/components/event/EventPackageCard";
import { useApi } from "@/hooks/useApi";
import { buildQuery } from "@/lib/client";
import { inputClass } from "@/lib/ui";
import type { CateringPackage, EventPackage } from "@/types/api";
import { cn } from "@/utils";
import { useState } from "react";

type Tab = "event" | "catering";

export default function EventPage() {
  const [tab, setTab] = useState<Tab>("event");
  const [isActive, setIsActive] = useState("");

  const eventPackages = useApi<EventPackage[]>(
    tab === "event" ? `/event-packages${buildQuery({ isActive })}` : null,
  );
  const cateringPackages = useApi<CateringPackage[]>(
    tab === "catering" ? `/catering-packages${buildQuery({ isActive })}` : null,
  );

  const tabs: { key: Tab; label: string }[] = [
    { key: "event", label: "Paket Event" },
    { key: "catering", label: "Paket Katering" },
  ];

  return (
    <div className="space-y-6">
      <PageBreadcrumb pageTitle="Event" items={[{ label: "Event" }]} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex w-full max-w-md gap-1 rounded-lg border border-coffee-linen p-0.5 dark:border-coffee-night-border">
          {tabs.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={cn(
                "flex-1 rounded-md px-3 py-2 text-theme-xs font-semibold transition-colors",
                tab === item.key
                  ? "bg-coffee-brown text-coffee-milk dark:bg-coffee-caramel dark:text-coffee-night"
                  : "text-coffee-muted hover:text-coffee-brown",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <label className="flex min-w-[160px] flex-col gap-1">
          <span className="text-theme-xs font-medium text-coffee-muted">Status</span>
          <select
            value={isActive}
            onChange={(event) => setIsActive(event.target.value)}
            className={inputClass}
          >
            <option value="">Semua</option>
            <option value="true">Aktif</option>
            <option value="false">Nonaktif</option>
          </select>
        </label>
      </div>

      {tab === "event" && (
        <ComponentCard title="Paket Event" desc="Paket acara beserta harga & fasilitas">
          {eventPackages.loading && !eventPackages.data ? (
            <Skeleton className="h-[300px] w-full" />
          ) : eventPackages.error ? (
            <ErrorBlock message={eventPackages.error} onRetry={eventPackages.reload} />
          ) : (eventPackages.data?.length ?? 0) === 0 ? (
            <EmptyBlock message="Belum ada paket event" />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {eventPackages.data!.map((pkg) => (
                <EventPackageCard key={pkg.id} pkg={pkg} />
              ))}
            </div>
          )}
        </ComponentCard>
      )}

      {tab === "catering" && (
        <ComponentCard title="Paket Katering" desc="Paket katering per orang beserta menu">
          {cateringPackages.loading && !cateringPackages.data ? (
            <Skeleton className="h-[300px] w-full" />
          ) : cateringPackages.error ? (
            <ErrorBlock message={cateringPackages.error} onRetry={cateringPackages.reload} />
          ) : (cateringPackages.data?.length ?? 0) === 0 ? (
            <EmptyBlock message="Belum ada paket katering" />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {cateringPackages.data!.map((pkg) => (
                <CateringPackageCard key={pkg.id} pkg={pkg} />
              ))}
            </div>
          )}
        </ComponentCard>
      )}

      <p className="text-theme-xs text-coffee-muted">
        Catatan: pengelolaan paket & daftar booking event belum tersedia di API — halaman ini hanya
        membaca katalog paket.
      </p>
    </div>
  );
}
