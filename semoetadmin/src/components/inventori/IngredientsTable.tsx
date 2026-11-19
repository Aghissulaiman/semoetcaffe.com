import ToneBadge from "@/components/common/ToneBadge";
import { formatDateTime, formatNumber } from "@/lib/format";
import { tdClass, thClass, trClass } from "@/lib/ui";
import type { Ingredient } from "@/types/api";

interface IngredientsTableProps {
  ingredients: Ingredient[];
  onEdit?: (ingredient: Ingredient) => void;
  onDelete?: (ingredient: Ingredient) => void;
}

const actionButtonClass =
  "rounded-lg border border-coffee-linen px-3 py-1.5 text-theme-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 dark:border-coffee-night-border";

export default function IngredientsTable({
  ingredients,
  onEdit,
  onDelete,
}: IngredientsTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead>
          <tr className="border-b border-coffee-linen dark:border-coffee-night-border">
            <th className={`${thClass} text-start`}>SKU</th>
            <th className={`${thClass} text-start`}>Nama Bahan</th>
            <th className={`${thClass} text-start`}>Satuan</th>
            <th className={`${thClass} text-end`}>Stok</th>
            <th className={`${thClass} text-end`}>Batas Restock</th>
            <th className={`${thClass} text-start`}>Status</th>
            <th className={`${thClass} text-start`}>Pergerakan Terakhir</th>
            <th className={`${thClass} text-start`}>Aksi</th>
          </tr>
        </thead>
        <tbody>
          {ingredients.map((ingredient) => {
            const onHand = ingredient.onHand;
            const lowStock =
              onHand !== null && onHand <= ingredient.reorderLevel;
            return (
              <tr key={ingredient.id} className={trClass}>
                <td className={`${tdClass} font-mono text-theme-xs`}>{ingredient.sku}</td>
                <td className={`${tdClass} font-medium text-coffee-espresso dark:text-coffee-cream`}>
                  {ingredient.name}
                </td>
                <td className={tdClass}>{ingredient.baseUnit}</td>
                <td
                  className={`${tdClass} text-end font-semibold ${
                    lowStock ? "text-coffee-danger" : "text-coffee-espresso dark:text-coffee-cream"
                  }`}
                >
                  {onHand === null ? "—" : formatNumber(onHand)}
                </td>
                <td className={`${tdClass} text-end`}>{formatNumber(ingredient.reorderLevel)}</td>
                <td className={tdClass}>
                  {!ingredient.isActive ? (
                    <ToneBadge tone="muted">Nonaktif</ToneBadge>
                  ) : lowStock ? (
                    <ToneBadge tone="danger">Stok Menipis</ToneBadge>
                  ) : (
                    <ToneBadge tone="success">Aman</ToneBadge>
                  )}
                </td>
                <td className={`${tdClass} whitespace-nowrap text-theme-xs`}>
                  {ingredient.lastMovementAt ? formatDateTime(ingredient.lastMovementAt) : "-"}
                </td>
                <td className={`${tdClass} text-start`}>
                  {(onEdit || onDelete) && (
                    <div className="flex items-center gap-2">
                      {onEdit && (
                        <button
                          type="button"
                          onClick={() => onEdit(ingredient)}
                          className={`${actionButtonClass} text-coffee-dark hover:bg-coffee-milk dark:text-coffee-cream/80 dark:hover:bg-white/5`}
                        >
                          Ubah
                        </button>
                      )}
                      {onDelete && (
                        <button
                          type="button"
                          onClick={() => onDelete(ingredient)}
                          className={`${actionButtonClass} text-coffee-danger hover:bg-coffee-danger/10`}
                        >
                          Hapus
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
