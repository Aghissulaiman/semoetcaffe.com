import * as branchRepo from '../repositories/branch.repository.js';
import * as catalogRepo from '../repositories/catalog.repository.js';
import * as homeRepo from '../repositories/home.repository.js';
import { notFound } from '../errors/AppError.js';
import { bool, num, str, strOrNull, toIsoOrNull } from '../utils/serialize.js';
import { buildCategoryTree } from './catalog.service.js';
import {
  homeQuerySchema,
  listBannerQuerySchema,
  type ListFeaturedQuery,
} from '../validators/catalog.validator.js';

export type HomeQuery = ReturnType<typeof homeQuerySchema.parse>;
export type ListBannerQuery = ReturnType<typeof listBannerQuerySchema.parse>;

/** Jumlah item per section di halaman beranda. */
const HOME_SECTION_LIMIT = 8;

/** Jumlah banner aktif yang ditampilkan di beranda. */
const HOME_BANNER_LIMIT = 10;

/** Jumlah cabang terdekat yang dikirim ke klien beranda. */
const NEAREST_BRANCH_LIMIT = 5;

/** Label ramah pengguna untuk setiap placement featured. */
const PLACEMENT_LABELS: Record<string, string> = {
  favorite: 'Favorit',
  new: 'Baru',
  family_bundle: 'Paket Keluarga',
  meeting_bundle: 'Paket Meeting',
  birthday_bundle: 'Paket Ulang Tahun',
  buffet_bundle: 'Paket Buffet',
  event: 'Event',
};

/**
 * Ubah baris bertipe eksplisit di repository menjadi bentuk longgar supaya
 * bisa dibaca sebagai objek (generic repo kadang masih snake_case).
 */
function toRecord(row: unknown): Record<string, unknown> {
  return (row ?? {}) as Record<string, unknown>;
}

function hasCoordinates(query: { latitude?: number; longitude?: number }): boolean {
  return typeof query.latitude === 'number' && typeof query.longitude === 'number';
}

/** Waktu acuan; query `at` opsional dipakai untuk melihat data pada waktu tertentu. */
function resolveAt(value?: string): Date {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function shapeBanner(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    title: strOrNull(row.title),
    imageUrl: strOrNull(row.imageUrl),
    imageStorageKey: strOrNull(row.imageStorageKey),
    targetUrl: strOrNull(row.targetUrl),
    sortOrder: num(row.sortOrder),
    startsAt: toIsoOrNull(row.startsAt),
    endsAt: toIsoOrNull(row.endsAt),
    isActive: row.isActive === undefined ? true : bool(row.isActive, true),
  };
}

/** Baris ringkas produk untuk section beranda (tanpa rating/favorit). */
function shapeHomeProduct(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    slug: String(row.slug ?? ''),
    name: String(row.name ?? ''),
    description: strOrNull(row.description),
    productKind: strOrNull(row.productKind),
    isFeatured: row.isFeatured === undefined ? false : bool(row.isFeatured),
    category: {
      slug: strOrNull(row.categorySlug),
      name: strOrNull(row.categoryName),
    },
    priceIdr: row.minPriceIdr === null || row.minPriceIdr === undefined ? null : num(row.minPriceIdr),
    imageUrl: strOrNull(row.imageUrl),
  };
}

function shapeNearestBranch(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    code: strOrNull(row.code),
    name: strOrNull(row.name),
    address: strOrNull(row.address),
    phone: strOrNull(row.phone),
    distanceKm: row.distanceKm === null || row.distanceKm === undefined ? null : num(row.distanceKm, 0),
  };
}

// --------------------------------------------------------------------------
// GET /home
// --------------------------------------------------------------------------
export async function getHome(query: HomeQuery) {
  const at = new Date();
  const withDistance = hasCoordinates(query);

  const [
    banners,
    placements,
    newArrivals,
    mostFavorited,
    branches,
    categoryCounts,
    momentCount,
    categoryOverview,
  ] = await Promise.all([
      homeRepo.listActiveBanners(at, HOME_BANNER_LIMIT),
      homeRepo.listFeaturedPlacements(at),
      homeRepo.listNewArrivals(HOME_SECTION_LIMIT),
      homeRepo.listMostFavorited(HOME_SECTION_LIMIT),
      branchRepo.listBranches(
        { limit: NEAREST_BRANCH_LIMIT, offset: 0 },
        {
          isActive: true,
          latitude: query.latitude,
          longitude: query.longitude,
          withDistance,
        },
      ),
      homeRepo.countProductsByCategory(),
      homeRepo.countApprovedMoments(),
      getCategoryOverview(),
    ]);

  // Cabang yang dipilih user didahulukan walau tidak terdekat.
  let nearestBranches = branches;
  if (query.branchId) {
    const selected = branches.filter((row) => String(row.id) === query.branchId);
    if (selected.length > 0) {
      nearestBranches = [...selected, ...branches.filter((row) => String(row.id) !== query.branchId)];
    }
  }

  // Produk unggulan per placement agar payload beranda mandiri untuk app.
  const featuredLists = await Promise.all(
    placements.map((row) =>
      homeRepo.listFeaturedProducts({
        placement: str(toRecord(row).placement),
        at,
        limit: HOME_SECTION_LIMIT,
      }),
    ),
  );
  const featured: Record<string, ReturnType<typeof shapeHomeProduct>[]> = {};
  placements.forEach((row, index) => {
    featured[str(toRecord(row).placement)] = featuredLists[index].map(shapeHomeProduct);
  });

  return {
    banners: banners.map(shapeBanner),
    placements: shapePlacements(placements),
    categories: categoryOverview.items.map((item) => ({ ...item, isActive: true })),
    featured,
    nearestBranch: nearestBranches.length > 0 ? shapeNearestBranch(nearestBranches[0]) : null,
    newArrivals: newArrivals.map(shapeHomeProduct),
    mostFavorited: mostFavorited.map((row) => ({
      ...shapeHomeProduct(row),
      favoriteCount: num(row.favoriteCount),
    })),
    nearestBranches: nearestBranches.map(shapeNearestBranch),
    // Generic di repository masih snake_case, tapi baris runtime sudah camelCase.
    categoryCounts: categoryCounts.map((row) => {
      const item = toRecord(row);
      return {
        categoryId: str(item.categoryId),
        categoryName: str(item.categoryName),
        productCount: num(item.productCount),
      };
    }),
    momentCount,
    branchId: query.branchId ?? null,
  };
}

