import {
  commonErrors,
  dateQueryParam,
  dateTimeQueryParam,
  enumQueryParam,
  paginationParameters,
  paginatedResponse,
  queryParam,
  ref,
  successResponse,
  uuid,
  uuidPathParam,
} from '../helpers.js';
import type { PathSpec } from '../helpers.js';
import type { ParameterObject } from '../types.js';

// --------------------------------------------------------------------------
// Inventory (admin)
// --------------------------------------------------------------------------
const inventoryTags = ['Inventory (Admin)'];

export const inventoryPaths: Record<string, PathSpec> = {
  '/admin/ingredients': {
    get: {
      tags: inventoryTags,
      summary: 'Daftar bahan baku',
      operationId: 'adminListIngredients',
      parameters: [
        ...paginationParameters(),
        queryParam('search', { type: 'string' }, 'Cari nama atau SKU.'),
        enumQueryParam('baseUnit', ['gram', 'ml', 'piece', 'pack', 'sachet', 'liter', 'kg'], 'Filter satuan dasar.'),
        queryParam('isActive', { type: 'boolean' }, 'Default true.'),
        queryParam('belowReorderLevel', { type: 'boolean' }, 'Hanya bahan dengan stok di bawah reorder level.'),
      ],
      responses: {
        '200': paginatedResponse(ref('Ingredient')),
        '401': commonErrors.unauthorized,
        '403': commonErrors.forbidden,
      },
    },
    post: {
      tags: inventoryTags,
      summary: 'Tambah bahan baku',
      operationId: 'adminCreateIngredient',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: ref('CreateIngredientRequest'),
            example: { sku: 'ING-BEAN-ARAB-1KG', name: 'Biji kopi arabika', baseUnit: 'gram', reorderLevel: 2000 },
          },
        },
      },
      responses: {
        '201': successResponse(ref('Ingredient'), 'Bahan baku dibuat.'),
        '400': commonErrors.validation,
        '401': commonErrors.unauthorized,
        '403': commonErrors.forbidden,
        '409': commonErrors.conflict,
      },
    },
  },

  '/admin/ingredients/{id}': {
    get: {
      tags: inventoryTags,
      summary: 'Detail bahan baku',
      operationId: 'adminIngredientDetail',
      parameters: [uuidPathParam('id', 'ID bahan baku.')],
      responses: {
        '200': successResponse(ref('Ingredient')),
        '401': commonErrors.unauthorized,
        '403': commonErrors.forbidden,
        '404': commonErrors.notFound,
      },
    },
    patch: {
      tags: inventoryTags,
      summary: 'Ubah bahan baku',
      operationId: 'adminUpdateIngredient',
      parameters: [uuidPathParam('id', 'ID bahan baku.')],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: ref('UpdateIngredientRequest'),
            example: { reorderLevel: 2500, isActive: false },
          },
        },
      },
      responses: {
        '200': successResponse(ref('Ingredient')),
        '400': commonErrors.validation,
        '401': commonErrors.unauthorized,
        '403': commonErrors.forbidden,
        '404': commonErrors.notFound,
      },
    },
  },

  '/admin/recipes': {
    get: {
      tags: inventoryTags,
      summary: 'Resep (komposisi bahan per varian)',
      description:
        'Setiap baris menyatakan kebutuhan bahan untuk membuat satu unit varian produk, ' +
        'dalam satuan dasar bahan tersebut.',
      operationId: 'adminListRecipes',
      parameters: [
        ...paginationParameters(),
        queryParam('variantId', { type: 'string', format: 'uuid' }, 'Filter satu varian.'),
        queryParam('productId', { type: 'string', format: 'uuid' }, 'Filter seluruh varian satu produk.'),
        queryParam('ingredientId', { type: 'string', format: 'uuid' }, 'Filter satu bahan.'),
      ],
      responses: {
        '200': paginatedResponse(ref('RecipeItem')),
        '401': commonErrors.unauthorized,
        '403': commonErrors.forbidden,
      },
    },
    put: {
      tags: inventoryTags,
      summary: 'Simpan resep varian',
      description: 'Mengganti keseluruhan komposisi satu varian dalam satu transaksi (delete + insert).',
      operationId: 'adminSaveRecipe',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: ref('SaveRecipeRequest'),
            example: {
              productVariantId: '44444444-4444-4444-8444-444444444444',
              items: [{ ingredientId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', quantityInBaseUnit: 18, expectedWastePercent: 5 }],
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Resep tersimpan beserta hasil hitung HPP.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: {
                    type: 'object',
                    properties: {
                      productVariantId: uuid,
                      items: { type: 'array', items: ref('RecipeItem') },
                      costPerUnitIdr: { type: 'integer', nullable: true, description: 'HPP per unit bila harga bahan tersedia.' },
                    },
                  },
                },
              },
            },
          },
        },
        '400': commonErrors.validation,
        '401': commonErrors.unauthorized,
        '403': commonErrors.forbidden,
        '404': commonErrors.notFound,
      },
    },
  },

  '/admin/stock-locations': {
    get: {
      tags: inventoryTags,
      summary: 'Lokasi stok',
      description: 'Lokasi stok terdaftar per cabang (mis. Gudang Utama, Cold Storage).',
      operationId: 'adminListStockLocations',
      parameters: [...paginationParameters(), queryParam('branchId', { type: 'string', format: 'uuid' }, 'Filter cabang.')],
      responses: {
        '200': paginatedResponse(ref('StockLocation')),
        '401': commonErrors.unauthorized,
        '403': commonErrors.forbidden,
      },
    },
    post: {
      tags: inventoryTags,
      summary: 'Tambah lokasi stok',
      operationId: 'adminCreateStockLocation',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'object', required: ['branchId', 'name'], properties: { branchId: uuid, name: { type: 'string', maxLength: 80 } } },
            example: { branchId: '11111111-1111-4111-8111-111111111111', name: 'Cold Storage' },
          },
        },
      },
      responses: {
        '201': successResponse(ref('StockLocation'), 'Lokasi stok dibuat.'),
        '400': commonErrors.validation,
        '401': commonErrors.unauthorized,
        '403': commonErrors.forbidden,
        '409': commonErrors.conflict,
      },
    },
  },

  '/admin/stock/movements': {
    get: {
      tags: inventoryTags,
      summary: 'Mutasi stok',
      description: 'Buku besar stok: pembelian, pemakaian order, pembuangan, penyesuaian, dan transfer.',
      operationId: 'adminListStockMovements',
      parameters: [
        ...paginationParameters(),
        queryParam('stockLocationId', { type: 'string', format: 'uuid' }, 'Filter lokasi stok.'),
        queryParam('branchId', { type: 'string', format: 'uuid' }, 'Filter cabang lewat lokasi stok.'),
        queryParam('ingredientId', { type: 'string', format: 'uuid' }, 'Filter bahan.'),
        enumQueryParam(
          'movementType',
          ['purchase', 'order_consumption', 'waste', 'adjustment', 'transfer_in', 'transfer_out'],
          'Filter jenis mutasi.',
        ),
        dateQueryParam('from', 'Tanggal awal.'),
        dateQueryParam('to', 'Tanggal akhir.'),
      ],
      responses: {
        '200': paginatedResponse(ref('InventoryMovement')),
        '401': commonErrors.unauthorized,
        '403': commonErrors.forbidden,
      },
    },
    post: {
      tags: inventoryTags,
      summary: 'Catat mutasi stok',
      description: [
        'Satu-satunya cara mengubah stok. Stok tidak pernah di-update langsung, selalu lewat mutasi.',
        '',
        '- `quantityDelta` positif menambah, negatif mengurangi.',
        '- Beban bahan saat order dibuat dicatat otomatis sebagai mutasi `order_consumption`.',
        '- Stok cukup diperiksa dalam transaksi agar tidak bisa_minus.',
      ].join('\n'),
      operationId: 'adminCreateStockMovement',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: ref('CreateStockMovementRequest'),
            example: {
              stockLocationId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
              ingredientId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
              quantityDelta: 5000,
              movementType: 'purchase',
              notes: 'Pembelianminggu ini',
            },
          },
        },
      },
      responses: {
        '201': {
          description: 'Mutasi tercatat beserta saldo stok setelahnya.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: {
                    type: 'object',
                    properties: {
                      movement: ref('InventoryMovement'),
                      stockOnHand: { type: 'number', description: 'Saldo setelah mutasi ini.' },
                    },
                  },
                },
              },
            },
          },
        },
        '400': commonErrors.validation,
        '401': commonErrors.unauthorized,
        '403': commonErrors.forbidden,
        '404': commonErrors.notFound,
        '422': {
          description: 'Stok tidak cukup untuk pengurangan.',
          content: { 'application/json': { schema: ref('ErrorResponse') } },
        },
      },
    },
  },

  '/admin/stock/snapshot': {
    get: {
      tags: inventoryTags,
      summary: 'Saldo stok terkini',
      description: 'Saldo hasil penjumlahan seluruh mutasi per bahan per lokasi.',
      operationId: 'adminStockSnapshot',
      parameters: [
        queryParam('stockLocationId', { type: 'string', format: 'uuid' }, 'Filter lokasi stok.'),
        queryParam('branchId', { type: 'string', format: 'uuid' }, 'Filter cabang.'),
        queryParam('belowReorderLevelOnly', { type: 'boolean' }, 'Hanya bahan yang perlu dipesan ulang.'),
      ],
      responses: {
        '200': {
          description: 'Saldo stok.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: { type: 'array', items: ref('StockSnapshotItem') },
                },
              },
            },
          },
        },
        '401': commonErrors.unauthorized,
        '403': commonErrors.forbidden,
      },
    },
  },
};

