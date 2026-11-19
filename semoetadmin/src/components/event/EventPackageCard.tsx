import ToneBadge from "@/components/common/ToneBadge";
import { formatIdr, formatNumber } from "@/lib/format";
import type { EventPackage } from "@/types/api";

interface EventPackageCardProps {
  pkg: EventPackage;
}

export default function EventPackageCard({ pkg }: EventPackageCardProps) {
  return (
    <div className="flex flex-col rounded-2xl border border-coffee-linen bg-white p-5 dark:border-coffee-night-border dark:bg-coffee-night-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-theme-sm font-semibold text-coffee-espresso dark:text-coffee-cream">
            {pkg.name}
          </p>
          <p className="font-mono text-theme-xs text-coffee-muted">{pkg.code}</p>
        </div>
        <ToneBadge tone={pkg.isActive ? "success" : "muted"}>
          {pkg.isActive ? "Aktif" : "Nonaktif"}
        </ToneBadge>
      </div>

      <p className="mt-4 text-2xl font-bold text-coffee-brown dark:text-coffee-caramel">
        {formatIdr(pkg.basePriceIdr)}
      </p>
      <p className="text-theme-xs text-coffee-muted">
        {formatNumber(pkg.minimumGuests)}
        {pkg.maximumGuests ? `–${formatNumber(pkg.maximumGuests)}` : "+"} tamu
      </p>

      {pkg.description && (
        <p className="mt-2 line-clamp-2 text-theme-xs text-coffee-muted">{pkg.description}</p>
      )}

      {pkg.inclusions.length > 0 && (
        <div className="mt-4 border-t border-dashed border-coffee-linen pt-4 dark:border-coffee-night-border">
          <p className="mb-1.5 text-theme-xs font-semibold text-coffee-muted">Termasuk</p>
          <ul className="space-y-1">
            {pkg.inclusions.map((item, index) => (
              <li
                key={`${item}-${index}`}
                className="flex items-start gap-1.5 text-theme-xs text-coffee-dark dark:text-coffee-cream/80"
              >
                <span className="text-coffee-success">•</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
