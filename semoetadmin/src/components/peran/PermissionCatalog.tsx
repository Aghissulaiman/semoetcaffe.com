"use client";

import ToneBadge from "@/components/common/ToneBadge";
import { formatNumber } from "@/lib/format";
import { permissionResourceLabel } from "@/lib/labels";
import type { Permission } from "@/types/api";
import { cn } from "@/utils";
import { useMemo, useState } from "react";

interface PermissionCatalogProps {
  permissions: Permission[];
}

export default function PermissionCatalog({ permissions }: PermissionCatalogProps) {
  const [activeResource, setActiveResource] = useState<string>("all");

  const resources = useMemo(() => {
    const map = new Map<string, number>();
    for (const permission of permissions) {
      map.set(permission.resource, (map.get(permission.resource) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [permissions]);

  const visible = useMemo(
    () =>
      activeResource === "all"
        ? permissions
        : permissions.filter((permission) => permission.resource === activeResource),
    [permissions, activeResource],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, Permission[]>();
    for (const permission of visible) {
      const list = map.get(permission.resource) ?? [];
      list.push(permission);
      map.set(permission.resource, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [visible]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveResource("all")}
          className={cn(
            "rounded-full border px-3 py-1 text-theme-xs font-medium transition-colors",
            activeResource === "all"
              ? "border-coffee-brown bg-coffee-brown text-coffee-milk dark:border-coffee-caramel dark:bg-coffee-caramel dark:text-coffee-night"
              : "border-coffee-linen text-coffee-dark hover:bg-coffee-milk dark:border-coffee-night-border dark:text-coffee-cream/80 dark:hover:bg-white/5",
          )}
        >
          Semua ({formatNumber(permissions.length)})
        </button>
        {resources.map(([resource, count]) => (
          <button
            key={resource}
            type="button"
            onClick={() => setActiveResource(resource)}
            className={cn(
              "rounded-full border px-3 py-1 text-theme-xs font-medium transition-colors",
              activeResource === resource
                ? "border-coffee-brown bg-coffee-brown text-coffee-milk dark:border-coffee-caramel dark:bg-coffee-caramel dark:text-coffee-night"
                : "border-coffee-linen text-coffee-dark hover:bg-coffee-milk dark:border-coffee-night-border dark:text-coffee-cream/80 dark:hover:bg-white/5",
            )}
          >
            {permissionResourceLabel(resource)} ({count})
          </button>
        ))}
      </div>

      <div className="space-y-5">
        {grouped.map(([resource, items]) => (
          <div key={resource}>
            <h4 className="mb-2 text-theme-sm font-semibold text-coffee-espresso dark:text-coffee-cream">
              {permissionResourceLabel(resource)}
            </h4>
            <div className="flex flex-wrap gap-2">
              {items.map((permission) => (
                <ToneBadge key={permission.id} tone="coffee">
                  <span className="font-mono">{permission.key}</span>
                  <span className="ms-1.5 text-coffee-muted">{permission.roleCount} peran</span>
                </ToneBadge>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
