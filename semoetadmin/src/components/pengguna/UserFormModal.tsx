"use client";

import AppModal from "@/components/common/AppModal";
import { ApiError, apiPatch, apiPost } from "@/lib/client";
import { userStatusLabel } from "@/lib/labels";
import {
  fieldLabelClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/lib/ui";
import type { AdminUser, Role } from "@/types/api";
import { cn } from "@/utils";
import { useState } from "react";

const STATUS_OPTIONS = ["active", "pending", "suspended"] as const;

interface UserFormModalProps {
  /** Kosong/undefined berarti mode tambah; ada nilainya berarti mode ubah. */
  user?: AdminUser | null;
  roles: Role[];
  isSelf?: boolean;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Form tambah/ubah anggota. Di-mount ulang per anggota (lihat `key` di
 * pemanggil) supaya state awal selalu mengikuti data terbaru tanpa setState di
 * dalam effect. Mode ubah mengirim perubahan profil, peran, dan status sesuai
 * yang benar-benar berubah.
 */
export default function UserFormModal({
  user,
  roles,
  isSelf = false,
  onClose,
  onSaved,
}: UserFormModalProps) {
  const isEdit = Boolean(user);

  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phoneE164, setPhoneE164] = useState(user?.phoneE164 ?? "");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState(user?.status ?? "active");
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>(
    user ? roles.filter((role) => user.roleCodes.includes(role.code)).map((role) => role.id) : [],
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialRoleIds = user
    ? roles.filter((role) => user.roleCodes.includes(role.code)).map((role) => role.id)
    : [];
  const rolesChanged =
    selectedRoleIds.length !== initialRoleIds.length ||
    selectedRoleIds.some((id) => !initialRoleIds.includes(id));

  const toggleRole = (roleId: string) => {
    setSelectedRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId],
    );
  };

  const statusEditable = !isSelf;

  const handleSave = async () => {
    const name = displayName.trim();
    const trimmedEmail = email.trim();
    const trimmedPhone = phoneE164.trim();

    if (name.length < 2) {
      setError("Nama minimal 2 karakter.");
      return;
    }
    if (!trimmedEmail && !trimmedPhone) {
      setError("Isi minimal salah satu: email atau nomor telepon.");
      return;
    }
    if (!isEdit && password.length < 8) {
      setError("Password minimal 8 karakter.");
      return;
    }
    if (selectedRoleIds.length === 0) {
      setError("Pilih minimal satu peran agar anggota bisa membuka menu admin.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (!isEdit) {
        await apiPost("/admin/users", {
          email: trimmedEmail || null,
          phoneE164: trimmedPhone || null,
          displayName: name,
          password,
          status,
          roleIds: selectedRoleIds,
        });
      } else if (user) {
        const profile: Record<string, unknown> = {};
        if (name !== user.displayName) profile.displayName = name;
        if (trimmedEmail !== (user.email ?? "")) profile.email = trimmedEmail || null;
        if (trimmedPhone !== (user.phoneE164 ?? "")) profile.phoneE164 = trimmedPhone || null;
        if (Object.keys(profile).length > 0) {
          await apiPatch(`/admin/users/${user.id}`, profile);
        }
        if (rolesChanged) {
          await apiPost(`/admin/users/${user.id}/roles`, {
            roleIds: selectedRoleIds,
            replace: true,
          });
        }
        if (statusEditable && status !== user.status) {
          await apiPatch(`/admin/users/${user.id}/status`, { status });
        }
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan data anggota");
      setSaving(false);
    }
  };

  return (
    <AppModal
      isOpen
      onClose={onClose}
      title={isEdit ? "Ubah Anggota" : "Tambah Anggota"}
      desc={isEdit ? user?.email ?? user?.phoneE164 ?? undefined : "Buat akun anggota baru beserta perannya"}
      size="lg"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass} disabled={saving}>
            Batal
          </button>
          <button type="button" onClick={handleSave} className={primaryButtonClass} disabled={saving}>
            {saving ? "Menyimpan…" : isEdit ? "Simpan Perubahan" : "Tambah Anggota"}
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
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className={fieldLabelClass}>Nama Lengkap</span>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="mis. Budi Santoso"
              className={inputClass}
              autoFocus
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={fieldLabelClass}>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nama@contoh.com"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={fieldLabelClass}>Nomor Telepon</span>
            <input
              value={phoneE164}
              onChange={(event) => setPhoneE164(event.target.value)}
              placeholder="+62812xxxxxxx"
              className={inputClass}
            />
          </label>
          {!isEdit && (
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className={fieldLabelClass}>Password Awal</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Minimal 8 karakter, kombinasi huruf besar/kecil & angka"
                className={inputClass}
              />
            </label>
          )}
        </section>

        <section>
          <p className="mb-2 text-theme-sm font-semibold text-coffee-espresso dark:text-coffee-cream">
            Status Akun
          </p>
          {isSelf && (
            <p className="mb-2 text-theme-xs text-coffee-muted">
              Anda tidak dapat mengubah status akun Anda sendiri.
            </p>
          )}
          <div className="grid grid-cols-3 gap-2">
            {STATUS_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                disabled={!statusEditable}
                onClick={() => setStatus(option)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-theme-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  status === option
                    ? "border-coffee-brown bg-coffee-brown text-coffee-milk dark:border-coffee-caramel dark:bg-coffee-caramel dark:text-coffee-night"
                    : "border-coffee-linen text-coffee-dark hover:bg-coffee-milk dark:border-coffee-night-border dark:text-coffee-cream/80 dark:hover:bg-white/5",
                )}
              >
                {userStatusLabel(option)}
              </button>
            ))}
          </div>
        </section>

        <section>
          <p className="mb-1 text-theme-sm font-semibold text-coffee-espresso dark:text-coffee-cream">
            Peran
          </p>
          <p className="mb-3 text-theme-xs text-coffee-muted">
            Peran menentukan menu dan aksi yang bisa dibuka. Atur izin tiap peran di
            menu <span className="font-semibold">Peran &amp; Izin</span>.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {roles.map((role) => {
              const checked = selectedRoleIds.includes(role.id);
              return (
                <label
                  key={role.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
                    checked
                      ? "border-coffee-brown/60 bg-coffee-brown/5 dark:border-coffee-caramel/40"
                      : "border-coffee-linen hover:bg-coffee-milk/60 dark:border-coffee-night-border dark:hover:bg-white/5",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleRole(role.id)}
                    className="mt-1 h-4 w-4 accent-coffee-brown"
                  />
                  <span>
                    <span className="block text-theme-sm font-medium text-coffee-espresso dark:text-coffee-cream">
                      {role.name}
                    </span>
                    <span className="block font-mono text-theme-xs text-coffee-muted">
                      {role.code} · {role.permissionCount} izin
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </section>
      </div>
    </AppModal>
  );
}
