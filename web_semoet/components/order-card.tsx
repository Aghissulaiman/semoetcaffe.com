"use client";

import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import {
  formatDateTime,
  formatRupiah,
  FULFILLMENT_LABEL,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
} from "@/lib/format";
import { cn } from "@/lib/cn";

import type { OrderSummary } from "@/types/api";

/** Kartu ringkasan pesanan di daftar riwayat. */
export function OrderCard({ order, className }: { order: OrderSummary; className?: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.push(`/order/${order.id}`)}
      className={cn(
        "flex w-full flex-col gap-2.5 rounded-2xl border border-line bg-surface p-3.5 text-left transition hover:border-primary/40 hover:bg-primary-soft/20 focus-ring",
        className,
      )}>
      <div className="flex items-center gap-2.5">
        {order.thumbnailUrl ? (
          <img
            src={order.thumbnailUrl}
            alt={order.orderNumber}
            className="h-[46px] w-[46px] shrink-0 rounded-xl bg-primary-soft object-cover"
          />
        ) : (
          <div className="h-[46px] w-[46px] shrink-0 rounded-xl bg-primary-soft" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-ink">{order.orderNumber}</p>
          <p className="truncate text-xs text-muted">
            {order.branchName} · {FULFILLMENT_LABEL[order.fulfillmentType] ?? order.fulfillmentType}
          </p>
        </div>
        <Badge
          label={ORDER_STATUS_LABEL[order.orderStatus]}
          tone={ORDER_STATUS_TONE[order.orderStatus]}
          size="sm"
        />
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line pt-2.5">
        <span className="text-xs text-muted">
          {formatDateTime(order.placedAt)} · {order.itemCount} item
        </span>
        <span className="text-[15px] font-extrabold text-primary">{formatRupiah(order.totalIdr)}</span>
      </div>
    </button>
  );
}