// --------------------------------------------------------------------------
// Community moments
// --------------------------------------------------------------------------
const momentTags = ['Community Moments'];

export const momentPaths: Record<string, PathSpec> = {
  '/moments': {
    get: {
      tags: momentTags,
      summary: 'Galeri momen komunitas',
      description:
        'Publik hanya melihat momen yang sudah disetujui moderasi (approved). ' +
        'Staff melihat semuanya, termasuk yang masih pending.',
      operationId: 'momentList',
      parameters: [
        ...paginationParameters(),
        enumQueryParam('eventType', ['community', 'birthday', 'wedding', 'event', 'other'], 'Filter jenis acara.'),
        queryParam('userId', { type: 'string', format: 'uuid' }, 'Filter satu pengguna.'),
        booleanQueryParamSafe('mine', 'Hanya momen milik user yang sedang login.'),
        queryParam('search', { type: 'string' }, 'Cari pada judul atau caption.'),
      ],
      responses: {
        '200': paginatedResponse(ref('Moment')),
        '401': commonErrors.unauthorized,
      },
    },
    post: {
      tags: momentTags,
      summary: 'Unggah momen',
      description:
        'Media diunggah lebih dulu ke object storage, lalu(storageKey, mediaType) dikirim di sini. ' +
        'Momen baru berstatus pending dan menunggu moderasi.',
      operationId: 'momentCreate',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: ref('CreateMomentRequest'),
            example: {
              title: 'Ngopi barengPaddinggiatan',
              caption: 'Santai sore di Semoet Rama',
              eventType: 'community',
              media: [
                { storageKey: 'moments/2026/01/abc.jpg', mediaType: 'image', sortOrder: 0 },
              ],
            },
          },
        },
      },
      responses: {
        '201': {
          description: 'Momen dibuat dengan status pending.',
          content: {
            'application/json': {
              schema: { type: 'object', properties: { success: { type: 'boolean', enum: [true] }, data: ref('Moment') } },
            },
          },
        },
        '400': commonErrors.validation,
        '401': commonErrors.unauthorized,
        '422': commonErrors.unprocessable,
      },
    },
  },

  '/moments/{id}': {
    get: {
      tags: momentTags,
      summary: 'Detail momen',
      operationId: 'momentDetail',
      parameters: [uuidPathParam('id', 'ID momen.')],
      responses: {
        '200': successResponse(ref('Moment')),
        '401': commonErrors.unauthorized,
        '404': commonErrors.notFound,
      },
    },
    patch: {
      tags: momentTags,
      summary: 'Ubah momen saya',
      description: 'Momen yang sudah disetujui akan kembali ke status pending setelah diubah.',
      operationId: 'momentUpdate',
      parameters: [uuidPathParam('id', 'ID momen.')],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: ref('UpdateMomentRequest'),
            example: { caption: 'Tambah foto baru' },
          },
        },
      },
      responses: {
        '200': successResponse(ref('Moment')),
        '400': commonErrors.validation,
        '401': commonErrors.unauthorized,
        '404': commonErrors.notFound,
        '403': commonErrors.forbidden,
      },
    },
    delete: {
      tags: momentTags,
      summary: 'Hapus momen',
      description: 'Pemilik momen boleh menghapus sendiri; staff dapat memoderasi momen siapa pun.',
      operationId: 'momentDelete',
      parameters: [uuidPathParam('id', 'ID momen.')],
      responses: {
        '200': successResponse({ type: 'object', properties: { id: uuid, deleted: { type: 'boolean' } } }, 'Momen dihapus.'),
        '401': commonErrors.unauthorized,
        '403': commonErrors.forbidden,
        '404': commonErrors.notFound,
      },
    },
  },

  '/admin/moments/moderate': {
    patch: {
      tags: momentTags,
      summary: 'Moderasi momen (staff)',
      operationId: 'adminModerateMoment',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['id', 'moderationStatus'],
              properties: {
                id: uuid,
                moderationStatus: { type: 'string', enum: ['pending', 'approved', 'rejected', 'hidden'] },
                note: { type: 'string', nullable: true },
              },
            },
            example: { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', moderationStatus: 'approved' },
          },
        },
      },
      responses: {
        '200': successResponse(ref('Moment'), 'Status moderasi diperbarui.'),
        '400': commonErrors.validation,
        '401': commonErrors.unauthorized,
        '403': commonErrors.forbidden,
        '404': commonErrors.notFound,
      },
    },
  },
};

