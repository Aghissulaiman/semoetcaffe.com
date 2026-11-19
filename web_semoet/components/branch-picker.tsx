"use client";

/**
 * Pemilih cabang tujuan untuk keranjang.
 *
 * Status buka/tutup tiap cabang ikut ditampilkan supaya pelanggan bisa pindah
 * ke cabang yang sedang buka ketika cabang pilihannya tutup.
 */
import { Store } from "lucide-react";
import { useEffect, useState } from "react";

import { Chip } from "@/components/ui/chip";
import { listBranches } from "@/services/branch.service";
import { getStoreStatus } from "@/services/store.service";
import { useCartStore } from "@/store/cart-store";

import type { Branch } from "@/types/api";

interface BranchPickerProps {
  className?: string;
}

export function BranchPicker({ className }: BranchPickerProps) {
  const branchId = useCartStore((state) => state.branchId);
  const branchName = useCartStore((state) => state.branchName);
  const setBranch = useCartStore((state) => state.setBranch);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [openById, setOpenById] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;

    listBranches()
      .then((result) => {
        if (cancelled) return;
        setBranches(result);
        const current = useCartStore.getState();
        if (!current.branchId && result[0]) {
          setBranch(result[0].id, result[0].name);
        }
      })
      .catch(() => {
        if (!cancelled) setBranches([]);
      });

    return () => {
      cancelled = true;
    };
  }, [setBranch]);

  useEffect(() => {
    if (branches.length === 0) return;

    let cancelled = false;

    async function loadStatuses() {
      const entries = await Promise.all(
        branches.map(async (branch) => {
          try {
            const status = await getStoreStatus(branch.id);
            return [branch.id, status.isOpen] as const;
          } catch {
            return null;
          }
        }),
      );

      if (cancelled) return;
      const next: Record<string, boolean> = {};
      for (const entry of entries) {
        if (entry) next[entry[0]] = entry[1];
      }
      setOpenById(next);
    }

    void loadStatuses();
    const timer = setInterval(() => void loadStatuses(), 30_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [branches]);

  if (branches.length === 0) return null;

  const selectedBranch = branches.find((branch) => branch.id === branchId) ?? null;

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <Store size={16} className="text-primary" />
        <p className="text-[13px] font-extrabold text-ink">Cabang tujuan</p>
      </div>
      <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto pb-0.5">
        {branches.map((branch) => {
          const isOpen = openById[branch.id];
          return (
            <Chip
              key={branch.id}
              label={`${branch.name}${
                isOpen === undefined ? "" : isOpen ? " · Buka" : " · Tutup"
              }`}
              active={branch.id === branchId}
              onClick={() => setBranch(branch.id, branch.name)}
            />
          );
        })}
      </div>
      {branchName ? (
        <p className="mt-2 text-xs text-muted">{selectedBranch?.address ?? ""}</p>
      ) : null}
    </div>
  );
}
