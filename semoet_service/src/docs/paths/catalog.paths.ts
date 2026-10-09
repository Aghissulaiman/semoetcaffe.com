import {
  booleanQueryParam,
  commonErrors,
  dateQueryParam,
  dateTimeQueryParam,
  enumQueryParam,
  paginationParameters,
  paginatedResponse,
  queryParam,
  ref,
  successResponse,
  tokenPathParam,
  uuid,
  uuidPathParam,
} from '../helpers.js';
import type { PathSpec } from '../helpers.js';

// --------------------------------------------------------------------------
// Branch & area
// --------------------------------------------------------------------------
const branchTags = ['Branch & Area'];

export const branchPaths: Record<string, PathSpec> = {
  '/branches': {
    get: {
      tags: branchTags,
      summary: 'Daftar cabang aktif',
      operationId: 'branchList',
      security: [],
      parameters: [
        paginationParameters()[0],
        paginationParameters()[1],
        queryParam('search', { type: 'string' }, 'Cari berdasarkan nama atau kode cabang.'),
        booleanQueryParam('isOpenNow', 'Hanya cabang yang sedang buka.'),
      ],
      responses: {
        '200': paginatedResponse(ref('Branch')),
      },
    },
  },

  '/branches/{id}': {
    get: {
      tags: branchTags,
      summary: 'Detail cabang',
      operationId: 'branchDetail',
      security: [],
      parameters: [uuidPathParam('id', 'ID cabang.')],
      responses: {
        '200': { description: 'Detail cabang.', content: { 'application/json': { schema: ref('Branch') } } },
        '404': commonErrors.notFound,
      },
    },
  },

  '/branches/{id}/hours': {
    get: {
      tags: branchTags,
      summary: 'Jam operasional cabang',
      description:
        'Jam buka-tutup per hari dan per service type, lengkap dengan penanda isOpenNow ' +
        'dihitung pada timezone cabang.',
      operationId: 'branchHours',
      security: [],
      parameters: [uuidPathParam('id', 'ID cabang.')],
      responses: {
        '200': {
          description: 'Jam operasional.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: {
                    type: 'object',
                    properties: {
                      branchId: uuid,
                      timezone: { type: 'string', example: 'Asia/Jakarta' },
                      hours: { type: 'array', items: ref('BranchHours') },
                      isOpenNow: { type: 'boolean' },
                      nextOpenAt: dateTimeQuerySchema(),
                      nextCloseAt: dateTimeQuerySchema(),
                    },
                  },
                },
              },
            },
          },
        },
        '404': commonErrors.notFound,
      },
    },
  },

  '/branches/{id}/areas': {
    get: {
      tags: branchTags,
      summary: 'Daftar area (indoor / outdoor / private room)',
      operationId: 'branchAreas',
      security: [],
      parameters: [uuidPathParam('id', 'ID cabang.')],
      responses: {
        '200': {
          description: 'Area di cabang tersebut.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: { type: 'array', items: ref('DiningArea') },
                },
              },
            },
          },
        },
        '404': commonErrors.notFound,
      },
    },
  },

  '/branches/{id}/tables': {
    get: {
      tags: branchTags,
      summary: 'Daftar meja di sebuah area',
      operationId: 'branchTables',
      security: [],
      parameters: [
        uuidPathParam('id', 'ID cabang.'),
        queryParam('areaId', { type: 'string', format: 'uuid' }, 'Filter berdasarkan area tertentu.'),
        enumQueryParam('areaType', ['indoor', 'outdoor', 'private_room', 'other'], 'Filter jenis area.'),
        queryParam('minCapacity', { type: 'integer' }, 'Meja dengan kapasitas minimal.'),
        booleanQueryParam('isActive', 'Default true. Set false untuk melihat meja nonaktif (staff).'),
      ],
      responses: {
        '200': {
          description: 'Daftar meja.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: { type: 'array', items: ref('CafeTable') },
                },
              },
            },
          },
        },
        '404': commonErrors.notFound,
      },
    },
  },

  '/tables/{id}': {
    get: {
      tags: branchTags,
      summary: 'Detail meja',
      operationId: 'tableDetail',
      security: [],
      parameters: [uuidPathParam('id', 'ID meja.')],
      responses: {
        '200': successResponse(ref('CafeTable')),
        '404': commonErrors.notFound,
      },
    },
  },

  '/tables/qr/{token}': {
    get: {
      tags: branchTags,
      summary: 'Cari meja dari QR code',
      description:
        'Untuk order dine_in dari QR meja. Token yang dipakai adalah hash SHA-256 dari token QR asli, ' +
        'jadi token asli tidak pernah disimpan di database.',
      operationId: 'tableByQr',
      security: [],
      parameters: [tokenPathParam('token', 'Token pada QR code meja.')],
      responses: {
        '200': {
          description: 'Meja yang ditemukan beserta cabang dan area.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: {
                    type: 'object',
                    properties: {
                      table: ref('CafeTable'),
                      branch: ref('Branch'),
                      isActive: { type: 'boolean' },
                    },
                  },
                },
              },
            },
          },
        },
        '404': {
          description: 'Token tidak dikenali atau meja sudah nonaktif.',
          content: { 'application/json': { schema: ref('ErrorResponse') } },
        },
      },
    },
  },
};