// --------------------------------------------------------------------------
// Notification
// --------------------------------------------------------------------------
const notificationTags = ['Notification'];

export const notificationPaths: Record<string, PathSpec> = {
  '/me/notifications': {
    get: {
      tags: notificationTags,
      summary: 'Notifikasi saya',
      operationId: 'notificationList',
      parameters: [
        ...paginationParameters(),
        enumQueryParam('channel', ['in_app', 'push', 'email', 'sms'], 'Filter kanal.'),
        enumQueryParam('status', ['queued', 'sent', 'failed', 'read'], 'Filter status.'),
        booleanQueryParamSafe('unreadOnly', 'Hanya yang belum dibaca.'),
      ],
      responses: {
        '200': {
          description: 'Daftar notifikasi.',
          content: {
            'application/json': {
              schema: {
                allOf: [paginatedResponse(ref('Notification'))],
                type: 'object',
                properties: { meta: { ...(ref('PaginationMeta') as object), unreadCount: { type: 'integer' } } as object },
              },
            },
          },
        },
        '401': commonErrors.unauthorized,
      },
    },
  },

  '/me/notifications/{id}/read': {
    post: {
      tags: notificationTags,
      summary: 'Tandai notifikasi sudah dibaca',
      operationId: 'notificationMarkRead',
      parameters: [uuidPathParam('id', 'ID notifikasi.')],
      responses: {
        '200': successResponse(ref('Notification'), 'Notifikasi ditandai dibaca.'),
        '401': commonErrors.unauthorized,
        '404': commonErrors.notFound,
      },
    },
  },

  '/me/notifications/read-all': {
    post: {
      tags: notificationTags,
      summary: 'Tandai semua notifikasi dibaca',
      operationId: 'notificationMarkAllRead',
      responses: {
        '200': {
          description: 'Semua notifikasi ditandai dibaca.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: { type: 'object', properties: { updated: { type: 'integer' } } },
                },
              },
            },
          },
        },
        '401': commonErrors.unauthorized,
      },
    },
  },

  '/me/devices': {
    get: {
      tags: notificationTags,
      summary: 'Daftar perangkat terdaftar',
      operationId: 'notificationListDevices',
      parameters: [...paginationParameters(), enumQueryParam('provider', ['fcm', 'apns', 'web_push'], 'Filter provider.')],
      responses: {
        '200': paginatedResponse(ref('NotificationDevice')),
        '401': commonErrors.unauthorized,
      },
    },
    post: {
      tags: notificationTags,
      summary: 'Daftarkan perangkat untuk push',
      description: [
        'Token perangkat disimpan sebagai hash, bukan mentah. Mengirim ulang token yang sama',
        'memperbarui last_seen_at sehingga tetap satu perangkat.',
      ].join('\n'),
      operationId: 'notificationRegisterDevice',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: ref('RegisterDeviceRequest'),
            example: { provider: 'fcm', token: 'fcm-registration-token-abc123', deviceLabel: 'iPhone 15' },
          },
        },
      },
      responses: {
        '201': successResponse(ref('NotificationDevice'), 'Perangkat terdaftar.'),
        '400': commonErrors.validation,
        '401': commonErrors.unauthorized,
      },
    },
  },

  '/me/devices/{id}': {
    delete: {
      tags: notificationTags,
      summary: 'Cabut perangkat',
      description: 'Menonaktifkan token perangkat tanpa menghapusnya, agar riwayat tetap auditable.',
      operationId: 'notificationRevokeDevice',
      parameters: [uuidPathParam('id', 'ID perangkat.')],
      responses: {
        '200': successResponse({ type: 'object', properties: { id: uuid, revoked: { type: 'boolean' } } }, 'Perangkat dicabut.'),
        '401': commonErrors.unauthorized,
        '404': commonErrors.notFound,
      },
    },
  },

  '/admin/notifications': {
    post: {
      tags: notificationTags,
      summary: 'Kirim notifikasi (staff)',
      description: 'Notifikasi masuk antrean dengan status queued lalu dikirim worker.',
      operationId: 'adminSendNotification',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: ref('SendNotificationRequest'),
            example: {
              userIds: ['eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'],
              channel: 'push',
              title: 'Promo akhir bulan',
              body: 'Diskon 25% sampai akhir bulan.',
              actionUrl: 'semoet://promo/akhir-bulan',
              scheduledAt: '2026-01-10T09:00:00+07:00',
            },
          },
        },
      },
      responses: {
        '201': {
          description: 'Notifikasi dijadwalkan.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: { type: 'object', properties: { queued: { type: 'integer' } } },
                },
              },
            },
          },
        },
        '400': commonErrors.validation,
        '401': commonErrors.unauthorized,
        '403': commonErrors.forbidden,
      },
    },
  },
};

