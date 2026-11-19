import { Suspense } from "react";

import { Loader } from "@/components/ui/loader";

import ProductDetailScreen from "./product-detail-screen";

export default function ProductDetailPage() {
  return (
    <Suspense fallback={<Loader label="Memuat produk…" />}>
      <ProductDetailScreen />
    </Suspense>
  );
}
