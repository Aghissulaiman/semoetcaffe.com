import type { StatusTone } from "@/lib/labels";
import { cn } from "@/utils";

const toneClasses: Record<StatusTone, string> = {
  success: "bg-coffee-success/15 text-coffee-success",
  warning: "bg-coffee-warning/20 text-coffee-warning",
  danger: "bg-coffee-danger/15 text-coffee-danger",
  coffee:
    "bg-coffee-brown/10 text-coffee-brown dark:bg-coffee-caramel/15 dark:text-coffee-caramel",
  muted: "bg-coffee-linen/60 text-coffee-muted dark:bg-white/5 dark:text-coffee-cream/70",
};

interface ToneBadgeProps {
  tone?: StatusTone;
  children: React.ReactNode;
  className?: string;
}

/** Pil status ringkas dengan warna sesuai tone. */
export default function ToneBadge({ tone = "muted", children, className }: ToneBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-theme-xs font-medium",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
