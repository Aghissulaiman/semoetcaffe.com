"use client";

import AppModal from "@/components/common/AppModal";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { EmptyBlock, ErrorBlock, Skeleton } from "@/components/common/DataState";
import ToneBadge from "@/components/common/ToneBadge";
import TableFormModal from "@/components/cabang/TableFormModal";
import { useApi } from "@/hooks/useApi";
import { PencilIcon, PlusIcon, TrashBinIcon } from "@/icons";
import { apiDelete } from "@/lib/client";
import { formatNumber } from "@/lib/format";
import { primaryButtonClass, secondaryButtonClass, tdClass, thClass, trClass } from "@/lib/ui";
import type { BranchArea, BranchTable } from "@/types/api";
import { useState } from "react";

interface RoomTablesModalProps {
  isOpen: boolean;
  branchId: string;
  /** Ruangan yang mejanya dikelola. */
  area: BranchArea | null;
  onClose: () => void;
  /** Dipanggil setiap ada perubahan supaya jumlah meja di kartu ikut segar. */
  onChanged: () => void;
}

/**
 * Kelola meja/kursi di dalam satu ruangan. Ruangan hanya bisa dihapus setelah
 * tidak punya meja, jadi pengelolaannya disediakan langsung dari halaman
 * Ruangan tanpa harus pindah ke menu Cabang.
 */
export default function RoomTablesModal({
  isOpen,
  branchId,
  area,
  onClose,
  onChanged,
}: RoomTablesModalProps) {
  const tables = useApi<BranchTable[]>(
    isOpen && area ? `/branches/${branchId}/tables?areaId=${area.id}&limit=100` : null,
  );
  const [form, setForm] = useState<{ open: boolean; table: BranchTable | null }>({
    open: false,
    table: null,
  });
  const [deleteTarget, setDeleteTarget] = useState<BranchTable | null>(null);
  const [removing, setRemoving] = useState(false);

  const items = tables.data ?? [];
  const loading = tables.loading && !tables.data;
  const totalSeats = items.reduce((total, table) => total + table.capacity, 0);

  const reload = () => {
    tables.reload();
    onChanged();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setRemoving(true);
    try {
      await apiDelete(`/admin/tables/${deleteTarget.id}`);
      setDeleteTarget(null);
      reload();
    } finally {
      setRemoving(false);
    }
  };

  return (
    <AppModal
      isOpen={isOpen}
      onClose={onClose}
      title={area ? `Meja — ${area.name}` : "Kelola Meja"}
      desc="Tambah, ubah, atau hapus meja/kursi. Ruangan baru bisa dihapus setelah tidak punya meja."
      size="lg"
      footer={
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            Tutup
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-theme-xs text-coffee-muted">
            {formatNumber(items.length)} meja · {formatNumber(totalSeats)} kursi
          </p>
          <button
            type="button"
            onClick={() => setForm({ open: true, table: null })}
            className={primaryButtonClass}
          >
            <PlusIcon className="h-4 w-4" /> Tambah Meja
          </button>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : tables.error ? (
          <ErrorBlock message={tables.error} onRetry={tables.reload} />
        ) : items.length === 0 ? (
          <EmptyBlock message="Ruangan ini belum punya meja. Tambahkan meja bila diperlukan, atau langsung hapus ruangannya." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left">
              <thead>
                <tr className="border-b border-coffee-linen dark:border-coffee-night-border">
                  <th className={thClass}>Kode Meja</th>
                  <th className={thClass}>Kapasitas</th>
                  <th className={thClass}>Status</th>
                  <th className={`${thClass} text-end`}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {items.map((table) => (
                  <tr key={table.id} className={trClass}>
                    <td className={`${tdClass} font-semibold`}>{table.tableCode}</td>
                    <td className={tdClass}>{formatNumber(table.capacity)} kursi</td>
                    <td className={tdClass}>
                      <ToneBadge tone={table.isActive ? "success" : "muted"}>
                        {table.isActive ? "Aktif" : "Nonaktif"}
                      </ToneBadge>
                    </td>
                    <td className={`${tdClass} text-end`}>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setForm({ open: true, table })}
                          className="inline-flex items-center gap-1 rounded-md border border-coffee-linen px-2 py-1 text-theme-xs font-semibold text-coffee-dark transition-colors hover:bg-coffee-milk dark:border-coffee-night-border dark:text-coffee-cream/80 dark:hover:bg-white/5"
                        >
                          <PencilIcon className="h-3.5 w-3.5" /> Ubah
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(table)}
                          className="inline-flex items-center gap-1 rounded-md border border-coffee-danger/40 px-2 py-1 text-theme-xs font-semibold text-coffee-danger transition-colors hover:bg-coffee-danger/10"
                        >
                          <TrashBinIcon className="h-3.5 w-3.5" /> Hapus
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Form tambah/ubah meja; `key` mereset isian antar meja. */}
      {form.open && area && (
        <TableFormModal
          key={form.table?.id ?? "baru"}
          isOpen
          areas={[area]}
          table={form.table}
          defaultAreaId={area.id}
          onClose={() => setForm({ open: false, table: null })}
          onSaved={() => {
            setForm({ open: false, table: null });
            reload();
          }}
        />
      )}

      {/* Konfirmasi hapus meja. */}
      {deleteTarget && (
        <ConfirmDialog
          isOpen
          key={deleteTarget.id}
          title="Hapus Meja"
          message={`Yakin menghapus meja “${deleteTarget.tableCode}”? Meja yang masih dipakai reservasi aktif tidak bisa dihapus.`}
          confirmLabel="Hapus"
          onConfirm={handleDelete}
          onClose={() => {
            if (!removing) setDeleteTarget(null);
          }}
        />
      )}
    </AppModal>
  );
}
