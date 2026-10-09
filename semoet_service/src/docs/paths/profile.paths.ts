import {
  booleanQueryParam,
  commonErrors,
  dateQueryParam,
  enumQueryParam,
  paginationParameters,
  paginatedResponse,
  queryParam,
  ref,
  slugPathParam,
  successResponse,
  uuid,
  uuidPathParam,
} from '../helpers.js';
import type { PathSpec } from '../helpers.js';
import type { SchemaLike } from '../types.js';

const tags = ['User Profile'];

export const profilePaths: Record<string, PathSpec> = {
  '/me': {
    get: {
      tags,
      summary: 'Profil lengkap saya',
      description: 'Gabungan users + customer_profiles + tier + ringkasan poin.',
      operationId: 'profileGetMe',
      responses: {
        '200': { description: 'Profil pengguna.', content: { 'application/json': { schema: ref('CustomerProfile') } } },
        '401': commonErrors.unauthorized,
      },
    },
    patch: {
      tags,
      summary: 'Perbarui profil',
      description: 'Field yang tidak dikirim tidak akan berubah (partial update).',
      operationId: 'profileUpdateMe',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: ref('UpdateProfileRequest'),
            example: { displayName: 'Siti Rahma', birthDate: '1998-04-17', marketingOptIn: false },
          },
        },
      },
      responses: {
        '200': { description: 'Profil diperbarui.', content: { 'application/json': { schema: ref('CustomerProfile') } } },
        '400': commonErrors.validation,
        '401': commonErrors.unauthorized,
      },
    },
  },

  '/me/tier': {
    get: {
      tags,
      summary: 'Tier dan progres poin',
      description: 'Menampilkan tier aktif, saldo poin, dan berapa poin lagi untuk naik tier.',
      operationId: 'profileGetTier',
      responses: {
        '200': {
          description: 'Informasi tier.',
          content: { 'application/json': { schema: ref('TierProgressResponse') } },
        },
        '401': commonErrors.unauthorized,
      },
    },
  },

  '/me/preferences': {
    get: {
      tags,
      summary: 'Baca preferensi aplikasi',
      description: 'Preferensi bebas bentuk (JSON), misalnya favorit rasa, notifikasi, tema.',
      operationId: 'profileGetPreferences',
      responses: {
        '200': { description: 'Preferensi saat ini.', content: { 'application/json': { schema: ref('Preferences') } } },
        '401': commonErrors.unauthorized,
      },
    },
    patch: {
      tags,
      summary: 'Perbarui preferensi',
      description: 'Kirim objek PreferencesResource penuh; nilainya menggantikan yang ada.',
      operationId: 'profileUpdatePreferences',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: ref('Preferences'),
            example: { favoriteCategory: 'coffee', language: 'id', pushEnabled: true },
          },
        },
      },
      responses: {
        '200': { description: 'Preferensi tersimpan.', content: { 'application/json': { schema: ref('Preferences') } } },
        '400': commonErrors.validation,
        '401': commonErrors.unauthorized,
      },
    },
  },

  '/me/tiers': {
    get: {
      tags,
      summary: 'Daftar semua tier',
      description: 'Referensi tier beserta syarat minimum poin dan daftar benefit.',
      operationId: 'profileListTiers',
      responses: {
        '200': {
          description: 'Daftar tier aktif.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: { type: 'array', items: ref('CustomerTier') },
                },
              },
            },
          },
        },
        '401': commonErrors.unauthorized,
      },
    },
  },
};

// --------------------------------------------------------------------------
// Address
// --------------------------------------------------------------------------
const addressTags = ['Address'];

const addressBody: Record<string, { schema: SchemaLike; example: unknown }> = {
  create: {
    schema: ref('CreateAddressRequest'),
    example: {
      label: 'Rumah',
      recipientName: 'Siti Rahma',
      recipientPhone: '08111000111',
      addressLine: 'Jl. Merdeka No. 10',
      addressDetail: 'Rumah warna orange, dekat sekolah',
      city: 'Bandung',
      province: 'Jawa Barat',
      postalCode: '40115',
      latitude: -6.9175,
      longitude: 107.6191,
      deliveryInstructions: 'Titip ke satpam bila tidak ada',
      isDefault: true,
    },
  },
};

