import { formatIdr, formatNumber } from "@/lib/format";
import type { TopProduct } from "@/types/api";

interface TopProductsListProps {
  products: TopProduct[];
}

export default function TopProductsList({ products }: TopProductsListProps) {
  const maxRevenue = Math.max(...products.map((p) => p.totalRevenueIdr), 1);

  return (
    <ol className="space-y-4">
      {products.map((product, index) => (
        <li key={product.productId} className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-coffee-milk text-theme-xs font-bold text-coffee-brown dark:bg-white/5 dark:text-coffee-caramel">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <p className="truncate text-theme-sm font-medium text-coffee-espresso dark:text-coffee-cream">
                {product.productName}
              </p>
              <p className="shrink-0 text-theme-sm font-semibold text-coffee-brown dark:text-coffee-caramel">
                {formatIdr(product.totalRevenueIdr)}
              </p>
            </div>
            <div className="mt-1.5 flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-coffee-linen/70 dark:bg-white/5">
                <div
                  className="h-full rounded-full bg-coffee-caramel"
                  style={{
                    width: `${Math.round((product.totalRevenueIdr / maxRevenue) * 100)}%`,
                  }}
                />
              </div>
              <span className="shrink-0 text-theme-xs text-coffee-muted">
                {formatNumber(product.totalQuantity)} terjual
              </span>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
