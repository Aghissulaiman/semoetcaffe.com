"use client";

import AppModal from "@/components/common/AppModal";
import { ErrorBlock, Skeleton } from "@/components/common/DataState";
import { useApi } from "@/hooks/useApi";
import { hasPermission, MENU_GROUPS } from "@/lib/access";
import { ApiError, apiPatch, apiPost } from "@/lib/client";
import { permissionResourceLabel } from "@/lib/labels";
import {
  fieldLabelClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
  textareaClass,
} from "@/lib/ui";
import type { Permission, Role } from "@/types/api";
import { cn } from "@/utils";
import { useMemo, useState } from "react";

interface RoleFormModalProps {
  /** Kosong/undefined berarti mode tambah; ada nilainya berarti mode ubah. */
  role?: Role | null;
  permissions: Permission[];
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Form tambah/ubah peran. Mode ubah memuat dulu daftar izin role lewat
 * `GET /admin/roles/:id`, lalu menyerahkan ke `RoleForm` yang menginisialisasi
 * state dari props (tanpa setState di dalam effect).
 */
export default function RoleFormModal({ role, permissions, onClose, onSaved }: RoleFormModalProps) {
  if (!role) return <RoleForm permissions={permissions} onClose={onClose} onSaved={onSaved} />;
  return <RoleEditLoader role={role} permissions={permissions} onClose={onClose} onSaved={onSaved} />;
}

function RoleEditLoader({ role, permissions, onClose, onSaved }: RoleFormModalProps & { role: Role }) {
  const detail = useApi<Role>(`/admin/roles/${role.id}`);

  if (detail.error) {
    return (
      <AppModal isOpen onClose={onClose} title="Ubah Peran">
        <ErrorBlock message={detail.error} onRetry={detail.reload} />
      </AppModal>
    );
  }
  if (!detail.data) {
    return (
      <AppModal isOpen onClose={onClose} title="Ubah Peran">
        <Skeleton className="h-64 w-full" />
      </AppModal>
    );
  }
  return (
    <RoleForm role={detail.data} permissions={permissions} onClose={onClose} onSaved={onSaved} />
  );
}

interface RoleFormProps {
  role?: Role | null;
  permissions: Permission[];
  onClose: () => void;
  onSaved: () => void;
}

function RoleForm({ role, permissions, onClose, onSaved }: RoleFormProps) {
  const isEdit = Boolean(role);
  const [code, setCode] = useState(role?.code ?? "");
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [selectedKeys, setSelectedKeys] = useState<string[]>(role?.permissions ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const [showPreview, setShowPreview] = useState(false);
  const search = query.trim().toLowerCase();

  const grouped = useMemo(() => {
    const map = new Map<string, Permission[]>();
    for (const permission of permissions) {
      if (search) {
        const haystack = [
          permission.key,
          permission.resource,
          permission.action,
          permissionResourceLabel(permission.resource),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(search)) continue;
      }
      const list = map.get(permission.resource) ?? [];
      list.push(permission);
      map.set(permission.resource, list);
    }
    return [...map.entries()]
      .map(([resource, items]) => [
        resource,
        [...items].sort((a, b) => a.action.localeCompare(b.action)),
      ] as const)
      .sort((a, b) => a[0].localeCompare(b[0]));
  }, [permissions, search]);

  const allowedMenuPreview = useMemo(() => {
    const lines: string[] = [];
    for (const group of MENU_GROUPS) {
      for (const item of group.items) {
        const entries = item.children?.length ? item.children : [item];
        for (const entry of entries) {
          if (hasPermission(selectedKeys, entry.permission)) {
            const label = item.children?.length ? `${item.label} › ${entry.label}` : item.label;
            lines.push(label);
          }
        }
      }
    }
    return lines;
  }, [selectedKeys]);

  const toggleKey = (key: string) => {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key],
    );
  };

