"use client";

import AppModal from "@/components/common/AppModal";
import { EmptyBlock, ErrorBlock, Skeleton } from "@/components/common/DataState";
import IngredientPicker from "@/components/common/IngredientPicker";
import ToneBadge from "@/components/common/ToneBadge";
import ProductImagePicker from "@/components/katalog/ProductImagePicker";
import { useAllIngredients } from "@/hooks/useAllIngredients";
import { useApi } from "@/hooks/useApi";
import { ApiError, apiDelete, apiPatch, apiPost, apiPut } from "@/lib/client";
import { formatIdr } from "@/lib/format";
import { productKindLabel } from "@/lib/labels";
import {
  fieldLabelClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
  textareaClass,
} from "@/lib/ui";
import type {
  AdminProduct,
  AdminProductVariants,
  AdminVariant,
  PreparationStation,
  Product,
  ProductCategory,
  RecipeItem,
  UploadedImage,
} from "@/types/api";
import { cn } from "@/utils";
import { useMemo, useState } from "react";

const PRODUCT_KINDS = [
  "coffee",
  "drink",
  "food",
  "snack",
  "dessert",
  "bundle",
  "buffet",
  "event",
  "standard",
  "other",
];

/** Penomoran baris varian pada form (hindari Date.now()/random agar render murni). */
let rowCounter = 0;
function newRowKey(): string {
  rowCounter += 1;
  return `v${rowCounter}`;
}

interface VariantRow {
  key: string;
  /** Ada bila varian sudah tersimpan di server (mode ubah). */
  id?: string;
  name: string;
  sku: string;
  priceIdr: string;
  costIdr: string;
  compareAtPriceIdr: string;
  isDefault: boolean;
  isActive: boolean;
}

function rowFromVariant(variant: AdminVariant): VariantRow {
  return {
    key: newRowKey(),
    id: variant.id,
    name: variant.name,
    sku: variant.sku ?? "",
    priceIdr: String(variant.priceIdr),
    costIdr: String(variant.costIdr),
    compareAtPriceIdr: variant.compareAtPriceIdr != null ? String(variant.compareAtPriceIdr) : "",
    isDefault: variant.isDefault,
    isActive: variant.isActive,
  };
}

function blankRow(isDefault: boolean): VariantRow {
  return {
    key: newRowKey(),
    name: "Regular",
    sku: "",
    priceIdr: "",
    costIdr: "",
    compareAtPriceIdr: "",
    isDefault,
    isActive: true,
  };
}

/** Baris bahan pada draft resep per varian. */
interface RecipeDraft {
  ingredientId: string;
  quantityInBaseUnit: string;
  expectedWastePercent: string;
}

function blankRecipeDraft(): RecipeDraft {
  return { ingredientId: "", quantityInBaseUnit: "", expectedWastePercent: "0" };
}

function recipeDraftFromItem(item: RecipeItem): RecipeDraft {
  return {
    ingredientId: item.ingredientId,
    quantityInBaseUnit: item.quantityInBaseUnit != null ? String(item.quantityInBaseUnit) : "",
    expectedWastePercent: item.expectedWastePercent != null ? String(item.expectedWastePercent) : "0",
  };
}

function initialRows(existingVariants: AdminVariant[] | undefined): VariantRow[] {
  return existingVariants && existingVariants.length > 0
    ? existingVariants.map(rowFromVariant)
    : [blankRow(true)];
}

function buildRecipeDrafts(
  rows: VariantRow[],
  recipesByVariant: Record<string, RecipeItem[]> | undefined,
): Record<string, RecipeDraft[]> {
  const drafts: Record<string, RecipeDraft[]> = {};
  for (const row of rows) {
    const items = row.id ? recipesByVariant?.[row.id] ?? [] : [];
    drafts[row.key] = items.length > 0 ? items.map(recipeDraftFromItem) : [blankRecipeDraft()];
  }
  return drafts;
}

/** Ubah teks menjadi integer rupiah (min 0). */
function toIdr(value: string): number {
  return Math.max(0, Math.round(Number(value) || 0));
}

function toOptionalIdr(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return Math.max(0, Math.round(Number(trimmed) || 0));
}

