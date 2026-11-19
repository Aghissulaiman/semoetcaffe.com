"use client";

import ComponentCard from "@/components/common/ComponentCard";
import { ErrorBlock, LoadingBlock } from "@/components/common/DataState";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import SupplierPaymentForm from "@/components/pembelian/SupplierPaymentForm";
import { useApi } from "@/hooks/useApi";
import { formatIdr } from "@/lib/format";
import type { PurchaseOrderDetail } from "@/types/api";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

/** Halaman pencatatan pembayaran supplier (menggantikan pop-up). */
export default function PurchaseOrderPaymentPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? null;
  const { data, loading, error, reload } = useApi<PurchaseOrderDetail>(
    id ? `/admin/purchase-orders/${id}` : null,
  );

  const order = data?.order;
  const canPay =
    Boolean(order) &&
    order!.status !== "draft" &&
    order!.status !== "cancelled" &&
    order!.outstandingIdr > 0;

  return (
    <div className="space-y-6">
      <PageBreadcrumb
        pageTitle="Pembayaran Supplier"
        items={[
          { label: "Pembelian", href: "/pembelian" },
          { label: "Hutang", href: "/pembelian/hutang" },
          { label: "Pembayaran" },
        ]}
      />

      <div>
        <Link
          href={id ? `/pembelian/${id}` : "/pembelian/hutang"}
          className="text-theme-sm font-medium text-coffee-brown hover:underline dark:text-coffee-caramel"
        >
          ← Kembali ke detail PO
        </Link>
      </div>

      {loading && !data && <LoadingBlock />}
      {error && <ErrorBlock message={error} onRetry={reload} />}

      {order && (
        <ComponentCard
          title={`Pembayaran ${order.number}`}
          desc={`${order.supplierName ?? "Supplier"} · Total ${formatIdr(order.totalIdr)} · Sisa hutang ${formatIdr(order.outstandingIdr)}`}
        >
          {canPay ? (
            <SupplierPaymentForm
              order={order}
              onSaved={() => router.push(`/pembelian/${order.id}`)}
            />
          ) : (
            <p className="text-theme-sm text-coffee-muted">
              {order.status === "draft"
                ? "Terbitkan purchase order terlebih dahulu sebelum mencatat pembayaran."
                : order.status === "cancelled"
                  ? "Purchase order ini sudah dibatalkan."
                  : "Purchase order ini sudah lunas, tidak ada sisa hutang."}
            </p>
          )}
        </ComponentCard>
      )}
    </div>
  );
}
