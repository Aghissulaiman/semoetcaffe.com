import ToneBadge from "@/components/common/ToneBadge";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { movementTypeLabel, movementTypeTone } from "@/lib/labels";
import { tdClass, thClass, trClass } from "@/lib/ui";
import type { StockMovement } from "@/types/api";

interface StockMovementsTableProps {
  movements: StockMovement[];
}

export default function StockMovementsTable({ movements }: StockMovementsTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead>
          <tr className="border-b border-coffee-linen dark:border-coffee-night-border">
            <th className={`${thClass} text-start`}>Tanggal</th>
            <th className={`${thClass} text-start`}>Bahan</th>
            <th className={`${thClass} text-start`}>Lokasi</th>
            <th className={`${thClass} text-start`}>Jenis</th>
            <th className={`${thClass} text-end`}>Perubahan</th>
            <th className={`${thClass} text-end`}>Saldo</th>
            <th className={`${thClass} text-start`}>Oleh</th>
            <th className={`${thClass} text-start`}>Dicatat</th>
          </tr>
        </thead>
        <tbody>
          {movements.map((movement) => (
            <tr key={movement.id} className={trClass}>
              <td className={`${tdClass} whitespace-nowrap text-theme-xs font-medium`}>
                {formatDate(movement.movementDate ?? movement.createdAt)}
              </td>
              <td className={tdClass}>
                <span className="block font-medium text-coffee-espresso dark:text-coffee-cream">
                  {movement.ingredientName ?? "-"}
                </span>
                <span className="block font-mono text-theme-xs text-coffee-muted">
                  {movement.ingredientSku ?? "-"}
                </span>
              </td>
              <td className={tdClass}>
                {movement.stockLocationName ?? "-"}
              </td>
              <td className={tdClass}>
                <ToneBadge tone={movementTypeTone(movement.movementType)}>
                  {movementTypeLabel(movement.movementType)}
                </ToneBadge>
                {movement.notes && (
                  <span className="mt-1 block max-w-[220px] text-theme-xs text-coffee-muted">
                    {movement.notes}
                  </span>
                )}
              </td>
              <td
                className={`${tdClass} text-end font-semibold ${
                  movement.quantityDelta < 0 ? "text-coffee-danger" : "text-coffee-success"
                }`}
              >
                {movement.quantityDelta > 0 ? "+" : ""}
                {formatNumber(movement.quantityDelta)}
                {movement.baseUnit ? ` ${movement.baseUnit}` : ""}
              </td>
              <td className={`${tdClass} text-end`}>{formatNumber(movement.balanceAfter)}</td>
              <td className={`${tdClass} text-theme-xs`}>{movement.createdByName ?? "Sistem"}</td>
              <td className={`${tdClass} whitespace-nowrap text-theme-xs text-coffee-muted`}>
                {formatDateTime(movement.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
