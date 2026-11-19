import { CoffeeIcon } from "@/icons";
import { cn } from "@/utils";

interface SemoetLogoProps {
  /** Tampilkan hanya ikon (tanpa teks). */
  compact?: boolean;
  className?: string;
}

/**
 * Logo Semoet: keping cokelat dengan glyph kopi + wordmark.
 */
export default function SemoetLogo({ compact = false, className }: SemoetLogoProps) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-coffee-brown text-coffee-milk shadow-theme-sm dark:bg-coffee-caramel dark:text-coffee-night">
        <CoffeeIcon />
      </span>
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="text-lg font-bold tracking-tight text-coffee-espresso dark:text-coffee-cream">
            Semoet
          </span>
          <span className="text-theme-xs font-medium uppercase tracking-[0.18em] text-coffee-muted">
            Admin
          </span>
        </span>
      )}
    </span>
  );
}
