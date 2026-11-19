"use client";

import { orderStatusLabel, orderStatusTone, type StatusTone } from "@/lib/labels";
import type { OrdersByStatus } from "@/types/api";
import { cn } from "@/utils";

const toneClasses: Record<StatusTone, string> = {
  success: "bg-coffee-success/15 text-coffee-success",
  warning: "bg-coffee-warning/20 text-coffee-warning",
  danger: "bg-coffee-danger/15 text-coffee-danger",
  coffee: "bg-coffee-brown/10 text-coffee-brown dark:bg-coffee-caramel/15 dark:text-coffee-caramel",
  muted: "bg-coffee-linen/60 text-coffee-muted dark:bg-white/5",
};

interface OrderStatusBreakdownProps {
  data: OrdersByStatus[];
}

export default function OrderStatusBreakdown({ data }: OrderStatusBreakdownProps) {
  const total = data.reduce((sum, item) => sum + item.count, 0) || 1;

  return (
    <ul className="space-y-3.5">
      {data.map((item) => {
        const percent = Math.round((item.count / total) * 100);
        return (
          <li key={item.orderStatus}>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-theme-xs font-medium",
                  toneClasses[orderStatusTone(item.orderStatus)],
                )}
              >
                {orderStatusLabel(item.orderStatus)}
              </span>
              <span className="text-theme-sm font-semibold text-coffee-espresso dark:text-coffee-cream">
                {item.count}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-coffee-linen/70 dark:bg-white/5">
              <div
                className="h-full rounded-full bg-coffee-brown dark:bg-coffee-caramel"
                style={{ width: `${percent}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
