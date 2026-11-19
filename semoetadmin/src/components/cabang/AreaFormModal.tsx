"use client";

import AppModal from "@/components/common/AppModal";
import AreaImagePicker from "@/components/cabang/AreaImagePicker";
import { ApiError, apiPatch, apiPost } from "@/lib/client";
import { areaTypeLabel } from "@/lib/labels";
import { fieldLabelClass, inputClass, primaryButtonClass, secondaryButtonClass } from "@/lib/ui";
import type { BranchArea } from "@/types/api";
import { useState } from "react";

const AREA_TYPES = ["indoor", "outdoor", "private_room", "other"] as const;

interface AreaFormModalProps {
  isOpen: boolean;
  branchId: string;
  /** Area yang diubah; `null` berarti tambah area baru. */
  area: BranchArea | null;
  /** Istilah yang tampil di UI, default "Area" (mis. "Ruangan"). */
  noun?: string;
  onClose: () => void;
  /** Dipanggil setelah simpan berhasil supaya daftar dimuat ulang. */
  onSaved: () => void;
}

/** Modal tambah/ubah area tempat duduk, termasuk unggah gambar area. */
export default function AreaFormModal({
  isOpen,
  branchId,
  area,
  noun = "Area",
  onClose,
  onSaved,
}: AreaFormModalProps) {
  const editing = Boolean(area);
  const [name, setName] = useState(area?.name ?? "");
  const [areaType, setAreaType] = useState<string>(area?.areaType ?? "indoor");
  const [pricePerHour, setPricePerHour] = useState(
    area?.pricePerHourIdr != null ? String(area.pricePerHourIdr) : "",
  );
  const [isActive, setIsActive] = useState(area?.isActive ?? true);
  const [imageUrl, setImageUrl] = useState<string | null>(area?.imageUrl ?? null);
  const [imageStorageKey, setImageStorageKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (name.trim().length === 0) {
      setError("Nama area wajib diisi.");
      return;
    }
    const price = pricePerHour.trim() === "" ? null : Number(pricePerHour);
    if (price != null && (!Number.isFinite(price) || price < 0)) {
      setError("Harga sewa per jam tidak valid.");
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        areaType,
        pricePerHourIdr: price,
        isActive,
      };
      // Sertakan field gambar hanya bila berubah (agar tidak menghapus tanpa sengaja).
      if (imageUrl !== (area?.imageUrl ?? null) || imageStorageKey !== null) {
        body.imageUrl = imageUrl;
        body.imageStorageKey = imageStorageKey;
      }

      if (editing && area) {
        await apiPatch(`/admin/areas/${area.id}`, body);
      } else {
        await apiPost(`/admin/branches/${branchId}/areas`, body);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan area");
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
      title={`${editing ? "Ubah" : "Tambah"} ${noun}`}
      desc={`${noun} yang bisa dipesan pelanggan (Indoor, Outdoor, Private Room) beserta gambarnya.`}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className={secondaryButtonClass}
          >
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
          <span className={fieldLabelClass}>Nama {noun}</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="mis. Indoor, Outdoor, Private Room"
            className={inputClass}
            maxLength={80}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className={fieldLabelClass}>Tipe Area</span>
          <select
            value={areaType}
            onChange={(event) => setAreaType(event.target.value)}
            className={inputClass}
          >
            {AREA_TYPES.map((type) => (
              <option key={type} value={type}>
                {areaTypeLabel(type)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className={fieldLabelClass}>Harga Sewa per Jam (Rp)</span>
          <input
            type="number"
            min={0}
            value={pricePerHour}
            onChange={(event) => setPricePerHour(event.target.value)}
            placeholder="mis. 100000"
            className={inputClass}
          />
          <span className="text-theme-xs text-coffee-muted">
            Dipakai untuk menghitung total sewa & DP reservasi ruangan.
          </span>
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
          />
          <span className="text-theme-sm text-coffee-dark dark:text-coffee-cream/80">
            Aktif (tampil sebagai pilihan di app pelanggan)
          </span>
        </label>

        <AreaImagePicker
          imageUrl={imageUrl}
          disabled={saving}
          noun={noun}
          onUploaded={(image) => {
            setImageUrl(image.publicUrl);
            setImageStorageKey(image.storageKey);
          }}
          onRemove={() => {
            setImageUrl(null);
            setImageStorageKey(null);
          }}
        />

        {error && <p className="text-theme-sm text-coffee-danger">{error}</p>}
      </div>
    </AppModal>
  );
}
