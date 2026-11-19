"use client";

import ToneBadge from "@/components/common/ToneBadge";
import { formatDateTime } from "@/lib/format";
import { auditActionLabel, auditActionTone, entityTypeLabel } from "@/lib/labels";
import { tdClass, thClass, trClass } from "@/lib/ui";
import type { AuditLog } from "@/types/api";

interface AuditLogTableProps {
  logs: AuditLog[];
  onSelect?: (log: AuditLog) => void;
}

export default function AuditLogTable({ logs, onSelect }: AuditLogTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead>
          <tr className="border-b border-coffee-linen dark:border-coffee-night-border">
            <th className={`${thClass} text-start`}>Waktu</th>
            <th className={`${thClass} text-start`}>Aktor</th>
            <th className={`${thClass} text-start`}>Aksi</th>
            <th className={`${thClass} text-start`}>Entitas</th>
            <th className={`${thClass} text-start`}>IP</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr
              key={log.id}
              onClick={() => onSelect?.(log)}
              className={`${trClass} ${onSelect ? "cursor-pointer transition-colors hover:bg-coffee-milk/50 dark:hover:bg-white/5" : ""}`}
            >
              <td className={`${tdClass} whitespace-nowrap`}>{formatDateTime(log.createdAt)}</td>
              <td className={`${tdClass} whitespace-nowrap font-medium text-coffee-espresso dark:text-coffee-cream`}>
                {log.actorName ?? "Sistem"}
              </td>
              <td className={tdClass}>
                <ToneBadge tone={auditActionTone(log.action)}>
                  {auditActionLabel(log.action)}
                </ToneBadge>
              </td>
              <td className={tdClass}>
                <span className="text-coffee-dark dark:text-coffee-cream/80">
                  {entityTypeLabel(log.entityType)}
                </span>
                {log.entityId && (
                  <span className="ms-1 font-mono text-theme-xs text-coffee-muted">
                    {log.entityId.slice(0, 8)}
                  </span>
                )}
              </td>
              <td className={`${tdClass} font-mono text-theme-xs`}>{log.ipAddress ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
