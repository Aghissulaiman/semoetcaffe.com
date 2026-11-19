"use client";

import AreaFormModal from "@/components/cabang/AreaFormModal";
import ComponentCard from "@/components/common/ComponentCard";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { EmptyBlock, ErrorBlock, Skeleton } from "@/components/common/DataState";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
import ToneBadge from "@/components/common/ToneBadge";
import RoomTablesModal from "@/components/reservasi/RoomTablesModal";
import { useApi } from "@/hooks/useApi";
import { CoffeeIcon, PencilIcon, PlusIcon, TableIcon, TrashBinIcon } from "@/icons";
import { apiDelete } from "@/lib/client";
import { formatIdr, formatNumber } from "@/lib/format";
import { areaTypeLabel } from "@/lib/labels";
import { inputClass, primaryButtonClass } from "@/lib/ui";
import type { Branch, BranchArea } from "@/types/api";
import { useState } from "react";

/**
 * Kelola ruangan reservasi (dining area) per cabang: nama, tipe, harga sewa
 * per jam, status, dan gambar yang tampil di app pelanggan saat memilih
 * ruangan. Memakai endpoint admin area yang sama dengan detail Cabang.
 */
export default function RuanganPage() {
  const branches = useApi<Branch[]>("/branches?limit=50");

  /** Cabang terpilih; kosong berarti pakai cabang pertama dari daftar. */
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const branchList = branches.data ?? [];
  const branchId = selectedBranchId || branchList[0]?.id || "";

  const rooms = useApi<BranchArea[]>(branchId ? `/branches/${branchId}/areas` : null);

  const [form, setForm] = useState<{ open: boolean; room: BranchArea | null }>({
    open: false,
    room: null,
  });
  const [deleteTarget, setDeleteTarget] = useState<BranchArea | null>(null);
  /** Ruangan yang daftar mejanya sedang dikelola. */
  const [tableRoom, setTableRoom] = useState<BranchArea | null>(null);
  const [removing, setRemoving] = useState(false);

  const items = rooms.data ?? [];
  const activeCount = items.filter((room) => room.isActive).length;
  const loadingBranches = branches.loading && !branches.data;
  const loadingRooms = rooms.loading && !rooms.data;

  const openAdd = () => setForm({ open: true, room: null });
  const openEdit = (room: BranchArea) => setForm({ open: true, room });

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setRemoving(true);
    try {
      await apiDelete(`/admin/areas/${deleteTarget.id}`);
      setDeleteTarget(null);
      rooms.reload();
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageBreadCrumb
        pageTitle="Ruangan Reservasi"
        items={[{ label: "Reservasi", href: "/reservasi" }, { label: "Ruangan" }]}
      />

      <ComponentCard
        title="Kelola Ruangan"
        desc="Isi data ruangan beserta gambarnya. Ruangan aktif akan muncul sebagai pilihan saat pelanggan membuat reservasi di aplikasi."
        action={
          <button
            type="button"
            onClick={openAdd}
            disabled={!branchId}
            className={primaryButtonClass}
          >
            <PlusIcon className="h-4 w-4" /> Tambah Ruangan
          </button>
        }
      >
        {/* Pilih cabang */}
        <div className="mb-5 max-w-sm">
          <label className="mb-1.5 block text-theme-sm font-medium text-coffee-dark dark:text-coffee-cream/80">
            Cabang
          </label>
          <select
            value={branchId}
            onChange={(event) => setSelectedBranchId(event.target.value)}
            disabled={loadingBranches || branchList.length === 0}
            className={inputClass}
          >
            {branchList.length === 0 && <option value="">Belum ada cabang</option>}
            {branchList.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
                {branch.isActive ? "" : " (nonaktif)"}
              </option>
            ))}
          </select>
        </div>

        {loadingBranches || loadingRooms ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[...Array(3)].map((_, index) => (
              <div key={index} className="overflow-hidden rounded-xl border border-coffee-linen dark:border-coffee-night-border">
                <Skeleton className="h-40 w-full rounded-none" />
                <div className="space-y-2 p-4">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-8 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : branches.error ? (
          <ErrorBlock message={branches.error} onRetry={branches.reload} />
        ) : branchList.length === 0 ? (
          <EmptyBlock message="Belum ada cabang. Tambahkan cabang terlebih dahulu." />
        ) : rooms.error ? (
          <ErrorBlock message={rooms.error} onRetry={rooms.reload} />
        ) : items.length === 0 ? (
          <EmptyBlock message="Belum ada ruangan di cabang ini. Klik “Tambah Ruangan” untuk membuatnya." />
        ) : (
          <>
            <p className="mb-4 text-theme-xs text-coffee-muted">
              {formatNumber(items.length)} ruangan · {formatNumber(activeCount)} aktif
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((room) => (
                <article
                  key={room.id}
                  className="flex flex-col overflow-hidden rounded-xl border border-coffee-linen bg-white dark:border-coffee-night-border dark:bg-coffee-night-soft"
                >
                  <div className="relative h-40 w-full bg-coffee-milk dark:bg-white/5">
                    {room.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={room.imageUrl}
                        alt={`Gambar ruangan ${room.name}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-coffee-muted">
                        <CoffeeIcon className="h-8 w-8" />
                        <span className="text-theme-xs">Belum ada gambar</span>
                      </div>
                    )}
                    <span className="absolute start-3 top-3">
                      <ToneBadge tone={room.isActive ? "success" : "muted"}>
                        {room.isActive ? "Aktif" : "Nonaktif"}
                      </ToneBadge>
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col gap-3 p-4">
                    <div>
                      <h4 className="truncate text-base font-semibold text-coffee-espresso dark:text-coffee-cream">
                        {room.name}
                      </h4>
                      <p className="text-theme-xs text-coffee-muted">
                        {areaTypeLabel(room.areaType)}
                      </p>
                    </div>

                    <div className="flex flex-col gap-1 text-theme-xs text-coffee-muted">
                      <span className="font-semibold text-coffee-dark dark:text-coffee-cream/90">
                        {room.pricePerHourIdr != null
                          ? `${formatIdr(room.pricePerHourIdr)} / jam`
                          : "Harga sewa belum diatur"}
                      </span>
                      <span className="flex items-center gap-1">
                        <TableIcon className="h-3.5 w-3.5" />
                        {formatNumber(room.tableCount)} meja ·{" "}
                        {formatNumber(room.totalCapacity)} kursi
                      </span>
                    </div>

                    <div className="mt-auto grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setTableRoom(room)}
                        title="Kelola meja & kursi di ruangan ini"
                        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-coffee-linen px-2 text-theme-xs font-medium text-coffee-dark transition-colors hover:bg-coffee-milk dark:border-coffee-night-border dark:text-coffee-cream/80 dark:hover:bg-white/5"
                      >
                        <TableIcon className="h-4 w-4" /> Meja
                        {room.tableCount > 0 ? ` (${room.tableCount})` : ""}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(room)}
                        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-coffee-linen px-2 text-theme-xs font-medium text-coffee-dark transition-colors hover:bg-coffee-milk dark:border-coffee-night-border dark:text-coffee-cream/80 dark:hover:bg-white/5"
                      >
                        <PencilIcon className="h-4 w-4" /> Ubah
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(room)}
                        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-coffee-danger/40 px-2 text-theme-xs font-medium text-coffee-danger transition-colors hover:bg-coffee-danger/10"
                      >
                        <TrashBinIcon className="h-4 w-4" /> Hapus
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </ComponentCard>

      {/* Form tambah/ubah ruangan + unggah gambar. `key` mereset isian antar ruangan. */}
      {form.open && branchId && (
        <AreaFormModal
          key={form.room?.id ?? "baru"}
          isOpen
          branchId={branchId}
          area={form.room}
          noun="Ruangan"
          onClose={() => setForm({ open: false, room: null })}
          onSaved={() => {
            setForm({ open: false, room: null });
            rooms.reload();
          }}
        />
      )}

      {/* Kelola meja/kursi per ruangan (agar ruangan bisa dihapus). */}
      {tableRoom && branchId && (
        <RoomTablesModal
          isOpen
          branchId={branchId}
          area={tableRoom}
          onClose={() => setTableRoom(null)}
          onChanged={rooms.reload}
        />
      )}

      {/* Konfirmasi hapus ruangan. */}
      {deleteTarget && (
        <ConfirmDialog
          isOpen
          key={deleteTarget.id}
          title="Hapus Ruangan"
          message={
            deleteTarget.tableCount > 0
              ? `Ruangan “${deleteTarget.name}” masih memiliki ${deleteTarget.tableCount} meja. Hapus mejanya dulu lewat tombol “Meja” di kartu ruangan, lalu hapus ruangannya.`
              : `Yakin menghapus ruangan “${deleteTarget.name}”? Tindakan ini permanen.`
          }
          confirmLabel={deleteTarget.tableCount > 0 ? "Kelola Meja" : "Hapus"}
          tone={deleteTarget.tableCount > 0 ? "neutral" : "danger"}
          onConfirm={
            deleteTarget.tableCount > 0
              ? () => {
                  setTableRoom(deleteTarget);
                  setDeleteTarget(null);
                }
              : handleDelete
          }
          onClose={() => {
            if (!removing) setDeleteTarget(null);
          }}
        />
      )}
    </div>
  );
}
