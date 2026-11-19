import { Suspense } from "react";

import { Loader } from "@/components/ui/loader";

import OrderDetailScreen from "./order-detail-screen";

export default function OrderDetailPage() {
  return (
    <Suspense fallback={<Loader label="Memuat pesanan…" />}>
      <OrderDetailScreen />
    </Suspense>
  );
}
