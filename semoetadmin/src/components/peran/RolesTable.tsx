"use client";

import ToneBadge from "@/components/common/ToneBadge";
import { formatDate } from "@/lib/format";
import { tdClass, thClass, trClass } from "@/lib/ui";
import type { Role } from "@/types/api";

/** Kode role bawaan sistem — tidak boleh dihapus. */
const SYSTEM_ROLE_CODES = ["super_admin", "admin", "branch_manager", "staff", "customer"];

interface RolesTableProps {
  roles: Role[];
  onEdit: (role: Role) => void;
  onDelete: (role: Role) => void;
  actionsDisabled?: boolean;
  /** Izinkan tombol Ubah (butuh izin user:update + peran Admin). */
  canEdit?: boolean;
  /** Izinkan tombol Hapus (butuh izin user:delete + peran Admin). */
  canDelete?: boolean;
}

const actionButtonClass =
  "rounded-lg border border-coffee-linen px-3 py-1.5 text-theme-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 dark:border-coffee-night-border";

export default function RolesTable({
  roles,
  onEdit,
  onDelete,
  actionsDisabled,
  canEdit = true,
  canDelete = true,
}: RolesTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead>
          <tr className="border-b border-coffee-linen dark:border-coffee-night-border">
            <th className={`${thClass} text-start`}>Peran</th>
            <th className={`${thClass} text-start`}>Kode</th>
            <th className={`${thClass} text-end`}>Izin</th>
            <th className={`${thClass} text-end`}>Pengguna</th>
            <th className={`${thClass} text-start`}>Dibuat</th>
            <th className={`${thClass} text-end`}>Aksi</th>
          </tr>
        </thead>
        <tbody>
          {roles.map((role) => {
            const isSystem = SYSTEM_ROLE_CODES.includes(role.code);
            return (
              <tr key={role.id} className={trClass}>
                <td className={tdClass}>
                  <span className="flex items-center gap-2 font-medium text-coffee-espresso dark:text-coffee-cream">
                    {role.name}
                    {isSystem && <ToneBadge tone="muted">Sistem</ToneBadge>}
                  </span>
                  {role.description && (
                    <span className="block max-w-md text-theme-xs text-coffee-muted">
                      {role.description}
                    </span>
                  )}
                </td>
                <td className={`${tdClass} font-mono text-theme-xs`}>{role.code}</td>
                <td className={`${tdClass} text-end`}>{role.permissionCount}</td>
                <td className={`${tdClass} text-end`}>{role.userCount}</td>
                <td className={`${tdClass} whitespace-nowrap text-theme-xs`}>
                  {formatDate(role.createdAt)}
                </td>
                <td className={`${tdClass} text-end`}>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => onEdit(role)}
                      disabled={actionsDisabled || !canEdit}
                      title={!canEdit ? "Tidak punya izin mengubah peran" : undefined}
                      className={`${actionButtonClass} text-coffee-dark hover:bg-coffee-milk dark:text-coffee-cream/80 dark:hover:bg-white/5`}
                    >
                      Ubah
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(role)}
                      disabled={actionsDisabled || !canDelete || isSystem || role.userCount > 0}
                      title={
                        !canDelete
                          ? "Tidak punya izin menghapus peran"
                          : isSystem
                            ? "Role sistem tidak dapat dihapus"
                            : role.userCount > 0
                              ? "Masih dipakai anggota"
                              : undefined
                      }
                      className={`${actionButtonClass} text-coffee-danger hover:bg-coffee-danger/10`}
                    >
                      Hapus
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
