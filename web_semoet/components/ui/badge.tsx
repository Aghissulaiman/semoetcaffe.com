import { cn } from "@/lib/cn";

export type BadgeTone = "default" | "success" | "warning" | "danger" | "info" | "gold";

interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  size?: "sm" | "md";
  className?: string;
}

const TONES: Record<BadgeTone, string> = {
  default: "bg-[#f5f0eb] text-ink-soft",
  success: "bg-[#e7f1ea] text-success",
  warning: "bg-[#fbeedd] text-warning",
  danger: "bg-[#f7e4e0] text-danger",
  info: "bg-primary-soft text-primary",
  gold: "bg-[#f6efd3] text-gold",
};

/** Label status kecil (status pesanan, tier, dsb). */
export function Badge({ label, tone = "default", size = "md", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-block self-start rounded-full font-bold",
        size === "sm" ? "px-2 py-[3px] text-[11px]" : "px-[11px] py-[5px] text-xs",
        TONES[tone],
        className,
      )}>
      {label}
    </span>
  );
}
