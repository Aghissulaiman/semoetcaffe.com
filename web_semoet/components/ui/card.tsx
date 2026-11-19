import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

interface CardProps {
  children: ReactNode;
  className?: string;
  /** Hilangkan bayangan (untuk kartu bersarang). */
  flat?: boolean;
}

/** Kartu putih dengan sudut membulat & bayangan lembut. */
export function Card({ children, className, flat = false }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-[18px] border border-line bg-surface p-4",
        !flat && "shadow-[0_6px_16px_rgba(42,26,17,0.06)]",
        className,
      )}>
      {children}
    </div>
  );
}
