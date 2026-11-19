"use client";

import { useClickOutside } from "@/hooks/useClickOutside";
import { useSession } from "@/hooks/useSession";
import { ChevronDownIcon } from "@/icons";
import { logout } from "@/lib/auth-client";
import { cn } from "@/utils";
import { useRef, useState } from "react";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { DropdownItem } from "../ui/dropdown/DropdownItem";

function initials(name?: string): string {
  if (!name) return "SA";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "SA";
}

export default function UserDropdown() {
  const { me } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useClickOutside(triggerRef, () => setIsOpen(false));

  const name = me?.user.displayName ?? "Memuat…";
  const email = me?.user.email ?? me?.user.phoneE164 ?? "";
  const roleLabel = me?.roles.map((role) => role.name).join(", ") || "Pengguna";

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="Menu akun"
        className="dropdown-toggle flex items-center gap-2 rounded-lg border border-coffee-linen bg-white py-1.5 pe-2 ps-1.5 transition-colors hover:bg-coffee-milk dark:border-coffee-night-border dark:bg-coffee-night-soft dark:hover:bg-white/5"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-coffee-brown text-theme-xs font-semibold text-coffee-milk dark:bg-coffee-caramel dark:text-coffee-night">
          {initials(me?.user.displayName)}
        </span>
        <span className="hidden text-start sm:block">
          <span className="block max-w-[140px] truncate text-theme-sm font-medium text-coffee-espresso dark:text-coffee-cream">
            {name}
          </span>
          <span className="block text-theme-xs text-coffee-muted">{roleLabel}</span>
        </span>
        <ChevronDownIcon
          className={cn(
            "h-4 w-4 text-coffee-muted transition-transform",
            isOpen && "rotate-180",
          )}
        />
      </button>

      <Dropdown
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        className="w-64 end-0 mt-2 overflow-hidden rounded-xl border-coffee-linen shadow-theme-lg dark:border-coffee-night-border"
      >
        <div className="border-b border-coffee-linen px-4 py-3 dark:border-coffee-night-border">
          <p className="truncate text-sm font-semibold text-coffee-espresso dark:text-coffee-cream">
            {name}
          </p>
          {email && <p className="truncate text-theme-xs text-coffee-muted">{email}</p>}
        </div>
        <div className="py-1">
          <DropdownItem onItemClick={() => setIsOpen(false)}>Profil Saya</DropdownItem>
          <DropdownItem onItemClick={() => setIsOpen(false)}>Pengaturan</DropdownItem>
        </div>
        <div className="border-t border-coffee-linen py-1 dark:border-coffee-night-border">
          <DropdownItem
            onItemClick={() => {
              setIsOpen(false);
              void logout();
            }}
            className="text-coffee-danger hover:bg-coffee-danger/10 hover:text-coffee-danger"
          >
            Keluar
          </DropdownItem>
        </div>
      </Dropdown>
    </div>
  );
}
