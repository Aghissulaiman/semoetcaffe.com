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

  const permissionsReady = Boolean(permissions.data);

  // Backend membatasi kelola peran ke peran Admin/Super Admin.
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
        desc="Kelompok hak akses beserta jumlah izin & pengguna"
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

      <ComponentCard
        title="Katalog Izin"
        desc={`${formatNumber(permissions.data?.length)} izin tersedia dalam format resource:action`}
      >
        {permissions.loading && !permissions.data ? (
          <Skeleton className="h-[320px] w-full" />
        ) : permissions.error ? (
          <ErrorBlock message={permissions.error} onRetry={permissions.reload} />
        ) : (permissions.data?.length ?? 0) === 0 ? (
          <EmptyBlock message="Belum ada izin" />
        ) : (
          <PermissionCatalog permissions={permissions.data!} />
        )}
      </ComponentCard>

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