// --------------------------------------------------------------------------
// Menu / katalog
// --------------------------------------------------------------------------
const catalogTags = ['Menu & Katalog'];

export const catalogPaths: Record<string, PathSpec> = {
  '/categories': {
    get: {
      tags: catalogTags,
      summary: 'Daftar kategori produk',
      operationId: 'catalogListCategories',
      security: [],
      parameters: [
        paginationParameters()[0],
        paginationParameters()[1],
        queryParam('parentId', { type: 'string', format: 'uuid' }, 'Hanya kategori anak dari induk ini.'),
        queryParam('tree', { type: 'boolean' }, 'Kembalikan sebagai pohon kategori.'),
        booleanQueryParam('isActive', 'Default true.'),
      ],
      responses: {
        '200': paginatedResponse(ref('ProductCategory')),
      },
    },
  },

  '/categories/{slug}': {
    get: {
      tags: catalogTags,
      summary: 'Detail kategori beserta produknya',
      operationId: 'catalogCategoryDetail',
      security: [],
      parameters: [
        { name: 'slug', in: 'path', required: true, description: 'Slug kategori.', schema: { type: 'string' } },
        paginationParameters()[0],
        paginationParameters()[1],
        queryParam('sort', { type: 'string', enum: ['recommended', 'price_asc', 'price_desc', 'newest'] }),
      ],
      responses: {
        '200': {
          description: 'Kategori dan produk di dalamnya.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: {
                    type: 'object',
                    properties: {
                      category: ref('ProductCategory'),
                      products: { type: 'array', items: ref('Product') },
                    },
                  },
                  meta: ref('PaginationMeta'),
                },
              },
            },
          },
        },
        '404': commonErrors.notFound,
      },
    },
  },

  '/products': {
    get: {
      tags: catalogTags,
      summary: 'Cari produk',
      description:
        'Endpoint publik. Bila request membawa Bearer token, field isFavorite terisi ' +
        'sesuai favorit user tersebut.',
      operationId: 'catalogListProducts',
      security: [],
      parameters: [
        paginationParameters()[0],
        paginationParameters()[1],
        queryParam('search', { type: 'string' }, 'Cari nama produk.'),
        queryParam('categoryId', { type: 'string', format: 'uuid' }, 'Filter kategori.'),
        queryParam('categorySlug', { type: 'string' }, 'Filter kategori berdasarkan slug.'),
        queryParam('kind', { type: 'string', enum: ['food', 'drink', 'coffee', 'snack', 'dessert', 'bundle', 'buffet', 'event', 'other', 'standard'] }, 'Filter jenis produk.'),
        queryParam('minPriceIdr', { type: 'integer' }, 'Harga minimum (varian termurah).'),
        queryParam('maxPriceIdr', { type: 'integer' }, 'Harga maksimum.'),
        queryParam('branchId', { type: 'string', format: 'uuid' }, 'Filter berdasarkan ketersediaan cabang.'),
        queryParam('availableOn', { type: 'string', format: 'date' }, 'Tanggal untuk mengecek jadwal ketersediaan.'),
        queryParam('sort', { type: 'string', enum: ['recommended', 'price_asc', 'price_desc', 'newest', 'name_asc'] }),
        booleanQueryParam('isFeatured', 'Hanya produk unggulan.'),
      ],
      responses: {
        '200': paginatedResponse(ref('Product')),
      },
    },
  },

  '/products/{slug}': {
    get: {
      tags: catalogTags,
      summary: 'Detail produk',
      description: 'Mengembalikan produk beserta varian, modifier, dan gambar.',
      operationId: 'catalogProductDetail',
      security: [],
      parameters: [{ name: 'slug', in: 'path', required: true, description: 'Slug produk.', schema: { type: 'string' } }],
      responses: {
        '200': {
          description: 'Detail produk.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: {
                    type: 'object',
                    properties: {
                      product: ref('Product'),
                      variants: { type: 'array', items: ref('ProductVariant') },
                      modifierGroups: { type: 'array', items: ref('ModifierGroup') },
                      images: { type: 'array', items: ref('ProductImage') },
                      isFavorite: { type: 'boolean' },
                    },
                  },
                },
              },
            },
          },
        },
        '404': commonErrors.notFound,
      },
    },
  },

  '/products/{id}/variants': {
    get: {
      tags: catalogTags,
      summary: 'Varian produk',
      operationId: 'catalogProductVariants',
      security: [],
      parameters: [uuidPathParam('id', 'ID produk.')],
      responses: {
        '200': {
          description: 'Daftar varian.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: { type: 'array', items: ref('ProductVariant') },
                },
              },
            },
          },
        },
        '404': commonErrors.notFound,
      },
    },
  },

  '/products/{id}/modifiers': {
    get: {
      tags: catalogTags,
      summary: 'Grup modifier produk',
      description:
        'Mengembalikan grup modifier beserta opsi, batas minimum/maksimum, ' +
        'dan override per produk bila ada.',
      operationId: 'catalogProductModifiers',
      security: [],
      parameters: [uuidPathParam('id', 'ID produk.')],
      responses: {
        '200': {
          description: 'Grup modifier.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: { type: 'array', items: ref('ModifierGroup') },
                },
              },
            },
          },
        },
        '404': commonErrors.notFound,
      },
    },
  },

  '/products/{id}/availability': {
    get: {
      tags: catalogTags,
      summary: 'Jadwal ketersediaan produk',
      operationId: 'catalogProductAvailability',
      security: [],
      parameters: [
        uuidPathParam('id', 'ID produk.'),
        queryParam('branchId', { type: 'string', format: 'uuid' }, 'Cek untuk cabang tertentu.'),
        dateQueryParam('date', 'Tanggal yang dicek (YYYY-MM-DD). Default hari ini.'),
      ],
      responses: {
        '200': {
          description: 'Aturan ketersediaan beserta hasil pengecekan.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: {
                    type: 'object',
                    properties: {
                      productId: uuid,
                      isAvailable: { type: 'boolean' },
                      schedules: { type: 'array', items: ref('ProductAvailability') },
                      reason: { type: 'string', nullable: true, description: 'Alasan bila tidak tersedia.' },
                    },
                  },
                },
              },
            },
          },
        },
        '404': commonErrors.notFound,
      },
    },
  },

  '/products/{id}/images': {
    get: {
      tags: catalogTags,
      summary: 'Galeri gambar produk',
      operationId: 'catalogProductImages',
      security: [],
      parameters: [uuidPathParam('id', 'ID produk.')],
      responses: {
        '200': {
          description: 'Daftar gambar urut dari primary.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: { type: 'array', items: ref('ProductImage') },
                },
              },
            },
          },
        },
        '404': commonErrors.notFound,
      },
    },
  },

  '/products/{id}/reviews': {
    get: {
      tags: ['Review'],
      summary: 'Review publik untuk produk',
      description: 'Hanya review dengan moderation_status = visible.',
      operationId: 'reviewListForProduct',
      security: [],
      parameters: [
        uuidPathParam('id', 'ID produk.'),
        ...paginationParameters(),
        queryParam('minRating', { type: 'integer', minimum: 1, maximum: 5 }, 'Filter rating minimum.'),
        queryParam('withSummary', { type: 'boolean' }, 'Sertakan ringkasan rata-rata rating.'),
      ],
      responses: {
        '200': {
          description: 'Daftar review beserta ringkasan rating.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: { type: 'array', items: ref('Review') },
                  meta: ref('PaginationMeta'),
                },
              },
            },
          },
        },
        '404': commonErrors.notFound,
      },
    },
  },

  '/reviews': {
    get: {
      tags: ['Review'],
      summary: 'Review publik (query productId)',
      description: 'Bentuk query dari GET /products/:id/reviews untuk client yang memakai query string.',
      operationId: 'reviewListPublic',
      security: [],
      parameters: [
        queryParam('productId', { type: 'string', format: 'uuid' }, 'Wajib diisi.', true),
        ...paginationParameters(),
        queryParam('minRating', { type: 'integer', minimum: 1, maximum: 5 }),
      ],
      responses: {
        '200': paginatedResponse(ref('Review')),
        '400': commonErrors.validation,
      },
    },
  },
};