  const toggleResource = (items: Permission[]) => {
    const keys = items.map((item) => item.key);
    const allSelected = keys.every((key) => selectedKeys.includes(key));
    setSelectedKeys((prev) =>
      allSelected
        ? prev.filter((key) => !keys.includes(key))
        : [...new Set([...prev, ...keys])],
    );
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      setError("Nama peran minimal 2 karakter.");
      return;
    }
    if (!isEdit && !/^[a-z0-9_]{2,60}$/.test(code.trim())) {
      setError("Kode peran harus lowercase, angka, atau underscore (2–60 karakter).");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: trimmedName,
        description: description.trim() || null,
        permissionKeys: selectedKeys,
      };
      if (isEdit && role) {
        await apiPatch(`/admin/roles/${role.id}`, payload);
      } else {
        await apiPost("/admin/roles", { code: code.trim(), ...payload });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan peran");
      setSaving(false);
    }
  };

  return (
    <AppModal
      isOpen
      onClose={onClose}
      title={isEdit ? "Ubah Peran" : "Tambah Peran"}
      desc={isEdit ? `Kode: ${role?.code}` : "Kelompokkan izin akses untuk sebuah peran"}
      size="lg"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass} disabled={saving}>
            Batal
          </button>
          <button type="button" onClick={handleSave} className={primaryButtonClass} disabled={saving}>
            {saving ? "Menyimpan…" : isEdit ? "Simpan Perubahan" : "Tambah Peran"}
          </button>
        </>
      }
    >
      <div className="space-y-6">
        {error && (
          <div className="rounded-xl border border-coffee-danger/30 bg-coffee-danger/5 px-4 py-3 text-theme-sm text-coffee-danger">
            {error}
          </div>
        )}

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className={fieldLabelClass}>Kode</span>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="mis. kasir"
              disabled={isEdit}
              className={`${inputClass} font-mono disabled:opacity-60`}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={fieldLabelClass}>Nama</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="mis. Kasir"
              className={inputClass}
              autoFocus
            />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className={fieldLabelClass}>Deskripsi</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              placeholder="Penjelasan singkat peran ini"
              className={textareaClass}
            />
          </label>
        </section>

        <section className="rounded-xl border border-coffee-linen dark:border-coffee-night-border">
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
          >
            <span className="text-theme-sm font-semibold text-coffee-espresso dark:text-coffee-cream">
              Pratinjau Menu ({allowedMenuPreview.length})
            </span>
            <span className="text-theme-xs text-coffee-muted">{showPreview ? "Sembunyikan" : "Tampilkan"}</span>
          </button>
          {showPreview && (
            <div className="border-t border-coffee-linen px-3 py-2.5 dark:border-coffee-night-border">
              {allowedMenuPreview.length === 0 ? (
                <p className="text-theme-xs text-coffee-muted">Belum ada menu yang bisa diakses dengan izin terpilih.</p>
              ) : (
                <ul className="list-disc space-y-1 pl-5 text-theme-sm text-coffee-espresso dark:text-coffee-cream">
                  {allowedMenuPreview.map((label) => (
                    <li key={label}>{label}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <p className="px-3 pb-3 text-theme-xs text-coffee-muted">
            Pengelolaan <span className="font-semibold">Pengguna</span> dan <span className="font-semibold">Peran &amp; Izin</span> hanya untuk Admin/Super Admin.
          </p>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-theme-sm font-semibold text-coffee-espresso dark:text-coffee-cream">
              Izin Akses
            </p>
            <span className="text-theme-xs text-coffee-muted">
              {selectedKeys.length} izin dipilih
            </span>
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari izin (mis. menu, read, reservasi)"
              className={`${inputClass} min-w-48 flex-1`}
            />
            <button
              type="button"
              onClick={() => setSelectedKeys(permissions.map((permission) => permission.key))}
              className="rounded-lg border border-coffee-linen px-2.5 py-1 text-theme-xs font-semibold text-coffee-dark transition-colors hover:bg-coffee-milk dark:border-coffee-night-border dark:text-coffee-cream/80 dark:hover:bg-white/5"
            >
              Pilih semua
            </button>
            <button
              type="button"
              onClick={() => setSelectedKeys([])}
              className="rounded-lg border border-coffee-linen px-2.5 py-1 text-theme-xs font-semibold text-coffee-dark transition-colors hover:bg-coffee-milk dark:border-coffee-night-border dark:text-coffee-cream/80 dark:hover:bg-white/5"
            >
              Kosongkan
            </button>
          </div>
          {grouped.length === 0 && (
            <p className="rounded-xl border border-coffee-linen px-3 py-4 text-center text-theme-sm text-coffee-muted dark:border-coffee-night-border">
              Tidak ada izin yang cocok dengan pencarian.
            </p>
          )}
          <div className="space-y-4">
            {grouped.map(([resource, items]) => {
              const keys = items.map((item) => item.key);
              const selectedCount = keys.filter((key) => selectedKeys.includes(key)).length;
              const allSelected = selectedCount === keys.length;
              return (
                <div
                  key={resource}
                  className="rounded-xl border border-coffee-linen p-3 dark:border-coffee-night-border"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-theme-sm font-medium text-coffee-espresso dark:text-coffee-cream">
                      {permissionResourceLabel(resource)}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleResource(items)}
                      className="rounded-lg border border-coffee-linen px-2.5 py-1 text-theme-xs font-semibold text-coffee-dark transition-colors hover:bg-coffee-milk dark:border-coffee-night-border dark:text-coffee-cream/80 dark:hover:bg-white/5"
                    >
                      {allSelected ? "Kosongkan" : "Pilih semua"}
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {items.map((permission) => {
                      const checked = selectedKeys.includes(permission.key);
                      return (
                        <button
                          key={permission.id}
                          type="button"
                          onClick={() => toggleKey(permission.key)}
                          className={cn(
                            "rounded-full border px-3 py-1 font-mono text-theme-xs transition-colors",
                            checked
                              ? "border-coffee-brown bg-coffee-brown text-coffee-milk dark:border-coffee-caramel dark:bg-coffee-caramel dark:text-coffee-night"
                              : "border-coffee-linen text-coffee-dark hover:bg-coffee-milk dark:border-coffee-night-border dark:text-coffee-cream/80 dark:hover:bg-white/5",
                          )}
                        >
                          {permission.action}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </AppModal>
  );
}