// --------------------------------------------------------------------------
// Chat / support
// --------------------------------------------------------------------------
const chatTags = ['Chat & Support'];

export const chatPaths: Record<string, PathSpec> = {
  '/chat/conversations': {
    get: {
      tags: chatTags,
      summary: 'Daftar percakapan',
      description: 'Customer melihat percakapannya sendiri; staff melihat antrean semua percakapan.',
      operationId: 'chatListConversations',
      parameters: [
        ...paginationParameters(),
        enumQueryParam('status', ['open', 'waiting', 'resolved', 'closed'], 'Filter status percakapan.'),
        queryParam('userId', { type: 'string', format: 'uuid' }, 'Filter per customer (staff/admin saja).'),
        queryParam('assignedStaffId', { type: 'string', format: 'uuid' }, 'Filter per staff.'),
        booleanQueryParamSafe('unassignedOnly', 'Hanya yang belum ada staffnya (staff/admin saja).'),
      ],
      responses: {
        '200': paginatedResponse(ref('ChatConversation')),
        '401': commonErrors.unauthorized,
      },
    },
    post: {
      tags: chatTags,
      summary: 'Mulai percakapan',
      description:
        'Percakapan yang masih open akan dipakai kembali daripada membuat yang baru, ' +
        'supaya riwayat customer tidak terpecah.',
      operationId: 'chatCreateConversation',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: ref('CreateConversationRequest'),
            example: { topic: 'Pertanyaan soal booking event', initialMessage: 'Halo, saya mau tanya paket.event' },
          },
        },
      },
      responses: {
        '201': successResponse(ref('ChatConversation'), 'Percakapan dibuat.'),
        '400': commonErrors.validation,
        '401': commonErrors.unauthorized,
      },
    },
  },

  '/chat/conversations/{id}': {
    get: {
      tags: chatTags,
      summary: 'Detail percakapan',
      operationId: 'chatConversationDetail',
      parameters: [uuidPathParam('id', 'ID percakapan.')],
      responses: {
        '200': successResponse(ref('ChatConversation')),
        '401': commonErrors.unauthorized,
        '403': commonErrors.forbidden,
        '404': commonErrors.notFound,
      },
    },
    patch: {
      tags: chatTags,
      summary: 'Ubah status percakapan',
      description: 'Customer menutup dari resolved/closed; staff bisa assign dan mengubah status.',
      operationId: 'chatUpdateConversation',
      parameters: [uuidPathParam('id', 'ID percakapan.')],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: ref('UpdateConversationRequest'),
            example: { status: 'closed' },
          },
        },
      },
      responses: {
        '200': successResponse(ref('ChatConversation'), 'Percakapan diperbarui.'),
        '400': commonErrors.validation,
        '401': commonErrors.unauthorized,
        '403': commonErrors.forbidden,
        '404': commonErrors.notFound,
      },
    },
  },

  '/chat/conversations/{id}/messages': {
    get: {
      tags: chatTags,
      summary: 'Riwayat pesan',
      description: 'Bisa dipaginasi ke belakang lewat `before` untuk load-more di mobile.',
      operationId: 'chatListMessages',
      parameters: [
        uuidPathParam('id', 'ID percakapan.'),
        ...paginationParameters(),
        dateTimeQueryParam('before', 'Ambil pesan sebelum waktu ini (load-more).'),
      ],
      responses: {
        '200': paginatedResponse(ref('ChatMessage')),
        '401': commonErrors.unauthorized,
        '403': commonErrors.forbidden,
        '404': commonErrors.notFound,
      },
    },
    post: {
      tags: chatTags,
      summary: 'Kirim pesan',
      description:
        'Customer mengirim sebagai `customer`, staff sebagai `staff`. ' +
        'Saat customer mengirim pesan pada percakapan waiting, status otomatis kembali jadi open.',
      operationId: 'chatSendMessage',
      parameters: [uuidPathParam('id', 'ID percakapan.')],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: ref('SendChatMessageRequest'),
            example: { body: 'Paket event untuk 40 orang tersedia hari Minggu?', attachmentStorageKey: null },
          },
        },
      },
      responses: {
        '201': successResponse(ref('ChatMessage'), 'Pesan terkirim.'),
        '400': commonErrors.validation,
        '401': commonErrors.unauthorized,
        '403': commonErrors.forbidden,
        '404': commonErrors.notFound,
      },
    },
  },

  '/admin/chat/conversations/{id}/assign': {
    post: {
      tags: chatTags,
      summary: 'Tugaskan percakapan ke staff',
      description: 'Bila assignedStaffId tidak dikirim, sistem memilih staff dengan beban percakapan aktif paling sedikit.',
      operationId: 'adminAssignConversation',
      parameters: [uuidPathParam('id', 'ID percakapan.')],
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { assignedStaffId: { type: 'string', format: 'uuid', nullable: true } },
            },
            example: { assignedStaffId: '12121212-1212-4212-8212-121212121212' },
          },
        },
      },
      responses: {
        '200': successResponse(ref('ChatConversation'), 'Percakapan ditugaskan.'),
        '401': commonErrors.unauthorized,
        '403': commonErrors.forbidden,
        '404': commonErrors.notFound,
      },
    },
  },
};

