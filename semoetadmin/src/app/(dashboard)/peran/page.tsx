"use client";

import ComponentCard from "@/components/common/ComponentCard";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { EmptyBlock, ErrorBlock, Skeleton } from "@/components/common/DataState";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import PermissionCatalog from "@/components/peran/PermissionCatalog";
import RoleFormModal from "@/components/peran/RoleFormModal";
import RolesTable from "@/components/peran/RolesTable";
import { useApi } from "@/hooks/useApi";
import { useSession } from "@/hooks/useSession";
import { hasPermission } from "@/lib/access";
import { apiDelete } from "@/lib/client";
import { formatNumber } from "@/lib/format";
import { primaryButtonClass } from "@/lib/ui";
import type { Permission, Role } from "@/types/api";
import { useState } from "react";

type FormState = { open: boolean; role: Role | null };

export default function PeranPage() {
  const { me } = useSession();
  const roles = useApi<Role[]>("/admin/roles?limit=100");
  const permissions = useApi<Permission[]>("/admin/permissions");

  const [form, setForm] = useState<FormState>({ open: false, role: null });
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);
  const [showCatalog, setShowCatalog] = useState(false);

  const permissionsReady = Boolean(permissions.data);

  const isAdmin = Boolean(
    me?.roles.some((role) => role.code === "admin" || role.code === "super_admin"),
  );
  const canCreate = isAdmin && hasPermission(me?.permissions, "user:create");
  const canUpdate = isAdmin && hasPermission(me?.permissions, "user:update");
  const canDelete = isAdmin && hasPermission(me?.permissions, "user:delete");

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await apiDelete(`/admin/roles/${deleteTarget.id}`);
    setDeleteTarget(null);
    roles.reload();
  };

  return (
    <div className="space-y-6">
      <PageBreadcrumb pageTitle="Peran & Izin" items={[{ label: "Peran & Izin" }]} />

      <ComponentCard
        title="Peran"
        desc="Kelola peran dan izin akses"
        action={
          <button
            type="button"
            onClick={() => setForm({ open: true, role: null })}
            disabled={!permissionsReady || !canCreate}
            title={!canCreate ? "Hanya Admin/Super Admin dengan izin user:create" : undefined}
            className={primaryButtonClass}
          >
            + Tambah Peran
          </button>
        }
      >
        {roles.loading && !roles.data ? (
          <Skeleton className="h-[280px] w-full" />
        ) : roles.error ? (
          <ErrorBlock message={roles.error} onRetry={roles.reload} />
        ) : (roles.data?.length ?? 0) === 0 ? (
          <EmptyBlock message="Belum ada peran" />
        ) : (
          <RolesTable
            roles={roles.data!}
            actionsDisabled={!permissionsReady}
            canEdit={canUpdate}
            canDelete={canDelete}
            onEdit={(role) => setForm({ open: true, role })}
            onDelete={setDeleteTarget}
          />
        )}
      </ComponentCard>

      <div className="rounded-2xl border border-coffee-linen bg-white dark:border-coffee-night-border dark:bg-coffee-night-soft">
        <button
          type="button"
          onClick={() => setShowCatalog((v) => !v)}
          className="flex w-full items-center justify-between gap-2 px-5 py-4 text-left"
        >
          <div>
            <p className="text-theme-sm font-semibold text-coffee-espresso dark:text-coffee-cream">Daftar Izin</p>
            <p className="text-theme-xs text-coffee-muted">{formatNumber(permissions.data?.length ?? 0)} izin tersedia</p>
          </div>
          <span className="text-theme-xs text-coffee-muted">{showCatalog ? "Sembunyikan" : "Tampilkan"}</span>
        </button>
        {showCatalog && (
          <div className="border-t border-coffee-linen px-5 pb-5 pt-4 dark:border-coffee-night-border">
            {permissions.loading && !permissions.data ? (
              <Skeleton className="h-[320px] w-full" />
            ) : permissions.error ? (
              <ErrorBlock message={permissions.error} onRetry={permissions.reload} />
            ) : (permissions.data?.length ?? 0) === 0 ? (
              <EmptyBlock message="Belum ada izin" />
            ) : (
              <PermissionCatalog permissions={permissions.data!} />
            )}
          </div>
        )}
      </div>

      {form.open && permissionsReady && (
        <RoleFormModal
          key={form.role?.id ?? "new"}
          role={form.role}
          permissions={permissions.data!}
          onClose={() => setForm({ open: false, role: null })}
          onSaved={() => {
            setForm({ open: false, role: null });
            roles.reload();
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          isOpen
          key={deleteTarget.id}
          title="Hapus Peran"
          message={`Hapus peran "${deleteTarget.name}" (${deleteTarget.code})? Tindakan ini permanen.`}
          confirmLabel="Hapus"
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
