"use client";

import type { ReactNode } from "react";

import { KasirProvider } from "@/lib/store";

export function Providers({ children }: { children: ReactNode }) {
  return <KasirProvider>{children}</KasirProvider>;
}
