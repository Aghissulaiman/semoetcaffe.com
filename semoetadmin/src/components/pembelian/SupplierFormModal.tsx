"use client";

import AppModal from "@/components/common/AppModal";
import { ApiError, apiPatch, apiPost } from "@/lib/client";
import {
  fieldLabelClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
  textareaClass,
} from "@/lib/ui";
import type { Supplier } from "@/types/api";
import { useState } from "react";

interface SupplierFormModalProps {
  supplier?: Supplier;
  onClose: () => void;
  onSaved: () => void;
}

interface SupplierFormState {
  code: string;
  name: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  isActive: boolean;
}

/** Form tambah/ubah master supplier. */
export default function SupplierFormModal({ supplier, onClose, onSaved }: SupplierFormModalProps) {
  const editing = Boolean(supplier);
  const [form, setForm] = useState<SupplierFormState>({
    code: supplier?.code ?? "",
    name: supplier?.name ?? "",
    contactName: supplier?.contactName ?? "",
    phone: supplier?.phone ?? "",
    email: supplier?.email ?? "",
    address: supplier?.address ?? "",
    notes: supplier?.notes ?? "",
    isActive: supplier?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setField = <K extends keyof SupplierFormState>(key: K, value: SupplierFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (form.name.trim().length < 2) {
      setError("Nama supplier minimal 2 karakter.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        code: form.code.trim() || undefined,
        name: form.name.trim(),
        contactName: form.contactName.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        address: form.address.trim() || undefined,
        notes: form.notes.trim() || undefined,
        isActive: form.isActive,
      };

      if (editing) {
        await apiPatch(`/admin/suppliers/${supplier!.id}`, {
          ...payload,
          contactName: form.contactName.trim() || null,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          address: form.address.trim() || null,
          notes: form.notes.trim() || null,
        });
      } else {
        await apiPost("/admin/suppliers", payload);
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan supplier");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppModal
      isOpen
      onClose={onClose}
      title={editing ? "Ubah Supplier" : "Tambah Supplier"}
      desc="Data supplier dipakai sebagai relasi saat membuat purchase order."
      size="lg"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass} disabled={saving}>
            Batal
          </button>
          <button
            type="submit"
            form="supplier-form"
            className={primaryButtonClass}
            disabled={saving}
          >
            {saving ? "Menyimpan…" : editing ? "Simpan Perubahan" : "Tambah Supplier"}
          </button>
        </>
      }
    >
      <form id="supplier-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className={fieldLabelClass}>Kode Supplier (opsional)</span>
            <input
              value={form.code}
              onChange={(event) => setField("code", event.target.value.toUpperCase())}
              placeholder="Otomatis, mis. SUP-0001"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={fieldLabelClass}>Nama Supplier *</span>
            <input
              value={form.name}
              onChange={(event) => setField("name", event.target.value)}
              placeholder="mis. SHOPEE"
              className={inputClass}
              required
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={fieldLabelClass}>Nama Kontak</span>
            <input
              value={form.contactName}
              onChange={(event) => setField("contactName", event.target.value)}
              placeholder="mis. Admin Gudang"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={fieldLabelClass}>Telepon</span>
            <input
              value={form.phone}
              onChange={(event) => setField("phone", event.target.value)}
              placeholder="mis. 0812xxxxxxx"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={fieldLabelClass}>Email</span>
            <input
              type="email"
              value={form.email}
              onChange={(event) => setField("email", event.target.value)}
              placeholder="mis. supplier@email.com"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={fieldLabelClass}>Status</span>
            <select
              value={form.isActive ? "true" : "false"}
              onChange={(event) => setField("isActive", event.target.value === "true")}
              className={inputClass}
            >
              <option value="true">Aktif</option>
              <option value="false">Nonaktif</option>
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className={fieldLabelClass}>Alamat</span>
          <textarea
            value={form.address}
            onChange={(event) => setField("address", event.target.value)}
            rows={2}
            placeholder="Alamat supplier"
            className={textareaClass}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className={fieldLabelClass}>Catatan</span>
          <textarea
            value={form.notes}
            onChange={(event) => setField("notes", event.target.value)}
            rows={2}
            placeholder="Catatan internal (opsional)"
            className={textareaClass}
          />
        </label>

        {error && (
          <p className="rounded-lg border border-coffee-danger/30 bg-coffee-danger/5 px-3 py-2 text-theme-sm text-coffee-danger">
            {error}
          </p>
        )}
      </form>
    </AppModal>
  );
}