interface ProductFormModalProps {
  /** Kosong/undefined berarti mode tambah; ada nilainya berarti mode ubah. */
  product?: Product | null;
  categories: ProductCategory[];
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Form tambah/ubah produk beserta variannya. Mode ubah memuat varian (termasuk
 * HPP) lebih dulu, lalu menyerahkan ke `ProductForm` yang menginisialisasi state
 * dari props sehingga tidak perlu setState di dalam effect.
 */
export default function ProductFormModal({
  product,
  categories,
  onClose,
  onSaved,
}: ProductFormModalProps) {
  if (!product) {
    return <ProductForm categories={categories} onClose={onClose} onSaved={onSaved} />;
  }
  return (
    <ProductEditLoader
      product={product}
      categories={categories}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

function ProductEditLoader({
  product,
  categories,
  onClose,
  onSaved,
}: ProductFormModalProps & { product: Product }) {
  const variants = useApi<AdminProductVariants>(`/admin/products/${product.id}/variants`);
  const recipes = useApi<RecipeItem[]>("/admin/recipes");
  const recipesByVariant = useMemo(() => {
    const map: Record<string, RecipeItem[]> = {};
    for (const item of recipes.data ?? []) {
      if (!item.productVariantId) continue;
      map[item.productVariantId] = [...(map[item.productVariantId] ?? []), item];
    }
    return map;
  }, [recipes.data]);

  if (variants.error) {
    return (
      <AppModal isOpen onClose={onClose} title="Ubah Produk">
        <ErrorBlock message={variants.error} onRetry={variants.reload} />
      </AppModal>
    );
  }
  if (!variants.data) {
    return (
      <AppModal isOpen onClose={onClose} title="Ubah Produk">
        <Skeleton className="h-64 w-full" />
      </AppModal>
    );
  }
  return (
    <ProductForm
      product={product}
      existingVariants={variants.data.variants}
      initialRecipesByVariant={recipesByVariant}
      categories={categories}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

interface ProductFormProps {
  product?: Product | null;
  existingVariants?: AdminVariant[];
  initialRecipesByVariant?: Record<string, RecipeItem[]>;
  categories: ProductCategory[];
  onClose: () => void;
  onSaved: () => void;
}

function ProductForm({
  product,
  existingVariants,
  initialRecipesByVariant,
  categories,
  onClose,
  onSaved,
}: ProductFormProps) {
  const isEdit = Boolean(product);

  const [name, setName] = useState(product?.name ?? "");
  const [categoryOptions, setCategoryOptions] = useState<ProductCategory[]>(categories);
  const [categoryId, setCategoryId] = useState(() =>
    product ? (product.category?.id ?? "") : (categories[0]?.id ?? ""),
  );
  const [quickCategoryOpen, setQuickCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategorySlug, setNewCategorySlug] = useState("");
  const [newCategoryParentId, setNewCategoryParentId] = useState("");
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [productKind, setProductKind] = useState(product?.productKind ?? "standard");
  const [preparationStation, setPreparationStation] = useState<string>(
    product?.preparationStation ?? "kitchen",
  );
  const [description, setDescription] = useState(product?.descriptionShort ?? "");
  const [isActive, setIsActive] = useState(product?.isActive ?? true);
  const [isFeatured, setIsFeatured] = useState(product?.isFeatured ?? false);
  const [rows, setRows] = useState<VariantRow[]>(() => initialRows(existingVariants));
  const [recipeDrafts, setRecipeDrafts] = useState<Record<string, RecipeDraft[]>>(() => {
    const initial = initialRows(existingVariants);
    return buildRecipeDrafts(initial, initialRecipesByVariant);
  });

  const [image, setImage] = useState<UploadedImage | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(product?.imageUrl ?? null);
  const [imageCleared, setImageCleared] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ingredients = useAllIngredients();
  const stationsApi = useApi<PreparationStation[]>("/admin/preparation-stations");

  const handleImageUploaded = (uploaded: UploadedImage) => {
    setImage(uploaded);
    setImageUrl(uploaded.publicUrl);
    setImageCleared(false);
  };

  const handleImageRemove = () => {
    setImage(null);
    setImageUrl(null);
    setImageCleared(true);
  };

  /** Field gambar yang dikirim ke backend: pasang, hapus, atau tidak berubah. */
  const imagePayload = (): Record<string, string | null> => {
    if (image) return { imageStorageKey: image.storageKey, imagePublicUrl: image.publicUrl };
    if (imageCleared) return { imageStorageKey: null, imagePublicUrl: null };
    return {};
  };

  const updateRow = (key: string, patch: Partial<VariantRow>) => {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const setDefaultRow = (key: string) => {
    setRows((prev) => prev.map((row) => ({ ...row, isDefault: row.key === key })));
  };

  const addRow = () => {
    setRows((prev) => [...prev, blankRow(prev.length === 0)]);
  };

  const removeRow = (key: string) => {
    setRows((prev) => {
      const next = prev.filter((row) => row.key !== key);
      if (next.length > 0 && !next.some((row) => row.isDefault)) {
        next[0] = { ...next[0], isDefault: true };
      }
      return next;
    });
  };

  const updateRecipeDraft = (rowKey: string, index: number, patch: Partial<RecipeDraft>) => {
    setRecipeDrafts((prev) => {
      const list = prev[rowKey] ?? [blankRecipeDraft()];
      const next = list.map((draft, draftIndex) => (draftIndex === index ? { ...draft, ...patch } : draft));
      return { ...prev, [rowKey]: next };
    });
  };

  const addRecipeDraft = (rowKey: string) => {
    setRecipeDrafts((prev) => ({
      ...prev,
      [rowKey]: [...(prev[rowKey] ?? [blankRecipeDraft()]), blankRecipeDraft()],
    }));
  };

  const removeRecipeDraft = (rowKey: string, index: number) => {
    setRecipeDrafts((prev) => {
      const list = (prev[rowKey] ?? [blankRecipeDraft()]).filter((_, draftIndex) => draftIndex !== index);
      return { ...prev, [rowKey]: list.length > 0 ? list : [blankRecipeDraft()] };
    });
  };

  /** Bentuk payload recipe dari draft (hanya bahan yang valid yang ikut). */
  const collectRecipeItems = (drafts: RecipeDraft[]) =>
    drafts
      .filter((draft) => draft.ingredientId)
      .map((draft) => ({
        ingredientId: draft.ingredientId,
        quantityInBaseUnit: Number(draft.quantityInBaseUnit),
        expectedWastePercent: Number(draft.expectedWastePercent) || 0,
      }))
      .filter((item) => Number.isFinite(item.quantityInBaseUnit) && item.quantityInBaseUnit > 0);

  const saveRecipeForVariant = async (productVariantId: string, drafts: RecipeDraft[]): Promise<void> => {
    const items = collectRecipeItems(drafts);
    if (items.length === 0) return;
    await apiPut("/admin/recipes", {
      productVariantId,
      ingredients: items,
    });
  };

  /** Tambah kategori langsung dari form produk, lalu pilih otomatis. */
  const handleCreateCategory = async () => {
    if (newCategoryName.trim().length < 2) {
      setCategoryError("Nama kategori minimal 2 karakter.");
      return;
    }

    setCategorySaving(true);
    setCategoryError(null);
    try {
      const body: Record<string, unknown> = {
        name: newCategoryName.trim(),
        parentId: newCategoryParentId || null,
      };
      if (newCategorySlug.trim()) body.slug = newCategorySlug.trim();

      const result = await apiPost<ProductCategory>("/admin/categories", body);
      const created = result.data;
      const parent = categoryOptions.find((item) => item.id === newCategoryParentId);
      setCategoryOptions((prev) => [
        ...prev,
        { ...created, depth: parent ? (parent.depth ?? 0) + 1 : 0 },
      ]);
      setCategoryId(created.id);
      setQuickCategoryOpen(false);
      setNewCategoryName("");
      setNewCategorySlug("");
      setNewCategoryParentId("");
    } catch (err) {
      setCategoryError(err instanceof ApiError ? err.message : "Gagal menambah kategori");
    } finally {
      setCategorySaving(false);
    }
  };

  const buildVariantPayload = (row: VariantRow) => ({
    name: row.name.trim(),
    sku: row.sku.trim() || null,
    priceIdr: toIdr(row.priceIdr),
    costIdr: toIdr(row.costIdr),
    compareAtPriceIdr: toOptionalIdr(row.compareAtPriceIdr),
    isActive: row.isActive,
  });

  const validate = (): string | null => {
    if (name.trim().length < 2) return "Nama produk minimal 2 karakter.";
    if (!categoryId) return "Pilih kategori produk.";
    if (rows.length === 0) return "Tambahkan minimal satu varian.";
    for (const row of rows) {
      if (!row.name.trim()) return "Nama varian wajib diisi.";
      if (!row.priceIdr.trim()) return `Isi harga jual untuk varian ${row.name || "tersebut"}.`;
      const compareAt = toOptionalIdr(row.compareAtPriceIdr);
      if (compareAt != null && compareAt < toIdr(row.priceIdr)) {
        return `Harga sebelum diskon varian ${row.name} tidak boleh lebih kecil dari harga jual.`;
      }
    }
    const names = rows.map((row) => row.name.trim().toLowerCase());
    if (new Set(names).size !== names.length) return "Nama varian tidak boleh kembar.";

    for (const row of rows) {
      const items = collectRecipeItems(recipeDrafts[row.key] ?? [blankRecipeDraft()]);
      for (const item of items) {
        if (!Number.isFinite(item.quantityInBaseUnit) || item.quantityInBaseUnit <= 0) {
          return `Kuantitas bahan untuk varian ${row.name} harus lebih dari 0.`;
        }
        if (item.expectedWastePercent < 0 || item.expectedWastePercent > 100) {
          return `Estimasi waste untuk varian ${row.name} harus berada di antara 0 dan 100.`;
        }
      }
    }
    return null;
  };

  const handleSave = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const desiredDefaultKey = (rows.find((row) => row.isDefault) ?? rows[0]).key;

      if (!isEdit || !product) {
        const created = await apiPost<AdminProduct>("/admin/products", {
          name: name.trim(),
          categoryId,
          productKind,
          preparationStation,
          descriptionShort: description.trim() || null,
          isActive,
          isFeatured,
          variants: rows.map((row) => ({
            ...buildVariantPayload(row),
            isDefault: row.key === desiredDefaultKey,
          })),
          ...imagePayload(),
        });

        const createdVariants = created.data?.variants ?? [];
        for (let index = 0; index < rows.length; index += 1) {
          const variantId = createdVariants[index]?.id;
          if (!variantId) continue;
          await saveRecipeForVariant(variantId, recipeDrafts[rows[index].key] ?? [blankRecipeDraft()]);
        }
      } else {
        await apiPatch(`/admin/products/${product.id}`, {
          name: name.trim(),
          categoryId,
          productKind,
          preparationStation,
          descriptionShort: description.trim() || null,
          isActive,
          isFeatured,
          ...imagePayload(),
        });

        const existingRows = rows.filter((row) => row.id);
        const newRows = rows.filter((row) => !row.id);
        const initialIds = (existingVariants ?? []).map((variant) => variant.id);
        const removedIds = initialIds.filter((id) => !rows.some((row) => row.id === id));

        // Perbarui varian lama lebih dulu, lalu buat varian baru, baru hapus.
        for (const row of existingRows) {
          await apiPatch(
            `/admin/products/${product.id}/variants/${row.id}`,
            buildVariantPayload(row),
          );
        }
        const createdVariantIds = new Map<string, string>();
        for (const row of newRows) {
          const createdResponse = await apiPost<AdminProduct>(
            `/admin/products/${product.id}/variants`,
            {
              ...buildVariantPayload(row),
              isDefault: row.key === desiredDefaultKey,
            },
          );
          const createdVariants = createdResponse.data?.variants ?? [];
          const createdVariantId = createdVariants.find((variant) => !initialIds.includes(variant.id))?.id;
          if (createdVariantId) createdVariantIds.set(row.key, createdVariantId);
        }
        for (const id of removedIds) {
          await apiDelete(`/admin/products/${product.id}/variants/${id}`);
        }

        // Tetapkan varian default yang dipilih (bila varian lama).
        const desired = rows.find((row) => row.key === desiredDefaultKey);
        if (desired?.id) {
          await apiPatch(`/admin/products/${product.id}/variants/${desired.id}`, {
            isDefault: true,
          });
        }

        // Simpan recipe (bahan + jumlah per varian) untuk varian lama.
        for (const row of existingRows) {
          const items = collectRecipeItems(recipeDrafts[row.key] ?? [blankRecipeDraft()]);
          if (items.length === 0) continue;
          await apiPut("/admin/recipes", {
            productVariantId: row.id,
            ingredients: items,
          });
        }

        // Simpan recipe untuk varian baru (butuh id hasil create).
        for (const row of newRows) {
          const createdVariantId = createdVariantIds.get(row.key);
          if (!createdVariantId) continue;
          await saveRecipeForVariant(createdVariantId, recipeDrafts[row.key] ?? [blankRecipeDraft()]);
        }
      }

      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan produk");
      setSaving(false);
    }
  };

  return (
    <AppModal
      isOpen
      onClose={onClose}
      title={isEdit ? "Ubah Produk" : "Tambah Produk"}
      desc={isEdit ? product?.slug : "Tambahkan produk baru beserta varian & harga modalnya"}
      size="xl"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass} disabled={saving}>
            Batal
          </button>
          <button type="button" onClick={handleSave} className={primaryButtonClass} disabled={saving}>
            {saving ? "Menyimpan…" : isEdit ? "Simpan Perubahan" : "Tambah Produk"}
          </button>
        </>
      }
    >
      <div className="space-y-6">
        {error && (
          <div className="rounded-xl border border-coffee-danger/30 bg-coffee-danger/5 px-4 py-3 text-theme-sm text-coffee-danger">
            {error}
          </div>
        )}
        {ingredients.error && (
          <ErrorBlock message={ingredients.error} onRetry={ingredients.reload} />
        )}
        {ingredients.loading && (
          <p className="text-theme-xs text-coffee-muted">Memuat daftar bahan baku…</p>
        )}

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className={fieldLabelClass}>Nama Produk</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="mis. Kopi Susu Semoet"
              className={inputClass}
              autoFocus
            />
          </label>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className={fieldLabelClass}>Kategori</span>
              <button
                type="button"
                onClick={() => {
                  setQuickCategoryOpen((prev) => !prev);
                  setCategoryError(null);
                }}
                className="text-theme-xs font-semibold text-coffee-brown hover:underline dark:text-coffee-caramel"
              >
                {quickCategoryOpen ? "Tutup" : "+ Kategori baru"}
              </button>
            </div>
            <select
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className={inputClass}
            >
              <option value="">Pilih kategori</option>
              {categoryOptions.map((category) => (
                <option key={category.id} value={category.id}>
                  {"— ".repeat(category.depth ?? 0)}
                  {category.name}
                </option>
              ))}
            </select>

            {quickCategoryOpen && (
              <div className="mt-1 space-y-2 rounded-xl border border-dashed border-coffee-linen bg-coffee-milk/40 p-3 dark:border-coffee-night-border dark:bg-white/5">
                {categoryError && (
                  <p className="text-theme-xs text-coffee-danger">{categoryError}</p>
                )}
                <input
                  value={newCategoryName}
                  onChange={(event) => setNewCategoryName(event.target.value)}
                  placeholder="Nama kategori baru"
                  className={inputClass}
                  autoFocus
                />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input
                    value={newCategorySlug}
                    onChange={(event) =>
                      setNewCategorySlug(event.target.value.toLowerCase())
                    }
                    placeholder="Slug (opsional)"
                    className={`${inputClass} font-mono`}
                  />
                  <select
                    value={newCategoryParentId}
                    onChange={(event) => setNewCategoryParentId(event.target.value)}
                    className={inputClass}
                  >
                    <option value="">Tanpa induk</option>
                    {categoryOptions.map((category) => (
                      <option key={category.id} value={category.id}>
                        {"— ".repeat(category.depth ?? 0)}
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={handleCreateCategory}
                  disabled={categorySaving}
                  className={primaryButtonClass}
                >
                  {categorySaving ? "Menyimpan…" : "Simpan Kategori"}
                </button>
              </div>
            )}
          </div>
          <label className="flex flex-col gap-1">
            <span className={fieldLabelClass}>Jenis</span>
            <select
              value={productKind}
              onChange={(event) => setProductKind(event.target.value)}
              className={inputClass}
            >
              {PRODUCT_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {productKindLabel(kind)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={fieldLabelClass}>Dibuat di</span>
            <select
              value={preparationStation}
              onChange={(event) => setPreparationStation(event.target.value)}
              className={inputClass}
            >
              {(stationsApi.data ?? [])
                .filter((s) => s.isActive || s.code === preparationStation)
                .map((s) => (
                  <option key={s.id} value={s.code}>
                    {s.name}
                  </option>
                ))}
              {(stationsApi.data ?? []).length === 0 && <option value="kitchen">Koki (Dapur)</option>}
            </select>
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className={fieldLabelClass}>Deskripsi Singkat</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              placeholder="Deskripsi singkat produk (opsional)"
              className={textareaClass}
            />
          </label>
          <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
            <label className="flex items-center gap-2 text-theme-sm text-coffee-dark dark:text-coffee-cream/80">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(event) => setIsActive(event.target.checked)}
                className="h-4 w-4 accent-coffee-brown"
              />
              Aktif dijual
            </label>
            <label className="flex items-center gap-2 text-theme-sm text-coffee-dark dark:text-coffee-cream/80">
              <input
                type="checkbox"
                checked={isFeatured}
                onChange={(event) => setIsFeatured(event.target.checked)}
                className="h-4 w-4 accent-coffee-brown"
              />
              Tandai unggulan
            </label>
          </div>
        </section>

        <section>
          <ProductImagePicker
            imageUrl={imageUrl}
            disabled={saving}
            onUploaded={handleImageUploaded}
            onRemove={handleImageRemove}
          />
        </section>

        <section>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-theme-sm font-semibold text-coffee-espresso dark:text-coffee-cream">
                Varian &amp; Harga
              </p>
              <p className="text-theme-xs text-coffee-muted">
                Harga jual, harga modal (HPP), dan harga sebelum diskon (opsional).
              </p>
            </div>
            <button
              type="button"
              onClick={addRow}
              className="rounded-lg border border-coffee-linen px-3 py-1.5 text-theme-xs font-semibold text-coffee-dark transition-colors hover:bg-coffee-milk dark:border-coffee-night-border dark:text-coffee-cream/80 dark:hover:bg-white/5"
            >
              + Tambah Varian
            </button>
          </div>

          {rows.length === 0 ? (
            <EmptyBlock message="Belum ada varian. Tambahkan minimal satu." />
          ) : (
            <div className="space-y-3">
              {rows.map((row) => {
                const price = toIdr(row.priceIdr);
                const cost = toIdr(row.costIdr);
                const compareAt = toOptionalIdr(row.compareAtPriceIdr);
                const invalidCompare = compareAt != null && compareAt < price;
                return (
                  <div
                    key={row.key}
                    className="rounded-xl border border-coffee-linen p-3 dark:border-coffee-night-border"
                  >
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <label className="flex flex-col gap-1">
                        <span className={fieldLabelClass}>Nama Varian</span>
                        <input
                          value={row.name}
                          onChange={(event) => updateRow(row.key, { name: event.target.value })}
                          placeholder="mis. Large"
                          className={inputClass}
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className={fieldLabelClass}>SKU (opsional)</span>
                        <input
                          value={row.sku}
                          onChange={(event) => updateRow(row.key, { sku: event.target.value })}
                          placeholder="mis. KSS-L"
                          className={`${inputClass} font-mono`}
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className={fieldLabelClass}>Harga Jual (Rp)</span>
                        <input
                          type="number"
                          min={0}
                          step={500}
                          inputMode="numeric"
                          value={row.priceIdr}
                          onChange={(event) => updateRow(row.key, { priceIdr: event.target.value })}
                          className={`${inputClass} text-end`}
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className={fieldLabelClass}>Harga Modal / HPP (Rp)</span>
                        <input
                          type="number"
                          min={0}
                          step={500}
                          inputMode="numeric"
                          value={row.costIdr}
                          onChange={(event) => updateRow(row.key, { costIdr: event.target.value })}
                          className={`${inputClass} text-end`}
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className={fieldLabelClass}>Sebelum Diskon (opsional)</span>
                        <input
                          type="number"
                          min={0}
                          step={500}
                          inputMode="numeric"
                          value={row.compareAtPriceIdr}
                          onChange={(event) =>
                            updateRow(row.key, { compareAtPriceIdr: event.target.value })
                          }
                          className={cn(inputClass, "text-end", invalidCompare && "border-coffee-danger")}
                        />
                      </label>
                      <div className="flex items-end gap-4 sm:col-span-2 lg:col-span-2">
                        <label className="flex items-center gap-2 text-theme-sm text-coffee-dark dark:text-coffee-cream/80">
                          <input
                            type="radio"
                            name="default-variant"
                            checked={row.isDefault}
                            onChange={() => setDefaultRow(row.key)}
                            className="h-4 w-4 accent-coffee-brown"
                          />
                          Varian utama
                        </label>
                        <label className="flex items-center gap-2 text-theme-sm text-coffee-dark dark:text-coffee-cream/80">
                          <input
                            type="checkbox"
                            checked={row.isActive}
                            onChange={(event) => updateRow(row.key, { isActive: event.target.checked })}
                            className="h-4 w-4 accent-coffee-brown"
                          />
                          Aktif
                        </label>
                        <button
                          type="button"
                          onClick={() => removeRow(row.key)}
                          disabled={rows.length <= 1}
                          title={rows.length <= 1 ? "Produk harus punya minimal satu varian" : undefined}
                          className="ms-auto rounded-lg border border-coffee-danger/40 px-3 py-1.5 text-theme-xs font-semibold text-coffee-danger transition-colors hover:bg-coffee-danger/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Hapus
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-theme-xs text-coffee-muted">
                      {row.isDefault && <ToneBadge tone="coffee">Utama</ToneBadge>}
                      {price > 0 && cost > 0 && (
                        <span>
                          Laba/unit: {formatIdr(price - cost)}
                          {compareAt != null && compareAt > price && (
                            <> · Diskon {formatIdr(compareAt - price)}</>
                          )}
                        </span>
                      )}
                      {invalidCompare && (
                        <span className="text-coffee-danger">
                          Harga sebelum diskon lebih kecil dari harga jual.
                        </span>
                      )}
                    </div>

                    <div className="mt-3 rounded-xl border border-coffee-linen p-3 dark:border-coffee-night-border">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-theme-sm font-semibold text-coffee-espresso dark:text-coffee-cream">
                          Resep Bahan
                        </p>
                        <button
                          type="button"
                          onClick={() => addRecipeDraft(row.key)}
                          className="rounded-lg border border-coffee-linen px-3 py-1.5 text-theme-xs font-semibold text-coffee-dark transition-colors hover:bg-coffee-milk dark:border-coffee-night-border dark:text-coffee-cream/80 dark:hover:bg-white/5"
                        >
                          + Tambah Bahan
                        </button>
                      </div>
                      <p className="mt-1 text-theme-xs text-coffee-muted">
                        Jumlah bahan per menu (dalam satuan base bahan, mis. gram) + estimasi waste-nya.
                      </p>
                      <div className="mt-3 space-y-2">
                        {(recipeDrafts[row.key] ?? [blankRecipeDraft()]).map((draft, draftIndex) => (
                          <div key={draftIndex} className="flex flex-wrap items-end gap-2">
                            <label className="flex min-w-[180px] flex-1 flex-col gap-1">
                              <span className={fieldLabelClass}>Bahan</span>
                              <IngredientPicker
                                ingredients={ingredients.data ?? []}
                                value={draft.ingredientId}
                                onChange={(ingredientId) =>
                                  updateRecipeDraft(row.key, draftIndex, { ingredientId })
                                }
                                showStock
                                loading={ingredients.loading}
                              />
                            </label>
                            <label className="flex w-[130px] flex-col gap-1">
                              <span className={fieldLabelClass}>Jumlah (base)</span>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={draft.quantityInBaseUnit}
                                onChange={(event) =>
                                  updateRecipeDraft(row.key, draftIndex, { quantityInBaseUnit: event.target.value })
                                }
                                placeholder="0"
                                className={inputClass}
                              />
                            </label>
                            <label className="flex w-[110px] flex-col gap-1">
                              <span className={fieldLabelClass}>Waste %</span>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="any"
                                value={draft.expectedWastePercent}
                                onChange={(event) =>
                                  updateRecipeDraft(row.key, draftIndex, { expectedWastePercent: event.target.value })
                                }
                                className={inputClass}
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => removeRecipeDraft(row.key, draftIndex)}
                              disabled={(recipeDrafts[row.key] ?? [blankRecipeDraft()]).length <= 1}
                              title="Hapus baris bahan"
                              className="mb-0.5 rounded-lg border border-coffee-danger/40 px-3 py-2 text-theme-xs font-semibold text-coffee-danger transition-colors hover:bg-coffee-danger/10 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </AppModal>
  );
}
