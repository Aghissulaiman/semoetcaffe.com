import { EmptyBlock, ErrorBlock, Skeleton } from "@/components/common/DataState";
import { formatRelative } from "@/lib/format";
import { auditActionLabel, auditActionTone, entityTypeLabel, type StatusTone } from "@/lib/labels";
import type { AuditLog } from "@/types/api";
import { cn } from "@/utils";

const toneDot: Record<StatusTone, string> = {
  success: "bg-coffee-success",
  warning: "bg-coffee-warning",
  danger: "bg-coffee-danger",
  coffee: "bg-coffee-brown dark:bg-coffee-caramel",
  muted: "bg-coffee-muted",
};

interface RecentActivityProps {
  logs: AuditLog[] | null;
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
}

export default function RecentActivity({ logs, loading, error, onRetry }: RecentActivityProps) {
  if (loading && !logs) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex items-start gap-3">
            <Skeleton className="mt-1 h-3 w-3 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (error) {
    return <ErrorBlock message={error} onRetry={onRetry} />;
  }
  if (!logs || logs.length === 0) {
    return <EmptyBlock message="Belum ada aktivitas" />;
  }

  return (
    <ol className="relative space-y-5 border-s border-coffee-linen ps-5 dark:border-coffee-night-border">
      {logs.map((log) => (
        <li key={log.id} className="relative">
          <span
            className={cn(
              "absolute -start-[26px] top-1 h-3 w-3 rounded-full ring-4 ring-white dark:ring-coffee-night-soft",
              toneDot[auditActionTone(log.action)],
            )}
          />
          <p className="text-theme-sm font-medium text-coffee-espresso dark:text-coffee-cream">
            {auditActionLabel(log.action)}
          </p>
          <p className="mt-0.5 text-theme-xs text-coffee-muted">
            {log.actorName ?? "Sistem"} · {entityTypeLabel(log.entityType)} ·{" "}
            {formatRelative(log.createdAt)}
          </p>
        </li>
      ))}
    </ol>
  );
}