export const addressPaths: Record<string, PathSpec> = {
  '/me/addresses': {
    get: {
      tags: addressTags,
      summary: 'Daftar alamat tersimpan',
      operationId: 'addressList',
      parameters: [...paginationParameters(), booleanQueryParam('isDefault', 'Hanya tampilkan alamat default.')],
      responses: {
        '200': paginatedResponse(ref('Address')),
        '401': commonErrors.unauthorized,
      },
    },
    post: {
      tags: addressTags,
      summary: 'Tambah alamat',
      description: 'Hanya satu alamat yang boleh ber-flag default (dijamin unique index).',
      operationId: 'addressCreate',
      requestBody: { required: true, content: { 'application/json': { schema: addressBody.create.schema, example: addressBody.create.example as never } } },
      responses: {
        '201': successResponse(ref('Address'), 'Alamat dibuat.'),
        '400': commonErrors.validation,
        '401': commonErrors.unauthorized,
      },
    },
  },

  '/me/addresses/{id}': {
    get: {
      tags: addressTags,
      summary: 'Detail alamat',
      operationId: 'addressDetail',
      parameters: [uuidPathParam('id', 'ID alamat.')],
      responses: {
        '200': successResponse(ref('Address')),
        '401': commonErrors.unauthorized,
        '404': commonErrors.notFound,
      },
    },
    patch: {
      tags: addressTags,
      summary: 'Ubah alamat',
      operationId: 'addressUpdate',
      parameters: [uuidPathParam('id', 'ID alamat.')],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: ref('UpdateAddressRequest'),
            example: { addressDetail: 'Pindah ke lantai 2', deliveryInstructions: 'Telepon dulu' },
          },
        },
      },
      responses: {
        '200': successResponse(ref('Address')),
        '400': commonErrors.validation,
        '401': commonErrors.unauthorized,
        '404': commonErrors.notFound,
      },
    },
    delete: {
      tags: addressTags,
      summary: 'Hapus alamat',
      description: 'Alamat yang sedang dipakai order berjalan tetap tersimpan karena order memakai snapshot.',
      operationId: 'addressDelete',
      parameters: [uuidPathParam('id', 'ID alamat.')],
      responses: {
        '200': successResponse(
          { type: 'object', properties: { id: uuid, deleted: { type: 'boolean' } } },
          'Alamat dihapus.',
        ),
        '401': commonErrors.unauthorized,
        '404': commonErrors.notFound,
      },
    },
  },

  '/me/addresses/{id}/default': {
    post: {
      tags: addressTags,
      summary: 'Jadikan alamat default',
      description: 'Alamat default sebelumnya otomatis dilepas flag-nya dalam satu transaksi.',
      operationId: 'addressSetDefault',
      parameters: [uuidPathParam('id', 'ID alamat.')],
      responses: {
        '200': successResponse(ref('Address'), 'Alamat aktif menjadi default.'),
        '401': commonErrors.unauthorized,
        '404': commonErrors.notFound,
      },
    },
  },

  // ------------------------------------------------------------------------
  // Family
  // ------------------------------------------------------------------------
  '/me/family': {
    get: {
      tags: ['Family'],
      summary: 'Kelompok keluarga saya',
      description: 'Group dibuat otomatis saat pertama dibutuhkan. Bila belum ada, group = null.',
      operationId: 'familyDetail',
      responses: {
        '200': successResponse(
          ref('FamilyGroupEnvelope'),
          'Kelompok keluarga beserta jumlah anggota.',
        ),
        '401': commonErrors.unauthorized,
      },
    },
    patch: {
      tags: ['Family'],
      summary: 'Ubah nama kelompok keluarga',
      operationId: 'familyUpdate',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 1, maxLength: 120 } } },
            example: { name: 'Keluarga Rahma' },
          },
        },
      },
      responses: {
        '200': successResponse(ref('FamilyGroupEnvelope')),
        '400': commonErrors.validation,
        '401': commonErrors.unauthorized,
      },
    },
  },

  '/me/family/members': {
    get: {
      tags: ['Family'],
      summary: 'Daftar anggota keluarga',
      operationId: 'familyListMembers',
      parameters: paginationParameters(),
      responses: {
        '200': paginatedResponse(ref('FamilyMember')),
        '401': commonErrors.unauthorized,
      },
    },
    post: {
      tags: ['Family'],
      summary: 'Tambah anggota keluarga',
      description:
        'Anggota boleh berupa user terdaftar (linkedUserId) atau cukup data nama untuk anggota anak/anak.',
      operationId: 'familyCreateMember',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: ref('CreateFamilyMemberRequest'),
            example: { displayName: 'Ahmad', relationship: 'Anak', birthDate: '2015-02-02' },
          },
        },
      },
      responses: {
        '201': successResponse(ref('FamilyMember'), 'Anggota ditambahkan.'),
        '400': commonErrors.validation,
        '401': commonErrors.unauthorized,
        '409': {
          description: 'Anggota sudah ada atau jumlah anggota melebihi batas.',
          content: { 'application/json': { schema: ref('ErrorResponse') } },
        },
      },
    },
  },

  '/me/family/members/{id}': {
    patch: {
      tags: ['Family'],
      summary: 'Ubah anggota keluarga',
      operationId: 'familyUpdateMember',
      parameters: [uuidPathParam('id', 'ID anggota keluarga.')],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: ref('UpdateFamilyMemberRequest'),
            example: { relationship: 'Anak pertama' },
          },
        },
      },
      responses: {
        '200': successResponse(ref('FamilyMember')),
        '400': commonErrors.validation,
        '401': commonErrors.unauthorized,
        '404': commonErrors.notFound,
      },
    },
    delete: {
      tags: ['Family'],
      summary: 'Hapus anggota keluarga',
      operationId: 'familyDeleteMember',
      parameters: [uuidPathParam('id', 'ID anggota keluarga.')],
      responses: {
        '200': successResponse(
          { type: 'object', properties: { id: uuid, deleted: { type: 'boolean' } } },
          'Anggota dihapus.',
        ),
        '401': commonErrors.unauthorized,
        '404': commonErrors.notFound,
      },
    },
  },
};

