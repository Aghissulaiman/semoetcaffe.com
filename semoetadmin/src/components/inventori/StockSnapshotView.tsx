import ToneBadge from "@/components/common/ToneBadge";
import { formatNumber } from "@/lib/format";
import { tdClass, thClass, trClass } from "@/lib/ui";
import type { StockSnapshot } from "@/types/api";

interface StockSnapshotViewProps {
  snapshot: StockSnapshot;
}

export default function StockSnapshotView({ snapshot }: StockSnapshotViewProps) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Tile label="Jumlah Bahan" value={formatNumber(snapshot.summary.ingredientCount)} />
        <Tile label="Lokasi Stok" value={formatNumber(snapshot.summary.locationCount)} />
        <Tile
          label="Stok Menipis"
          value={formatNumber(snapshot.summary.lowStockCount)}
          danger={snapshot.summary.lowStockCount > 0}
        />
      </div>

      {snapshot.items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-coffee-linen px-4 py-8 text-center text-theme-sm text-coffee-muted dark:border-coffee-night-border">
          Belum ada bahan pada lokasi ini
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-coffee-linen dark:border-coffee-night-border">
                <th className={`${thClass} text-start`}>Bahan</th>
                <th className={`${thClass} text-end`}>Total</th>
                <th className={`${thClass} text-end`}>Batas</th>
                <th className={`${thClass} text-start`}>Per Lokasi</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.items.map((item) => (
                <tr key={item.ingredientId} className={trClass}>
                  <td className={tdClass}>
                    <span className="block font-medium text-coffee-espresso dark:text-coffee-cream">
                      {item.name}
                    </span>
                    <span className="block font-mono text-theme-xs text-coffee-muted">
                      {item.sku}
                    </span>
                  </td>
                  <td
                    className={`${tdClass} text-end font-semibold ${
                      item.lowStock ? "text-coffee-danger" : "text-coffee-espresso dark:text-coffee-cream"
                    }`}
                  >
                    {formatNumber(item.onHand)} {item.baseUnit}
                    {item.lowStock && (
                      <span className="ms-2 inline-block align-middle">
                        <ToneBadge tone="danger">Menipis</ToneBadge>
                      </span>
                    )}
                  </td>
                  <td className={`${tdClass} text-end`}>{formatNumber(item.reorderLevel)}</td>
                  <td className={tdClass}>
                    {item.byLocation.length === 0 ? (
                      <span className="text-coffee-muted">—</span>
                    ) : (
                      <span className="flex flex-wrap gap-1.5">
                        {item.byLocation.map((location) => (
                          <span
                            key={location.stockLocationId}
                            className="inline-flex items-center rounded-lg border border-coffee-linen px-2 py-0.5 text-theme-xs dark:border-coffee-night-border"
                          >
                            {location.stockLocationName}:{" "}
                            <span className="ms-1 font-semibold text-coffee-brown dark:text-coffee-caramel">
                              {formatNumber(location.onHand)}
                            </span>
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-2xl border border-coffee-linen bg-white p-5 dark:border-coffee-night-border dark:bg-coffee-night-soft">
      <p className="text-theme-sm text-coffee-muted">{label}</p>
      <p
        className={`mt-2 text-xl font-bold ${
          danger ? "text-coffee-danger" : "text-coffee-espresso dark:text-coffee-cream"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
