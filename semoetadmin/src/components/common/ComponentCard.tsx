import { cn } from "@/utils";
import React from "react";

interface ComponentCardProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
  desc?: string;
  /** Konten di sisi kanan header (mis. tombol/filter). */
  action?: React.ReactNode;
}

/**
 * Kartu panel standar Semoet: sudut membulat, border linen, latar putih.
 */
const ComponentCard: React.FC<ComponentCardProps> = ({
  title,
  children,
  className = "",
  desc = "",
  action,
}) => {
  const hasHeader = Boolean(title || desc || action);

  return (
    <div
      className={cn(
        "rounded-2xl border border-coffee-linen bg-white shadow-theme-xs dark:border-coffee-night-border dark:bg-coffee-night-soft",
        className,
      )}
    >
      {hasHeader && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-coffee-linen px-5 py-4 sm:px-6 dark:border-coffee-night-border">
          <div>
            {title && (
              <h3 className="text-base font-semibold text-coffee-espresso dark:text-coffee-cream">
                {title}
              </h3>
            )}
            {desc && <p className="mt-0.5 text-sm text-coffee-muted">{desc}</p>}
          </div>
          {action && <div className="flex items-center gap-2">{action}</div>}
        </div>
      )}

      <div className="p-5 sm:p-6">{children}</div>
    </div>
  );
};

export default ComponentCard;
