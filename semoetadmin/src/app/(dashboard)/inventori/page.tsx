"use client";

import { Skeleton } from "@/components/common/DataState";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

export default function InventoriRedirectPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[420px] w-full" />}>
      <InventoriRedirectHandler />
    </Suspense>
  );
}

function InventoriRedirectHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab");

  useEffect(() => {
    if (tab === "snapshot") {
      router.replace("/inventori/snapshot");
    } else if (tab === "mutasi") {
      router.replace("/inventori/mutasi");
    } else {
      router.replace("/inventori/bahan");
    }
  }, [router, tab]);

  return <Skeleton className="h-[420px] w-full" />;
}