// --------------------------------------------------------------------------
// Home & banner
// --------------------------------------------------------------------------
const homeTags = ['Home & Banner'];

export const homePaths: Record<string, PathSpec> = {
  '/home': {
    get: {
      tags: homeTags,
      summary: 'Payload halaman beranda',
      description:
        'Satu panggilan untuk mengisi beranda: banner aktif, produk unggulan per placement, ' +
        'dan ringkasan kategori. Designed untuk mengurangi jumlah request dari mobile.',
      operationId: 'homeGet',
      security: [],
      parameters: [
        queryParam('branchId', { type: 'string', format: 'uuid' }, 'Cabang terdekat / cabang terpilih.'),
        queryParam('placement', {
          type: 'string',
          enum: ['favorite', 'new', 'family_bundle', 'meeting_bundle', 'birthday_bundle', 'buffet_bundle', 'event'],
        }, 'Ambil satu placement saja.'),
      ],
      responses: {
        '200': {
          description: 'Payload beranda.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: {
                    type: 'object',
                    properties: {
                      banners: { type: 'array', items: ref('HomeBanner') },
                      featured: {
                        type: 'object',
                        description: 'Produk unggulan dikelompokkan per placement.',
                        additionalProperties: { type: 'array', items: ref('Product') },
                      },
                      placements: { type: 'array', items: ref('FeaturedPlacement') },
                      categories: { type: 'array', items: ref('ProductCategory') },
                      nearestBranch: { ...(ref('Branch') as object), nullable: true } as object,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },

  '/banners': {
    get: {
      tags: homeTags,
      summary: 'Banner aktif',
      operationId: 'homeListBanners',
      security: [],
      parameters: [
        paginationParameters()[0],
        paginationParameters()[1],
        booleanQueryParam('isActive', 'Default true: hanya banner dalam periode aktif.'),
      ],
      responses: {
        '200': paginatedResponse(ref('HomeBanner')),
      },
    },
  },

  '/banners/{id}': {
    get: {
      tags: homeTags,
      summary: 'Detail banner',
      operationId: 'homeBannerDetail',
      security: [],
      parameters: [uuidPathParam('id', 'ID banner.')],
      responses: {
        '200': successResponse(ref('HomeBanner')),
        '404': commonErrors.notFound,
      },
    },
  },

  '/placements': {
    get: {
      tags: homeTags,
      summary: 'Daftar placement aktif',
      description: 'Referensi placement beserta label tampilan untuk client.',
      operationId: 'homeListPlacements',
      security: [],
      responses: {
        '200': {
          description: 'Daftar placement.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: { type: 'array', items: ref('FeaturedPlacement') },
                },
              },
            },
          },
        },
      },
    },
  },

  '/placements/{placement}/products': {
    get: {
      tags: homeTags,
      summary: 'Produk unggulan pada satu placement',
      operationId: 'homePlacementProducts',
      security: [],
      parameters: [
        {
          name: 'placement',
          in: 'path',
          required: true,
          schema: {
            type: 'string',
            enum: ['favorite', 'new', 'family_bundle', 'meeting_bundle', 'birthday_bundle', 'buffet_bundle', 'event'],
          },
        },
        ...paginationParameters(),
      ],
      responses: {
        '200': paginatedResponse(ref('Product')),
        '404': commonErrors.notFound,
      },
    },
  },

  '/products/featured/{placement}': {
    get: {
      tags: homeTags,
      summary: 'Produk unggulan (path alternatif)',
      description:
        'Bentuk path dari /placements/:placement/products. Daftarkan lebih dulu ' +
        'daripada /products/:slug supaya kata "featured" tidak tertangkap sebagai slug.',
      operationId: 'homeFeaturedByPlacement',
      security: [],
      parameters: [
        {
          name: 'placement',
          in: 'path',
          required: true,
          schema: {
            type: 'string',
            enum: ['favorite', 'new', 'family_bundle', 'meeting_bundle', 'birthday_bundle', 'buffet_bundle', 'event'],
          },
        },
        ...paginationParameters(),
      ],
      responses: {
        '200': paginatedResponse(ref('Product')),
        '404': commonErrors.notFound,
      },
    },
  },

  '/categories/overview': {
    get: {
      tags: homeTags,
      summary: 'Ringkasan jumlah produk per kategori',
      operationId: 'homeCategoryOverview',
      security: [],
      responses: {
        '200': {
          description: 'Pohon kategori beserta jumlah produk.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: { type: 'array', items: ref('ProductCategory') },
                },
              },
            },
          },
        },
      },
    },
  },
};

/** Skema nullable date-time yang sering dipakai pada payload beranda. */
function dateTimeQuerySchema(): Record<string, unknown> {
  return { type: 'string', format: 'date-time', nullable: true };
}