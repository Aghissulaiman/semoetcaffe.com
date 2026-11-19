"use client";

import AppModal from "@/components/common/AppModal";
import { ApiError, apiPatch, apiPost } from "@/lib/client";
import { fieldLabelClass, inputClass, primaryButtonClass, secondaryButtonClass } from "@/lib/ui";
import type { BranchArea, BranchTable } from "@/types/api";
import { useState } from "react";

interface TableFormModalProps {
  isOpen: boolean;
  /** Daftar area (untuk dropdown) pada cabang terkait. */
  areas: BranchArea[];
  /** Meja yang diubah; `null` berarti tambah meja baru. */
  table: BranchTable | null;
  /** Area terpilih default saat menambah meja (mis. dari area yang diklik). */
  defaultAreaId?: string | null;
  onClose: () => void;
  onSaved: () => void;
}

/** Modal tambah/ubah meja pada sebuah area. */
export default function TableFormModal({
  isOpen,
  areas,
  table,
  defaultAreaId,
  onClose,
  onSaved,
}: TableFormModalProps) {
  const editing = Boolean(table);
  const [areaId, setAreaId] = useState(table?.areaId ?? defaultAreaId ?? areas[0]?.id ?? "");
  const [tableCode, setTableCode] = useState(table?.tableCode ?? "");
  const [capacity, setCapacity] = useState(table?.capacity ?? 4);
  const [isActive, setIsActive] = useState(table?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!editing && !areaId) {
      setError("Pilih area dulu.");
      return;
    }
    if (tableCode.trim().length === 0) {
      setError("Kode meja wajib diisi.");
      return;
    }
    setSaving(true);
    try {
      if (editing && table) {
        await apiPatch(`/admin/tables/${table.id}`, {
          tableCode: tableCode.trim(),
          capacity,
          isActive,
        });
      } else {
        await apiPost("/admin/tables", {
          areaId,
          tableCode: tableCode.trim(),
          capacity,
          isActive,
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan meja");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppModal
      isOpen={isOpen}
      onClose={() => {
        if (!saving) onClose();
      }}
      title={editing ? "Ubah Meja" : "Tambah Meja"}
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className={secondaryButtonClass}>
            Batal
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving}
            className={primaryButtonClass}
          >
            {saving ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <label className="flex flex-col gap-1">
          <span className={fieldLabelClass}>Area</span>
          <select
            value={areaId}
            onChange={(event) => setAreaId(event.target.value)}
            disabled={editing}
            className={inputClass}
          >
            {areas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </select>
          {editing && (
            <span className="text-theme-xs text-coffee-muted">
              Area tidak bisa dipindah. Hapus meja lalu buat di area lain bila perlu.
            </span>
          )}
        </label>

        <label className="flex flex-col gap-1">
          <span className={fieldLabelClass}>Kode Meja</span>
          <input
            value={tableCode}
            onChange={(event) => setTableCode(event.target.value.toUpperCase())}
            placeholder="mis. IN-01, OUT-03"
            className={inputClass}
            maxLength={40}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className={fieldLabelClass}>Kapasitas (orang)</span>
          <input
            type="number"
            min={1}
            max={100}
            value={capacity}
            onChange={(event) => setCapacity(Number(event.target.value) || 1)}
            className={inputClass}
          />
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
          />
          <span className="text-theme-sm text-coffee-dark dark:text-coffee-cream/80">Aktif</span>
        </label>

        {error && <p className="text-theme-sm text-coffee-danger">{error}</p>}
      </div>
    </AppModal>
  );
}
