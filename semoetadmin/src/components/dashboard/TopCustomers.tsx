import { EmptyBlock, Skeleton } from "@/components/common/DataState";
import { formatIdr, formatNumber } from "@/lib/format";
import type { AdminUser } from "@/types/api";
import { cn } from "@/utils";

interface TopCustomersProps {
  users: AdminUser[] | null;
  loading: boolean;
  limit?: number;
}

/**
 * Pelanggan dengan nilai belanja (lifetime value) tertinggi.
 * Mengambil dari daftar user lalu mengurutkan di sisi klien.
 */
export default function TopCustomers({ users, loading, limit = 5 }: TopCustomersProps) {
  if (loading && !users) {
    return (
      <div className="space-y-4">
        {Array.from({ length: limit }).map((_, index) => (
          <div key={index} className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const ranked = [...(users ?? [])]
    .filter((user) => user.orderCount > 0)
    .sort((a, b) => b.lifetimeValueIdr - a.lifetimeValueIdr)
    .slice(0, limit);

  if (ranked.length === 0) {
    return <EmptyBlock message="Belum ada data pelanggan" />;
  }

  return (
    <ul className="space-y-4">
      {ranked.map((user, index) => (
        <li key={user.id} className="flex items-center gap-3">
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-theme-xs font-semibold text-coffee-milk",
              index === 0
                ? "bg-coffee-gold text-coffee-night"
                : "bg-coffee-brown dark:bg-coffee-caramel dark:text-coffee-night",
            )}
          >
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-theme-sm font-medium text-coffee-espresso dark:text-coffee-cream">
              {user.displayName}
            </p>
            <p className="truncate text-theme-xs text-coffee-muted">
              {user.email ?? user.phoneE164 ?? "-"} · {formatNumber(user.orderCount)} pesanan
            </p>
          </div>
          <p className="shrink-0 text-theme-sm font-semibold text-coffee-brown dark:text-coffee-caramel">
            {formatIdr(user.lifetimeValueIdr)}
          </p>
        </li>
      ))}
    </ul>
  );
}
