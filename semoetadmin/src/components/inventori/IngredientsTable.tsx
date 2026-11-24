import { formatNumber } from "@/lib/format";
import { tdClass, thClass, trClass } from "@/lib/ui";
import type { Ingredient } from "@/types/api";

interface IngredientsTableProps {
  ingredients: Ingredient[];
  onEdit?: (ingredient: Ingredient) => void;
  onDelete?: (ingredient: Ingredient) => void;
}

const actionButtonClass =
  "rounded-lg border border-coffee-linen px-3 py-1.5 text-theme-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 dark:border-coffee-night-border";

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0);
}

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
            <th className={`${thClass} text-start`}>No</th>
            <th className={`${thClass} text-start`}>Item Ingredients</th>
            <th className={`${thClass} text-start`}>Supplier Utama</th>
            <th className={`${thClass} text-start`}>Kontak Supplier</th>
            <th className={`${thClass} text-start`}>Link</th>
            <th className={`${thClass} text-end`}>Purchase Price</th>
            <th className={`${thClass} text-end`}>Purchase Qty</th>
            <th className={`${thClass} text-start`}>UoM</th>
            <th className={`${thClass} text-end`}>Yield</th>
            <th className={`${thClass} text-end`}>Unit Cost</th>
            <th className={`${thClass} text-start`}>Aksi</th>
          </tr>
        </thead>
        <tbody>
          {ingredients.map((ingredient, idx) => (
            <tr key={ingredient.id} className={trClass}>
              <td className={tdClass}>{idx + 1}</td>
              <td className={`${tdClass} font-medium text-coffee-espresso dark:text-coffee-cream`}>
                {ingredient.name}
                <div className="text-theme-xs text-coffee-muted font-mono">{ingredient.sku}</div>
                <div className="text-theme-xs text-coffee-muted">Dibuat: {ingredient.createdByName ?? "—"}</div>
                <div className="text-theme-xs text-coffee-muted">Diubah: {ingredient.updatedByName ?? "—"}</div>
              </td>
              <td className={tdClass}>{ingredient.supplierName || "—"}</td>
              <td className={tdClass}>{ingredient.supplierContact || "—"}</td>
              <td className={tdClass}>
                {ingredient.purchaseLink ? (
                  <a href={ingredient.purchaseLink} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                    Link
                  </a>
                ) : (
                  "—"
                )}
              </td>
              <td className={`${tdClass} text-end`}>{ingredient.lastPurchasePriceIdr ? formatRupiah(ingredient.lastPurchasePriceIdr) : "—"}</td>
              <td className={`${tdClass} text-end`}>{ingredient.lastPurchaseQty ? formatNumber(ingredient.lastPurchaseQty) : "—"}</td>
              <td className={tdClass}>{ingredient.lastPurchaseUom || ingredient.baseUnit || "—"}</td>
              <td className={`${tdClass} text-end`}>{ingredient.lastYieldAmount ? formatNumber(ingredient.lastYieldAmount) : "—"}</td>
              <td className={`${tdClass} text-end font-semibold`}>{ingredient.lastUnitCostIdr ? formatRupiah(ingredient.lastUnitCostIdr) : "—"}</td>
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
          ))}
        </tbody>
      </table>
    </div>
  );
}