// --------------------------------------------------------------------------
// Favorites
// --------------------------------------------------------------------------
const favoriteTags = ['Favorites'];

export const favoritePaths: Record<string, PathSpec> = {
  '/me/favorites': {
    get: {
      tags: favoriteTags,
      summary: 'Daftar produk favorit',
      operationId: 'favoritesList',
      parameters: paginationParameters(),
      responses: {
        '200': paginatedResponse(ref('Product'), 'Produk yang ditandai favorit.'),
        '401': commonErrors.unauthorized,
      },
    },
    post: {
      tags: favoriteTags,
      summary: 'Tambah produk favorit',
      description: 'Idempoten. Menambah produk yang sudah ada tidak menghasilkan duplikat.',
      operationId: 'favoritesCreate',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'object', required: ['productId'], properties: { productId: uuid } },
            example: { productId: '6f2b9a1e-0d1c-4b8e-9a3f-2c7d5e1b0a44' },
          },
        },
      },
      responses: {
        '201': successResponse(
          { type: 'object', properties: { productId: uuid, isFavorite: { type: 'boolean' } } },
          'Favorit disimpan.',
        ),
        '400': commonErrors.validation,
        '401': commonErrors.unauthorized,
        '404': commonErrors.notFound,
      },
    },
  },

  '/me/favorites/{productId}': {
    delete: {
      tags: favoriteTags,
      summary: 'Hapus produk favorit',
      operationId: 'favoritesRemove',
      parameters: [uuidPathParam('productId', 'ID produk yang dihapus dari favorit.')],
      responses: {
        '200': successResponse(
          { type: 'object', properties: { productId: uuid, deleted: { type: 'boolean' } } },
          'Favorit dihapus.',
        ),
        '401': commonErrors.unauthorized,
      },
    },
  },

  '/me/favorites/ids': {
    get: {
      tags: favoriteTags,
      summary: 'Cek status favorit banyak produk',
      description: 'Endpoint ringan untuk menandai UI, maksimal 100 productId per panggilan.',
      operationId: 'favoritesListIds',
      parameters: [
        queryParam('productIds', { type: 'string' }, 'Daftar productId dipisah koma, maksimal 100.', true),
      ],
      responses: {
        '200': {
          description: 'Daftar id yang merupakan favorit.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: { type: 'array', items: uuid, description: 'productId yang ada di favorit.' },
                },
              },
            },
          },
        },
        '400': commonErrors.validation,
        '401': commonErrors.unauthorized,
      },
    },
  },
};

export { tags as profileTags, addressTags, favoriteTags, slugPathParam, enumQueryParam, dateQueryParam };