// --------------------------------------------------------------------------
// Gamification
// --------------------------------------------------------------------------
const gamificationTags = ['Gamification'];

export const gamificationPaths: Record<string, PathSpec> = {
  '/gamification/activities': {
    get: {
      tags: gamificationTags,
      summary: 'Daftar aktivitas',
      operationId: 'gamificationListActivities',
      parameters: [
        ...paginationParameters(),
        enumQueryParam('activityType', ['daily_checkin', 'spin_wheel', 'challenge', 'other'], 'Filter jenis aktivitas.'),
      ],
      responses: {
        '200': paginatedResponse(ref('GamificationActivity')),
      },
    },
  },

  '/gamification/activities/{code}': {
    get: {
      tags: gamificationTags,
      summary: 'Detail aktivitas',
      description:
        'Untuk pengguna yang sudah login, response juga berisi `canPlay` dan sisa kesempatan ' +
        'hari ini supaya client tidak perlu menebak.',
      operationId: 'gamificationActivityDetail',
      parameters: [{ name: 'code', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        '200': {
          description: 'Detail aktivitas.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: {
                    type: 'object',
                    properties: {
                      activity: ref('GamificationActivity'),
                      rewards: { type: 'array', items: ref('GamificationReward') },
                      canPlay: { type: 'boolean' },
                      playsToday: { type: 'integer' },
                      maxPlaysPerDay: { type: 'integer', nullable: true },
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

  '/gamification/play': {
    post: {
      tags: gamificationTags,
      summary: 'Mainkan aktivitas dan dapatkan hadiah',
      description: [
        'Hadiah dipilih dengan bobot (weight) sesuai bobot yang ditentukan aktivitas.',
        '',
        '- Batas main per hari ditegakkan di dalam transaksi dengan advisory lock.',
        '- `idempotency_key` disimpan di gamification_plays sehingga tap ganda tidak dapat',
        '  tidak bisa mendapat dua hadiah.',
        '- Playing untuk aktivitas berhadiah voucher menerbitkan voucher otomatis.',
      ].join('\n'),
      operationId: 'gamificationPlay',
      parameters: [
        {
          name: 'Idempotency-Key',
          in: 'header',
          required: false,
          description: 'Kunci unik percobaan main.',
          schema: { type: 'string', minLength: 8, maxLength: 128, pattern: '^[A-Za-z0-9._:-]+$' },
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['activityCode'],
              properties: { activityCode: { type: 'string', example: 'daily_checkin' } },
            },
            example: { activityCode: 'daily_checkin' },
          },
        },
      },
      responses: {
        '201': {
          description: 'Hasil undian / check-in.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: {
                    type: 'object',
                    properties: {
                      play: ref('GamificationPlay'),
                      pointsEarned: { type: 'integer' },
                      voucher: { ...(ref('UserVoucher') as object), nullable: true } as object,
                      message: { type: 'string', description: 'Teks untuk ditampilkan ke user.' },
                      playsToday: { type: 'integer' },
                      maxPlaysPerDay: { type: 'integer', nullable: true },
                    },
                  },
                },
              },
            },
          },
        },
        '400': commonErrors.validation,
        '401': commonErrors.unauthorized,
        '404': commonErrors.notFound,
        '422': {
          description: 'Batas main harian sudah tercapai atau aktivitas sedang tidak aktif.',
          content: { 'application/json': { schema: ref('ErrorResponse') } },
        },
      },
    },
  },

  '/me/gamification/history': {
    get: {
      tags: gamificationTags,
      summary: 'Riwayat main',
      operationId: 'gamificationHistory',
      parameters: [
        ...paginationParameters(),
        queryParam('activityCode', { type: 'string' }, 'Filter satu aktivitas.'),
      ],
      responses: {
        '200': paginatedResponse(ref('GamificationPlay')),
        '401': commonErrors.unauthorized,
      },
    },
  },
};

