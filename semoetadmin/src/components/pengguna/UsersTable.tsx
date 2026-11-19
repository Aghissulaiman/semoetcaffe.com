"use client";

import ToneBadge from "@/components/common/ToneBadge";
import { formatDateTime, formatIdr, formatNumber } from "@/lib/format";
import { userStatusLabel, userStatusTone } from "@/lib/labels";
import { tdClass, thClass, trClass } from "@/lib/ui";
import type { AdminUser, Role } from "@/types/api";

interface UsersTableProps {
  users: AdminUser[];
  roles: Role[];
  onEdit: (user: AdminUser) => void;
  onDelete: (user: AdminUser) => void;
  onRestore: (user: AdminUser) => void;
  /** Id user yang sedang login (tidak boleh menghapus diri sendiri). */
  selfId?: string;
  actionsDisabled?: boolean;
}

const actionButtonClass =
  "rounded-lg border border-coffee-linen px-3 py-1.5 text-theme-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 dark:border-coffee-night-border";

export default function UsersTable({
  users,
  roles,
  onEdit,
  onDelete,
  onRestore,
  selfId,
  actionsDisabled,
}: UsersTableProps) {
  const roleName = (code: string) => roles.find((role) => role.code === code)?.name ?? code;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead>
          <tr className="border-b border-coffee-linen dark:border-coffee-night-border">
            <th className={`${thClass} text-start`}>Pengguna</th>
            <th className={`${thClass} text-start`}>Peran</th>
            <th className={`${thClass} text-start`}>Status</th>
            <th className={`${thClass} text-end`}>Pesanan</th>
            <th className={`${thClass} text-end`}>Nilai Belanja</th>
            <th className={`${thClass} text-start`}>Terakhir Masuk</th>
            <th className={`${thClass} text-end`}>Aksi</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const deleted = user.status === "deleted";
            const isSelf = user.id === selfId;
            return (
              <tr key={user.id} className={trClass}>
                <td className={tdClass}>
                  <span className="block font-medium text-coffee-espresso dark:text-coffee-cream">
                    {user.displayName}
                  </span>
                  <span className="block text-theme-xs text-coffee-muted">
                    {user.email ?? user.phoneE164 ?? "-"}
                  </span>
                </td>
                <td className={tdClass}>
                  {user.roleCodes.length === 0 ? (
                    <span className="text-coffee-muted">—</span>
                  ) : (
                    <span className="flex flex-wrap gap-1">
                      {user.roleCodes.map((code) => (
                        <ToneBadge key={code} tone="coffee">
                          {roleName(code)}
                        </ToneBadge>
                      ))}
                    </span>
                  )}
                </td>
                <td className={tdClass}>
                  <ToneBadge tone={userStatusTone(user.status)}>
                    {userStatusLabel(user.status)}
                  </ToneBadge>
                </td>
                <td className={`${tdClass} text-end`}>{formatNumber(user.orderCount)}</td>
                <td
                  className={`${tdClass} text-end font-semibold text-coffee-espresso dark:text-coffee-cream`}
                >
                  {formatIdr(user.lifetimeValueIdr)}
                </td>
                <td className={`${tdClass} whitespace-nowrap text-theme-xs`}>
                  {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "-"}
                </td>
                <td className={`${tdClass} text-end`}>
                  <div className="flex justify-end gap-2">
                    {deleted ? (
                      <button
                        type="button"
                        onClick={() => onRestore(user)}
                        disabled={actionsDisabled}
                        className={`${actionButtonClass} text-coffee-success hover:bg-coffee-success/10`}
                      >
                        Pulihkan
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => onEdit(user)}
                          disabled={actionsDisabled}
                          className={`${actionButtonClass} text-coffee-dark hover:bg-coffee-milk dark:text-coffee-cream/80 dark:hover:bg-white/5`}
                        >
                          Ubah
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(user)}
                          disabled={actionsDisabled || isSelf}
                          title={isSelf ? "Tidak dapat menghapus akun sendiri" : undefined}
                          className={`${actionButtonClass} text-coffee-danger hover:bg-coffee-danger/10`}
                        >
                          Hapus
                        </button>
                      </>
                    )}
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