// --------------------------------------------------------------------------
// GET /banners
// --------------------------------------------------------------------------
export async function listBanners(query: ListBannerQuery) {
  const at = resolveAt(query.at);
  const rows = await homeRepo.listActiveBanners(at, HOME_BANNER_LIMIT);
  return rows.map(shapeBanner);
}

// --------------------------------------------------------------------------
// GET /banners/:id
// --------------------------------------------------------------------------
export async function getBanner(bannerId: string) {
  const banner = await homeRepo.findBannerById(bannerId);
  if (!banner) throw notFound('Banner', bannerId);
  return shapeBanner(banner);
}

// --------------------------------------------------------------------------
// GET /placements
// --------------------------------------------------------------------------
function shapePlacements(rows: unknown[]) {
  return rows.map((raw) => {
    const row = toRecord(raw);
    const placement = str(row.placement);
    return {
      placement,
      label: PLACEMENT_LABELS[placement] ?? placement,
      productCount: num(row.productCount),
    };
  });
}

export async function listPlacements() {
  const rows = await homeRepo.listFeaturedPlacements(new Date());
  return shapePlacements(rows);
}

// --------------------------------------------------------------------------
// GET /placements/:placement/products
// --------------------------------------------------------------------------
export async function listPlacementProducts(query: ListFeaturedQuery) {
  const filters: homeRepo.FeaturedFilters = {
    placement: query.placement,
    at: resolveAt(query.at),
    limit: query.limit,
  };

  const rows = await homeRepo.listFeaturedProducts(filters);
  return rows.map((row) => ({
    ...shapeHomeProduct(row),
    placement: strOrNull(row.placement),
    sortOrder: num(row.sortOrder),
    startsAt: toIsoOrNull(row.startsAt),
    endsAt: toIsoOrNull(row.endsAt),
  }));
}

// --------------------------------------------------------------------------
// GET /categories/overview
// --------------------------------------------------------------------------
export async function getCategoryOverview() {
  const [counts, categoryRows] = await Promise.all([
    homeRepo.countProductsByCategory(),
    catalogRepo.listCategories({ isActive: true }),
  ]);

  // Generic di repository masih snake_case, tapi baris runtime sudah camelCase.
  const countById = new Map(
    counts.map((row) => [str(toRecord(row).categoryId), num(toRecord(row).productCount)]),
  );
  const parentById = new Map<string, string | null>(
    categoryRows.map((row) => [
      String(row.id),
      row.parentId === null || row.parentId === undefined ? null : String(row.parentId),
    ]),
  );

  // Jumlahkan seluruh subtree agar node induk menampilkan total produk di bawahnya.
  const subtreeTotal = new Map<string, number>();
  for (const row of categoryRows) {
    const id = String(row.id);
    let total = countById.get(id) ?? num(row.productCount);
    let parentId = parentById.get(id) ?? null;
    const guard = new Set<string>([id]);

    while (parentId && !guard.has(parentId)) {
      guard.add(parentId);
      total += countById.get(parentId) ?? num(findCategoryRow(categoryRows, parentId)?.productCount);
      parentId = parentById.get(parentId) ?? null;
    }

    subtreeTotal.set(id, total);
  }

  const items = categoryRows.map((row) => {
    const id = String(row.id);
    return {
      id,
      parentId: parentById.get(id) ?? null,
      name: String(row.name ?? ''),
      slug: strOrNull(row.slug),
      sortOrder: num(row.sortOrder),
      directProductCount: countById.get(id) ?? num(row.productCount),
      productCount: subtreeTotal.get(id) ?? 0,
    };
  });

  return { items, tree: buildCategoryTree(categoryRows) };
}

function findCategoryRow(
  rows: Record<string, unknown>[],
  categoryId: string,
): Record<string, unknown> | undefined {
  return rows.find((row) => String(row.id) === categoryId);
}