// --------------------------------------------------------------------------
// AI assistant
// --------------------------------------------------------------------------
const aiTags = ['AI Assistant'];

export const aiPaths: Record<string, PathSpec> = {
  '/ai/chat': {
    post: {
      tags: aiTags,
      summary: 'Tanya asisten AI',
      description: [
        'Menanyakan menu, promo, lokasi, atau status pesanan dalam bahasa natural.',
        '',
        '- Setiap percakapan dan pesan tersimpan di ai_conversations / ai_messages.',
        '- Metadata pemanggilan (model, token, latency, hasil) dicatat di ai_query_logs.',
        '- Membatasi 20 permintaan per menit per pengguna.',
        '- Bila AI_ASSISTANT_ENABLED=false, endpoint mengembalikan 503.',
      ].join('\n'),
      operationId: 'aiChat',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: ref('AiChatRequest'),
            example: {
              message: 'Rekomendasi kopi susu yang enak buat anak-anak?',
              conversationId: '13131313-1313-4313-8313-131313131313',
              context: { orderId: '77777777-7777-4777-8777-777777777777' },
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Jawaban asisten.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: {
                    type: 'object',
                    properties: {
                      conversationId: uuid,
                      messageId: uuid,
                      reply: { type: 'string' },
                      suggestedProducts: { type: 'array', items: ref('Product') },
                      usage: {
                        type: 'object',
                        nullable: true,
                        properties: {
                          promptTokens: { type: 'integer', nullable: true },
                          completionTokens: { type: 'integer', nullable: true },
                          latencyMs: { type: 'integer', nullable: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        '400': commonErrors.validation,
        '401': commonErrors.unauthorized,
        '429': commonErrors.rateLimited,
        '503': {
          description: 'Layanan AI dimatikan atau sedang tidak tersedia.',
          content: { 'application/json': { schema: ref('ErrorResponse') } },
        },
      },
    },
  },

  '/ai/conversations': {
    get: {
      tags: aiTags,
      summary: 'Riwayat percakapan AI',
      operationId: 'aiListConversations',
      parameters: [
        ...paginationParameters(),
        enumQueryParam('status', ['open', 'closed'], 'Filter status.'),
        enumQueryParam('purpose', ['customer_support', 'admin_assistant'], 'Filter tujuan percakapan.'),
      ],
      responses: {
        '200': paginatedResponse(ref('AiConversation')),
        '401': commonErrors.unauthorized,
      },
    },
  },

  '/ai/conversations/{id}': {
    get: {
      tags: aiTags,
      summary: 'Detail percakapan AI',
      operationId: 'aiConversationDetail',
      parameters: [uuidPathParam('id', 'ID percakapan AI.')],
      responses: {
        '200': successResponse(ref('AiConversation')),
        '401': commonErrors.unauthorized,
        '404': commonErrors.notFound,
      },
    },
  },

  '/ai/conversations/{id}/messages': {
    get: {
      tags: aiTags,
      summary: 'Pesan dalam percakapan AI',
      operationId: 'aiListMessages',
      parameters: [uuidPathParam('id', 'ID percakapan AI.'), ...paginationParameters()],
      responses: {
        '200': paginatedResponse(ref('AiMessage')),
        '401': commonErrors.unauthorized,
        '404': commonErrors.notFound,
      },
    },
  },

  '/ai/conversations/{id}/close': {
    post: {
      tags: aiTags,
      summary: 'Tutup percakapan AI',
      description: 'Percakapan yang ditutup tidak bisa dilanjutkan; buat yang baru bila perlu.',
      operationId: 'aiCloseConversation',
      parameters: [uuidPathParam('id', 'ID percakapan AI.')],
      responses: {
        '200': successResponse(ref('AiConversation'), 'Percakapan ditutup.'),
        '401': commonErrors.unauthorized,
        '404': commonErrors.notFound,
      },
    },
  },
};

// --------------------------------------------------------------------------
// Admin
// --------------------------------------------------------------------------
const adminTags = ['Admin'];

export const adminPaths: Record<string, PathSpec> = {
  '/admin/dashboard/sales': {
    get: {
      tags: adminTags,
      summary: 'Dashboard penjualan harian',
      description:
        'Sumber data adalah view `daily_order_sales` sehingga tidak ada total duplikat yang bisa basi.',
      operationId: 'adminSalesDashboard',
      parameters: [
        ...paginationParameters(),
        queryParam('branchId', { type: 'string', format: 'uuid' }, 'Filter cabang. Staff wajib mengisi cabangnya.'),
        dateQueryParam('from', 'Tanggal awal (WIB).'),
        dateQueryParam('to', 'Tanggal akhir (WIB).'),
      ],
      responses: {
        '200': paginatedResponse(ref('AdminDailySales')),
        '401': commonErrors.unauthorized,
        '403': commonErrors.forbidden,
      },
    },
  },

  '/admin/dashboard/sales-summary': {
    get: {
      tags: adminTags,
      summary: 'Ringkasan penjualan',
      description: 'Total omzet, jumlah order, rata-rata nilai pesanan, dan sebaran status order.',
      operationId: 'adminSalesSummary',
      parameters: [
        queryParam('branchId', { type: 'string', format: 'uuid' }, 'Filter cabang.'),
        dateQueryParam('from', 'Tanggal awal.'),
        dateQueryParam('to', 'Tanggal akhir.'),
      ],
      responses: {
        '200': successResponse(ref('AdminSalesSummary')),
        '401': commonErrors.unauthorized,
        '403': commonErrors.forbidden,
      },
    },
  },

  '/admin/dashboard/top-products': {
    get: {
      tags: adminTags,
      summary: 'Produk terlaris',
      operationId: 'adminTopProducts',
      parameters: [
        queryParam('branchId', { type: 'string', format: 'uuid' }, 'Filter cabang.'),
        dateQueryParam('from', 'Tanggal awal.'),
        dateQueryParam('to', 'Tanggal akhir.'),
        queryParam('limit', { type: 'integer', default: 10, maximum: 50 }, 'Jumlah produk.'),
      ],
      responses: {
        '200': {
          description: 'Produk terlaris.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        productId: uuid,
                        productName: { type: 'string' },
                        totalQuantity: { type: 'integer' },
                        totalRevenueIdr: { type: 'integer' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        '401': commonErrors.unauthorized,
        '403': commonErrors.forbidden,
      },
    },
  },

  '/admin/dashboard/overview': {
    get: {
      tags: adminTags,
      summary: 'Snapshot operasional',
      description: 'Ringkasan cepat untuk layar dashboard: order aktif, stok menipis, chat tertunda, momen pending.',
      operationId: 'adminOverview',
      responses: {
        '200': {
          description: 'Snapshot operasional.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: ref('AdminOperationalSnapshot'),
                },
              },
            },
          },
        },
        '401': commonErrors.unauthorized,
        '403': commonErrors.forbidden,
      },
    },
  },

  '/admin/audit-logs': {
    get: {
      tags: adminTags,
      summary: 'Audit log',
      description: 'Catatan perubahan data sensitif: siapa, apa yang diubah, dari nilai lama ke nilai baru.',
      operationId: 'adminListAuditLogs',
      parameters: [
        ...paginationParameters(),
        queryParam('actorUserId', { type: 'string', format: 'uuid' }, 'Filter pelaku.'),
        queryParam('entityType', { type: 'string' }, 'Filter jenis entitas, mis. order.'),
        queryParam('entityId', { type: 'string', format: 'uuid' }, 'Filter satu entitas.'),
        queryParam('action', { type: 'string' }, 'Filter aksi, mis. order.status.update.'),
        dateTimeQueryParam('from', 'Tanggal awal.'),
        dateTimeQueryParam('to', 'Tanggal akhir.'),
      ],
      responses: {
        '200': paginatedResponse(ref('AuditLog')),
        '401': commonErrors.unauthorized,
        '403': commonErrors.forbidden,
      },
    },
  },

  '/admin/roles': {
    get: {
      tags: adminTags,
      summary: 'Daftar role',
      operationId: 'adminListRoles',
      parameters: [...paginationParameters(), queryParam('code', { type: 'string' }, 'Filter kode role.')],
      responses: {
        '200': paginatedResponse(ref('Role')),
        '401': commonErrors.unauthorized,
        '403': commonErrors.forbidden,
      },
    },
    post: {
      tags: adminTags,
      summary: 'Buat role',
      description: 'Role bawaan (super_admin, admin, branch_manager, staff, customer) tidak bisa dihapus.',
      operationId: 'adminCreateRole',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: ref('CreateRoleRequest'),
            example: { code: 'kitchen_staff', name: 'Staff Dapur', description: 'Melihat dan menyiapkan order dapur', permissionIds: [] },
          },
        },
      },
      responses: {
        '201': successResponse(ref('Role'), 'Role dibuat.'),
        '400': commonErrors.validation,
        '401': commonErrors.unauthorized,
        '403': commonErrors.forbidden,
        '409': commonErrors.conflict,
      },
    },
  },

  '/admin/roles/{id}': {
    patch: {
      tags: adminTags,
      summary: 'Ubah role dan permission-nya',
      operationId: 'adminUpdateRole',
      parameters: [uuidPathParam('id', 'ID role.')],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: ref('UpdateRoleRequest'),
            example: { name: 'Staff Dapur', permissionIds: ['14141414-1414-4414-8414-141414141414'] },
          },
        },
      },
      responses: {
        '200': successResponse(ref('Role'), 'Role diperbarui.'),
        '400': commonErrors.validation,
        '401': commonErrors.unauthorized,
        '403': commonErrors.forbidden,
        '404': commonErrors.notFound,
      },
    },
  },

  '/admin/permissions': {
    get: {
      tags: adminTags,
      summary: 'Daftar permission',
      operationId: 'adminListPermissions',
      parameters: [
        queryParam('resource', { type: 'string' }, 'Filter resource, mis. order.'),
        enumQueryParam('action', ['create', 'read', 'update', 'delete', 'manage'], 'Filter action.'),
      ],
      responses: {
        '200': {
          description: 'Daftar permission.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: { type: 'array', items: ref('Permission') },
                },
              },
            },
          },
        },
        '401': commonErrors.unauthorized,
        '403': commonErrors.forbidden,
      },
    },
  },

  '/admin/users': {
    get: {
      tags: adminTags,
      summary: 'Daftar user',
      operationId: 'adminListUsers',
      parameters: [
        ...paginationParameters(),
        queryParam('search', { type: 'string' }, 'Cari nama, email, atau telepon.'),
        enumQueryParam('status', ['active', 'pending', 'suspended', 'deleted'], 'Filter status akun.'),
        queryParam('roleCode', { type: 'string' }, 'Filter berdasarkan role yang dimiliki.'),
      ],
      responses: {
        '200': paginatedResponse(ref('AdminUser')),
        '401': commonErrors.unauthorized,
        '403': commonErrors.forbidden,
      },
    },
  },

  '/admin/users/{id}/roles': {
    post: {
      tags: adminTags,
      summary: 'Tetapkan role untuk user',
      description:
        'Melakukan replace: role yang tidak ada di `roleIds` akan dilepas dari user tersebut. ' +
        'Perubahan langsung berlaku pada request berikutnya karena authorize membaca role dari DB.',
      operationId: 'adminAssignUserRoles',
      parameters: [uuidPathParam('id', 'ID user.')],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['roleIds'],
              properties: { roleIds: { type: 'array', items: uuid, description: 'Role yang harus dimiliki user.' } },
            },
            example: { roleIds: ['12121212-1212-4212-8212-121212121212'] },
          },
        },
      },
      responses: {
        '200': {
          description: 'Role diperbarui.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: { type: 'object', properties: { userId: uuid, roleIds: { type: 'array', items: uuid } } },
                },
              },
            },
          },
        },
        '400': commonErrors.validation,
        '401': commonErrors.unauthorized,
        '403': commonErrors.forbidden,
        '404': commonErrors.notFound,
      },
    },
  },

  '/admin/users/{id}/status': {
    patch: {
      tags: adminTags,
      summary: 'Ubah status akun user',
      description: 'Menyuspend akun akan langsung memblokir login dan akses token yang masih hidup.',
      operationId: 'adminUpdateUserStatus',
      parameters: [uuidPathParam('id', 'ID user.')],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: ref('UpdateUserStatusRequest'),
            example: { status: 'suspended', reason: 'Terindikasi penyalahgunaan promo' },
          },
        },
      },
      responses: {
        '200': successResponse(ref('AdminUser'), 'Status akun diperbarui.'),
        '400': commonErrors.validation,
        '401': commonErrors.unauthorized,
        '403': commonErrors.forbidden,
        '404': commonErrors.notFound,
      },
    },
  },

  '/health': {
    get: {
      tags: ['System'],
      summary: 'Health check',
      description: 'Dipakai load balancer dan Docker healthcheck. Tidak butuh autentikasi.',
      operationId: 'systemHealth',
      security: [],
      responses: {
        '200': {
          description: 'Service sehat.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', enum: ['ok', 'degraded'] },
                      uptimeSeconds: { type: 'number' },
                      version: { type: 'string' },
                      timestamp: { type: 'string', format: 'date-time' },
                      database: { type: 'string', enum: ['up', 'down'] },
                    },
                  },
                },
              },
            },
          },
        },
        '503': {
          description: 'Database tidak terjangkau.',
          content: { 'application/json': { schema: ref('ErrorResponse') } },
        },
      },
    },
  },
};

/** Boolean query param lokal (tanpa dependensi pada helper bersama). */
function booleanQueryParamSafe(name: string, description?: string): ParameterObject {
  return { name, in: 'query', required: false, description, schema: { type: 'boolean' } };
}