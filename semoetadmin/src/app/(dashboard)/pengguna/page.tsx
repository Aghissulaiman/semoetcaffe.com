"use client";

import ComponentCard from "@/components/common/ComponentCard";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { EmptyBlock, ErrorBlock, Skeleton } from "@/components/common/DataState";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import Pagination from "@/components/common/Pagination";
import UserFormModal from "@/components/pengguna/UserFormModal";
import UsersTable from "@/components/pengguna/UsersTable";
import { useApi } from "@/hooks/useApi";
import { useSession } from "@/hooks/useSession";
import { hasPermission } from "@/lib/access";
import { apiPatch, buildQuery } from "@/lib/client";
import { formatNumber } from "@/lib/format";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "@/lib/ui";
import type { AdminUser, Role } from "@/types/api";
import { useState } from "react";

const LIMIT = 20;

type FormState = { open: boolean; user: AdminUser | null };

export default function PenggunaPage() {
  const { me } = useSession();
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<FormState>({ open: false, user: null });
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<AdminUser | null>(null);
  const [draft, setDraft] = useState({ q: "", status: "", roleCode: "" });
  const [applied, setApplied] = useState({ q: "", status: "", roleCode: "" });

  const roles = useApi<Role[]>("/admin/roles?limit=100");
  const users = useApi<AdminUser[]>(
    `/admin/users${buildQuery({
      page,
      limit: LIMIT,
      q: applied.q,
      status: applied.status,
      roleCode: applied.roleCode,
    })}`,
  );

  const meta = users.meta;
  const rolesReady = Boolean(roles.data);

  // Backend membatasi tambah/ubah anggota ke peran Admin/Super Admin.
  const isAdmin = Boolean(
    me?.roles.some((role) => role.code === "admin" || role.code === "super_admin"),
  );
  const canCreate = isAdmin && hasPermission(me?.permissions, "user:create");
  const canUpdate = isAdmin && hasPermission(me?.permissions, "user:update");

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await apiPatch(`/admin/users/${deleteTarget.id}/status`, {
      status: "deleted",
      reason: "Dihapus dari panel admin",
    });
    setDeleteTarget(null);
    users.reload();
  };

  const handleRestore = async () => {
    if (!restoreTarget) return;
    await apiPatch(`/admin/users/${restoreTarget.id}/status`, { status: "active" });
    setRestoreTarget(null);
    users.reload();
  };

  return (
    <div className="space-y-6">
      <PageBreadcrumb pageTitle="Pengguna" items={[{ label: "Pengguna" }]} />

      <form
        onSubmit={(event) => {
          event.preventDefault();
          setApplied(draft);
          setPage(1);
        }}
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-coffee-linen bg-white p-4 dark:border-coffee-night-border dark:bg-coffee-night-soft"
      >
        <label className="flex min-w-[220px] flex-1 flex-col gap-1">
          <span className="text-theme-xs font-medium text-coffee-muted">Cari</span>
          <input
            value={draft.q}
            onChange={(event) => setDraft((prev) => ({ ...prev, q: event.target.value }))}
            placeholder="Nama, email, atau telepon"
            className={inputClass}
          />
        </label>
        <label className="flex min-w-[160px] flex-col gap-1">
          <span className="text-theme-xs font-medium text-coffee-muted">Status</span>
          <select
            value={draft.status}
            onChange={(event) => setDraft((prev) => ({ ...prev, status: event.target.value }))}
            className={inputClass}
          >
            <option value="">Semua</option>
            <option value="active">Aktif</option>
            <option value="pending">Menunggu Verifikasi</option>
            <option value="suspended">Ditangguhkan</option>
            <option value="deleted">Dihapus</option>
          </select>
        </label>
        <label className="flex min-w-[180px] flex-col gap-1">
          <span className="text-theme-xs font-medium text-coffee-muted">Peran</span>
          <select
            value={draft.roleCode}
            onChange={(event) => setDraft((prev) => ({ ...prev, roleCode: event.target.value }))}
            className={inputClass}
          >
            <option value="">Semua</option>
            {(roles.data ?? []).map((role) => (
              <option key={role.id} value={role.code}>
                {role.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={primaryButtonClass}>
          Terapkan
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft({ q: "", status: "", roleCode: "" });
            setApplied({ q: "", status: "", roleCode: "" });
            setPage(1);
          }}
          className={secondaryButtonClass}
        >
          Reset
        </button>
      </form>

      <ComponentCard
        title="Daftar Pengguna"
        desc={`${formatNumber(meta?.total ?? users.data?.length ?? 0)} pengguna terdaftar`}
        action={
          <button
            type="button"
            onClick={() => setForm({ open: true, user: null })}
            disabled={!rolesReady || !canCreate}
            title={!canCreate ? "Hanya Admin/Super Admin dengan izin user:create" : undefined}
            className={primaryButtonClass}
          >
            + Tambah Anggota
          </button>
        }
      >
        {users.loading && !users.data ? (
          <Skeleton className="h-[420px] w-full" />
        ) : users.error ? (
          <ErrorBlock message={users.error} onRetry={users.reload} />
        ) : (users.data?.length ?? 0) === 0 ? (
          <EmptyBlock message="Tidak ada pengguna yang cocok" />
        ) : (
          <div className="space-y-4">
            <UsersTable
              users={users.data!}
              roles={roles.data ?? []}
              selfId={me?.user.id}
              onEdit={(user) => setForm({ open: true, user })}
              onDelete={setDeleteTarget}
              onRestore={setRestoreTarget}
              actionsDisabled={!rolesReady || !canUpdate}
            />
            <Pagination
              page={meta?.page ?? page}
              totalPages={meta?.totalPages ?? 1}
              total={meta?.total}
              unit="pengguna"
              onPageChange={setPage}
            />
          </div>
        )}
      </ComponentCard>

      {form.open && rolesReady && (
        <UserFormModal
          key={form.user?.id ?? "new"}
          user={form.user}
          roles={roles.data!}
          isSelf={form.user?.id === me?.user.id}
          onClose={() => setForm({ open: false, user: null })}
          onSaved={() => {
            setForm({ open: false, user: null });
            users.reload();
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          isOpen
          key={deleteTarget.id}
          title="Hapus Anggota"
          message={`Hapus ${deleteTarget.displayName}? Akun akan dinonaktifkan (soft delete) dan dapat dipulihkan kembali.`}
          confirmLabel="Hapus"
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      {restoreTarget && (
        <ConfirmDialog
          isOpen
          key={restoreTarget.id}
          title="Pulihkan Anggota"
          message={`Pulihkan ${restoreTarget.displayName}? Status akan kembali aktif.`}
          confirmLabel="Pulihkan"
          tone="neutral"
          onConfirm={handleRestore}
          onClose={() => setRestoreTarget(null)}
        />
      )}
    </div>
  );
}
