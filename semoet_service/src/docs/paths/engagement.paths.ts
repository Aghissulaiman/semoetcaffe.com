import {
  commonErrors,
  dateQueryParam,
  enumQueryParam,
  paginationParameters,
  paginatedResponse,
  queryParam,
  ref,
  successResponse,
  uuidPathParam,
} from '../helpers.js';
import type { PathSpec } from '../helpers.js';
import type { ParameterObject } from '../types.js';

// --------------------------------------------------------------------------
// Promo & voucher
// --------------------------------------------------------------------------
const promoTags = ['Promo & Voucher'];

const promoCodeParam = {
  name: 'code',
  in: 'path' as const,
  required: true,
  description: 'Kode promo (huruf besar).',
  schema: { type: 'string', minLength: 3, maxLength: 64 },
};

export const promoPaths: Record<string, PathSpec> = {
  '/promos': {
    get: {
      tags: promoTags,
      summary: 'Daftar promo yang bisa dipakai',
      description: 'Hanya promo aktif dan sedang berada dalam periode berlaku.',
      operationId: 'promoList',
      security: [],
      parameters: [
        ...paginationParameters(),
        queryParam('discountType', { type: 'string', enum: ['percentage', 'fixed', 'free_item'] }, 'Filter jenis diskon.'),
        booleanQueryParamSafe('isActive', 'Default true: hanya promo aktif.'),
        dateQueryParam('from', 'Tanggal awal periode yang dicek.'),
        dateQueryParam('to', 'Tanggal akhir periode yang dicek.'),
      ],
      responses: {
        '200': paginatedResponse(ref('PromoCampaign')),
      },
    },
  },

  '/promos/{code}': {
    get: {
      tags: promoTags,
      summary: 'Detail promo berdasarkan kode',
      description: 'Beserta produk/kategori yang eligible, minimum belanja, dan batas kuota.',
      operationId: 'promoDetailByCode',
      security: [],
      parameters: [promoCodeParam],
      responses: {
        '200': {
          description: 'Detail promo.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: {
                    type: 'object',
                    properties: {
                      promo: ref('PromoCampaign'),
                      eligibleProducts: { type: 'array', items: ref('Product') },
                      eligibleCategories: { type: 'array', items: ref('ProductCategory') },
                      remainingQuota: { type: 'integer', nullable: true },
                    },
                  },
                },
              },
            },
          },
        },
        '404': {
          description: 'Kode promo tidak ada, tidak aktif, atau sudah berakhir.',
          content: { 'application/json': { schema: ref('ErrorResponse') } },
        },
      },
    },
  },

  '/me/vouchers': {
    get: {
      tags: promoTags,
      summary: 'Voucher saya',
      description: 'Daftar voucher yang sudah diklaim ke akun user, termasuk status dan masa berlaku.',
      operationId: 'voucherListMine',
      parameters: [
        ...paginationParameters(),
        enumQueryParam('status', ['available', 'reserved', 'used', 'expired', 'revoked'], 'Filter status voucher.'),
      ],
      responses: {
        '200': paginatedResponse(ref('UserVoucher')),
        '401': commonErrors.unauthorized,
      },
    },
  },

  '/me/vouchers/{id}': {
    get: {
      tags: promoTags,
      summary: 'Detail voucher',
      operationId: 'voucherDetail',
      parameters: [uuidPathParam('id', 'ID voucher.')],
      responses: {
        '200': {
          description: 'Detail voucher beserta promo-nya.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: {
                    type: 'object',
                    properties: {
                      voucher: ref('UserVoucher'),
                      isUsable: { type: 'boolean' },
                      unusableReason: { type: 'string', nullable: true },
                    },
                  },
                },
              },
            },
          },
        },
        '401': commonErrors.unauthorized,
        '404': commonErrors.notFound,
      },
    },
  },

  '/me/vouchers/claim': {
    post: {
      tags: promoTags,
      summary: 'Klaim promo menjadi voucher',
      description:
        'Mengambil promo aktif dan menerbitkannya sebagai user_vouchers dengan kode unik. ' +
        'Kuota global dan kuota per user dicek di dalam transaksi dengan advisory lock agar ' +
        'tidak terjadi over-claim saat banyak orang mengklaim bersamaan.',
      operationId: 'voucherClaim',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['code'],
              properties: { code: { type: 'string', description: 'Kode promo yang diklaim.' } },
            },
            example: { code: 'SEMOET10' },
          },
        },
      },
      responses: {
        '201': {
          description: 'Voucher berhasil diklaim.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { success: { type: 'boolean', enum: [true] }, data: ref('UserVoucher') },
              },
            },
          },
        },
        '400': commonErrors.validation,
        '401': commonErrors.unauthorized,
        '409': {
          description: 'Voucher untuk promo ini sudah pernah diklaim oleh user.',
          content: { 'application/json': { schema: ref('ErrorResponse') } },
        },
        '422': {
          description: 'Promo tidak aktif, di luar periode, atau kuota sudah habis.',
          content: { 'application/json': { schema: ref('ErrorResponse') } },
        },
      },
    },
  },

  '/me/vouchers/validate': {
    post: {
      tags: promoTags,
      summary: 'Cek voucher sebelum checkout',
      description:
        'Menghitung diskon yang akan didapat tanpa membakar voucher. Dipakai layar checkout ' +
        'agar customer tahu nominal diskon sebelum membuat order.',
      operationId: 'voucherValidate',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: ref('ValidateVoucherRequest'),
            example: { code: 'SEMOET10', subtotalIdr: 85000, productIds: ['33333333-3333-4333-8333-333333333333'] },
          },
        },
      },
      responses: {
        '200': {
          description: 'Hasil pengecekan voucher.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: ref('VoucherValidationResult'),
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

// --------------------------------------------------------------------------
// Loyalty & points
// --------------------------------------------------------------------------
const loyaltyTags = ['Loyalty & Points'];

export const loyaltyPaths: Record<string, PathSpec> = {
  '/me/points': {
    get: {
      tags: loyaltyTags,
      summary: 'Saldo dan ringkasan poin',
      description: 'Saldo aktif, total poin seumur akun, dan poin yang akan segera kedaluwarsa.',
      operationId: 'loyaltyGetPoints',
      responses: {
        '200': successResponse(ref('PointsSummary')),
        '401': commonErrors.unauthorized,
      },
    },
  },

  '/me/points/history': {
    get: {
      tags: loyaltyTags,
      summary: 'Mutasi poin',
      description: 'Setiap earn / redeem / expire tercatat di point_ledger lengkap dengan referensi.',
      operationId: 'loyaltyPointsHistory',
      parameters: [
        ...paginationParameters(),
        enumQueryParam('mutationType', ['earn', 'redeem', 'expire', 'adjustment'], 'Filter jenis mutasi.'),
        dateQueryParam('from', 'Tanggal awal mutasi.'),
        dateQueryParam('to', 'Tanggal akhir mutasi.'),
      ],
      responses: {
        '200': paginatedResponse(ref('PointHistoryEntry')),
        '401': commonErrors.unauthorized,
      },
    },
  },

  '/loyalty/rewards': {
    get: {
      tags: loyaltyTags,
      summary: 'Katalog hadiah yang bisa ditukar dengan poin.',
      operationId: 'loyaltyListRewards',
      security: [],
      parameters: [
        ...paginationParameters(),
        enumQueryParam('rewardType', ['voucher', 'free_product', 'discount'], 'Filter jenis hadiah.'),
        queryParam('maxPoints', { type: 'integer' }, 'Hanya hadiah dengan biaya poin di bawah nilai ini.'),
      ],
      responses: {
        '200': paginatedResponse(ref('LoyaltyReward')),
      },
    },
  },

  '/loyalty/redeem': {
    post: {
      tags: loyaltyTags,
      summary: 'Tukar poin dengan hadiah',
      description: [
        'Penukaran dilakukan dalam satu transaksi dengan row lock pada user, sehingga saldo poin',
        'tidak bisa spent dua kali dari dua permintaan bersamaan.',
        '',
        '- Poin dipotong sebagai entri `redeem` negatif pada point_ledger.',
        '- Hadiah bertipe voucher menerbitkan user_vouchers baru.',
        '- Kirim Idempotency-Key agar tukar ganda tidak terjadi saat tombol ter-tap dua kali.',
      ].join('\n'),
      operationId: 'loyaltyRedeem',
      parameters: [
        {
          name: 'Idempotency-Key',
          in: 'header',
          required: false,
          description: 'Kunci unik per penukaran.',
          schema: { type: 'string', minLength: 8, maxLength: 128, pattern: '^[A-Za-z0-9._:-]+$' },
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'object', required: ['rewardId'], properties: { rewardId: { type: 'string', format: 'uuid' } } },
            example: { rewardId: '88888888-8888-4888-8888-888888888888' },
          },
        },
      },
      responses: {
        '201': {
          description: 'Poin ditukar. Hadiah bertipe voucher sudah terbit.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: {
                    type: 'object',
                    properties: {
                      redemption: ref('LoyaltyRedemption'),
                      voucher: { ...(ref('UserVoucher') as object), nullable: true } as object,
                      remainingPoints: { type: 'integer' },
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
          description: 'Saldo poin tidak cukup atau hadiah sedang tidak aktif.',
          content: { 'application/json': { schema: ref('ErrorResponse') } },
        },
      },
    },
  },

  '/me/redemptions': {
    get: {
      tags: loyaltyTags,
      summary: 'Riwayat penukaran poin',
      operationId: 'loyaltyListRedemptions',
      parameters: [
        ...paginationParameters(),
        enumQueryParam('status', ['pending', 'completed', 'cancelled'], 'Filter status penukaran.'),
      ],
      responses: {
        '200': paginatedResponse(ref('LoyaltyRedemption')),
        '401': commonErrors.unauthorized,
      },
    },
  },
};

// --------------------------------------------------------------------------
// Review
// --------------------------------------------------------------------------
const reviewTags = ['Review'];

export const reviewPaths: Record<string, PathSpec> = {
  '/reviews': {
    post: {
      tags: reviewTags,
      summary: 'Tulis review',
      description: [
        'Satu review per item pesanan (dijamin unique di `order_item_id`).',
        '',
        'Syarat:',
        '- Order harus milik sendiri dan sudah selesai (completed).',
        '- Minimal satu dari foodRating / serviceRating / speedRating harus diisi.',
        '- Rating di luar 1-5 ditolak oleh validasi maupun CHECK constraint.',
      ].join('\n'),
      operationId: 'reviewCreate',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: ref('CreateReviewRequest'),
            example: {
              orderItemId: '99999999-9999-4999-8999-999999999999',
              foodRating: 5,
              serviceRating: 4,
              speedRating: 5,
              reviewText: 'Kopinya enak dan pelayan ramah.',
            },
          },
        },
      },
      responses: {
        '201': {
          description: 'Review tersimpan dengan status visible.',
          content: {
            'application/json': {
              schema: { type: 'object', properties: { success: { type: 'boolean', enum: [true] }, data: ref('Review') } },
            },
          },
        },
        '400': commonErrors.validation,
        '401': commonErrors.unauthorized,
        '404': commonErrors.notFound,
        '409': {
          description: 'Item pesanan ini sudah pernah direview.',
          content: { 'application/json': { schema: ref('ErrorResponse') } },
        },
        '422': {
          description: 'Order belum selesai atau bukan milik user ini.',
          content: { 'application/json': { schema: ref('ErrorResponse') } },
        },
      },
    },
  },

  '/me/reviews': {
    get: {
      tags: reviewTags,
      summary: 'Review yang saya tulis',
      operationId: 'reviewListMine',
      parameters: paginationParameters(),
      responses: {
        '200': paginatedResponse(ref('Review')),
        '401': commonErrors.unauthorized,
      },
    },
  },

  '/me/reviews/{id}': {
    patch: {
      tags: reviewTags,
      summary: 'Ubah review saya',
      description: 'Moderasi akan mengembalikan status review ke visible bila staff menyembunyikannya.',
      operationId: 'reviewUpdateMine',
      parameters: [uuidPathParam('id', 'ID review.')],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: ref('UpdateReviewRequest'),
            example: { foodRating: 4, reviewText: 'Tadi review-nya kurang tepat.' },
          },
        },
      },
      responses: {
        '200': successResponse(ref('Review'), 'Review diperbarui.'),
        '400': commonErrors.validation,
        '401': commonErrors.unauthorized,
        '404': commonErrors.notFound,
      },
    },
    delete: {
      tags: reviewTags,
      summary: 'Hapus review saya',
      operationId: 'reviewDeleteMine',
      parameters: [uuidPathParam('id', 'ID review.')],
      responses: {
        '200': successResponse(
          { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, deleted: { type: 'boolean' } } },
          'Review dihapus.',
        ),
        '401': commonErrors.unauthorized,
        '404': commonErrors.notFound,
      },
    },
  },
};

// --------------------------------------------------------------------------
// Reservasi
// --------------------------------------------------------------------------
const reservationTags = ['Reservasi'];

export const reservationPaths: Record<string, PathSpec> = {
  '/reservations': {
    post: {
      tags: reservationTags,
      summary: 'Buat reservasi',
      description: [
        'Memastikan tidak ada reservasi yang tumpang tindih pada cabang, jam, dan durasi yang sama,',
        'serta tidak ada meja yang sedang dipakai dua booking dalam rentang waktu beririsan.',
        'Pemeriksaan ini berjalan di dalam transaksi dengan row lock.',
        '',
        '`tableIds` bersifat opsional: bila diisi, meja langsung diamankan; bila tidak,',
        'penentuan meja diserahkan ke staff saat konfirmasi.',
      ].join('\n'),
      operationId: 'reservationCreate',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: ref('CreateReservationRequest'),
            example: {
              branchId: '11111111-1111-4111-8111-111111111111',
              areaId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              reservedFor: '2026-01-10T18:00:00+07:00',
              durationMinutes: 120,
              guestCount: 6,
              seatingPreference: 'indoor',
              tableIds: ['66666666-6666-4666-8666-666666666666'],
              specialRequests: 'Ada uprojector presentasi',
            },
          },
        },
      },
      responses: {
        '201': {
          description: 'Reservasi dibuat dengan status requested.',
          content: {
            'application/json': {
              schema: { type: 'object', properties: { success: { type: 'boolean', enum: [true] }, data: ref('Reservation') } },
            },
          },
        },
        '400': commonErrors.validation,
        '401': commonErrors.unauthorized,
        '404': commonErrors.notFound,
        '409': {
          description: 'Jam tersebut sudah terisi atau meja sudah dibooking.',
          content: { 'application/json': { schema: ref('ErrorResponse') } },
        },
        '422': {
          description: 'Reservasi di luar jam operasional cabang atau kapasitas tidak cukup.',
          content: { 'application/json': { schema: ref('ErrorResponse') } },
        },
      },
    },
  },

  '/me/reservations': {
    get: {
      tags: reservationTags,
      summary: 'Reservasi saya',
      operationId: 'reservationListMine',
      parameters: [
        ...paginationParameters(),
        enumQueryParam('status', ['requested', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show'], 'Filter status.'),
        queryParam('branchId', { type: 'string', format: 'uuid' }, 'Filter cabang.'),
        dateQueryParam('from', 'Tanggal awal reserved_for.'),
        dateQueryParam('to', 'Tanggal akhir reserved_for.'),
      ],
      responses: {
        '200': paginatedResponse(ref('Reservation')),
        '401': commonErrors.unauthorized,
      },
    },
  },

  '/reservations/{id}': {
    get: {
      tags: reservationTags,
      summary: 'Detail reservasi',
      operationId: 'reservationDetail',
      parameters: [uuidPathParam('id', 'ID reservasi.')],
      responses: {
        '200': {
          description: 'Detail reservasi beserta meja yang diamankan.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: {
                    type: 'object',
                    properties: {
                      reservation: ref('Reservation'),
                      tables: { type: 'array', items: ref('CafeTable') },
                    },
                  },
                },
              },
            },
          },
        },
        '401': commonErrors.unauthorized,
        '404': commonErrors.notFound,
      },
    },
  },

  '/reservations/{id}/cancel': {
    post: {
      tags: reservationTags,
      summary: 'Batalkan reservasi',
      description: 'Hanya bisa dibatalkan selama status masih requested atau confirmed.',
      operationId: 'reservationCancel',
      parameters: [uuidPathParam('id', 'ID reservasi.')],
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: { type: 'object', properties: { reason: { type: 'string', maxLength: 500 } } },
            example: { reason: 'Ada keperluan mendadak' },
          },
        },
      },
      responses: {
        '200': {
          description: 'Reservasi dibatalkan dan meja dilepas.',
          content: {
            'application/json': {
              schema: { type: 'object', properties: { success: { type: 'boolean', enum: [true] }, data: ref('Reservation') } },
            },
          },
        },
        '401': commonErrors.unauthorized,
        '404': commonErrors.notFound,
        '422': {
          description: 'Reservasi sudah berjalan atau selesai.',
          content: { 'application/json': { schema: ref('ErrorResponse') } },
        },
      },
    },
  },

  '/reservations/availability': {
    get: {
      tags: reservationTags,
      summary: 'Cek ketersediaan meja',
      description: 'Menampilkan meja yang masih bisa dipesan pada tanggal, durasi, dan jumlah tamu tertentu.',
      operationId: 'reservationCheckAvailability',
      security: [],
      parameters: [
        queryParam('branchId', { type: 'string', format: 'uuid' }, 'Wajib diisi.', true),
        queryParam('date', { type: 'string', format: 'date' }, 'Tanggal yang dicek.', true),
        queryParam('time', { type: 'string', example: '18:00' }, 'Jam mulai (HH:mm).', true),
        queryParam('durationMinutes', { type: 'integer', default: 120 }, 'Durasi Reservasi dalam menit.'),
        queryParam('guestCount', { type: 'integer' }, 'Jumlah tamu; meja dengan kapasitas >= nilai ini.'),
        queryParam('areaId', { type: 'string', format: 'uuid' }, 'Batasi ke satu area.'),
        enumQueryParam('seatingPreference', ['indoor', 'outdoor', 'private_room', 'any'], 'Preferensi area.'),
      ],
      responses: {
        '200': {
          description: 'Meja yang tersedia.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: {
                    type: 'object',
                    properties: {
                      branchId: { type: 'string', format: 'uuid' },
                      date: { type: 'string', format: 'date' },
                      isOpenAt: { type: 'boolean' },
                      availableTables: { type: 'array', items: ref('CafeTable') },
                      suggestedTableCount: { type: 'integer', description: 'Perkiraan jumlah meja untuk jumlah tamu.' },
                    },
                  },
                },
              },
            },
          },
        },
        '400': commonErrors.validation,
        '404': commonErrors.notFound,
      },
    },
  },
};

// --------------------------------------------------------------------------
// Event & catering
// --------------------------------------------------------------------------
const eventTags = ['Event & Catering'];

export const eventPaths: Record<string, PathSpec> = {
  '/event-packages': {
    get: {
      tags: eventTags,
      summary: 'Paket event (ruangan)',
      operationId: 'eventListPackages',
      security: [],
      parameters: [...paginationParameters(), queryParam('eventType', { type: 'string' }, 'Filter jenis acara yang cocok.')],
      responses: {
        '200': paginatedResponse(ref('EventPackage')),
      },
    },
  },

  '/event-packages/{code}': {
    get: {
      tags: eventTags,
      summary: 'Detail paket event',
      operationId: 'eventPackageDetail',
      security: [],
      parameters: [{ name: 'code', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        '200': successResponse(ref('EventPackage')),
        '404': commonErrors.notFound,
      },
    },
  },

  '/catering-packages': {
    get: {
      tags: eventTags,
      summary: 'Paket katering per orang',
      description: 'Paket katering dan buffet dengan harga per orang serta minimum jumlah tamu.',
      operationId: 'cateringListPackages',
      security: [],
      parameters: [
        ...paginationParameters(),
        queryParam('minGuests', { type: 'integer' }, 'Hanya paket dengan minimum tamu <= nilai ini.'),
        queryParam('maxGuests', { type: 'integer' }, 'Hanya paket yang masih muat jumlah tamu ini.'),
      ],
      responses: {
        '200': paginatedResponse(ref('CateringPackage')),
      },
    },
  },

  '/catering-packages/{code}': {
    get: {
      tags: eventTags,
      summary: 'Detail paket katering',
      operationId: 'cateringPackageDetail',
      security: [],
      parameters: [{ name: 'code', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        '200': successResponse(ref('CateringPackage')),
        '404': commonErrors.notFound,
      },
    },
  },

  '/event-bookings': {
    post: {
      tags: eventTags,
      summary: 'Ajukan booking event',
      description: [
        'Perhitungan harga dilakukan server dari snapshot paket event, paket katering, dan addon.',
        'Nama paket dan harga disimpan sebagai snapshot supaya perubahan harga paket di kemudian',
        'hari tidak mengubah booking lama.',
        '',
        'Booking yang saling bertabrakan pada cabang dan rentang waktu akan ditolak.',
      ].join('\n'),
      operationId: 'eventBookingCreate',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: ref('CreateEventBookingRequest'),
            example: {
              branchId: '11111111-1111-4111-8111-111111111111',
              eventPackageId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
              eventType: 'birthday',
              eventName: 'Ulang Tahun Nadia',
              startsAt: '2026-02-14T16:00:00+07:00',
              endsAt: '2026-02-14T20:00:00+07:00',
              guestCount: 40,
              catering: [{ cateringPackageId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', guestCount: 40 }],
              addons: [{ name: 'Dekorasi tambahan', quantity: 1, unitPriceIdr: 350000 }],
              customRequests: 'Butuh sound system dan proyektor',
            },
          },
        },
      },
      responses: {
        '201': {
          description: 'Booking dibuat dengan status requested.',
          content: {
            'application/json': {
              schema: { type: 'object', properties: { success: { type: 'boolean', enum: [true] }, data: ref('EventBooking') } },
            },
          },
        },
        '400': commonErrors.validation,
        '401': commonErrors.unauthorized,
        '404': commonErrors.notFound,
        '409': {
          description: 'Slot waktu cabang sudah dipakai booking lain.',
          content: { 'application/json': { schema: ref('ErrorResponse') } },
        },
        '422': {
          description: 'Jumlah tamu di luar rentang paket, atau lead time katering tidak terpenuhi.',
          content: { 'application/json': { schema: ref('ErrorResponse') } },
        },
      },
    },
  },

  '/me/event-bookings': {
    get: {
      tags: eventTags,
      summary: 'Booking event saya',
      operationId: 'eventBookingListMine',
      parameters: [
        ...paginationParameters(),
        enumQueryParam(
          'status',
          ['requested', 'quoted', 'awaiting_deposit', 'confirmed', 'in_progress', 'completed', 'cancelled'],
          'Filter status booking.',
        ),
        queryParam('branchId', { type: 'string', format: 'uuid' }, 'Filter cabang.'),
      ],
      responses: {
        '200': paginatedResponse(ref('EventBooking')),
        '401': commonErrors.unauthorized,
      },
    },
  },

  '/event-bookings/{id}': {
    get: {
      tags: eventTags,
      summary: 'Detail booking event',
      description: 'Termasuk rincian katering, addon, dan total pembayaran.',
      operationId: 'eventBookingDetail',
      parameters: [uuidPathParam('id', 'ID booking.')],
      responses: {
        '200': {
          description: 'Detail booking.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: {
                    type: 'object',
                    properties: {
                      booking: ref('EventBooking'),
                      payments: { type: 'array', items: ref('PaymentTransaction') },
                      paidIdr: { type: 'integer' },
                      remainingDueIdr: { type: 'integer' },
                    },
                  },
                },
              },
            },
          },
        },
        '401': commonErrors.unauthorized,
        '404': commonErrors.notFound,
      },
    },
  },

  '/event-bookings/{id}/cancel': {
    post: {
      tags: eventTags,
      summary: 'Batalkan booking event',
      description:
        'Hanya bisa dibatalkan pada status requested, quoted, atau awaiting_deposit. ' +
        'Deposit yang sudah dibayar akan dicatat sebagai transaksi refund.',
      operationId: 'eventBookingCancel',
      parameters: [uuidPathParam('id', 'ID booking.')],
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: { type: 'object', properties: { reason: { type: 'string', maxLength: 500 } } },
            example: { reason: 'Jadwal berubah' },
          },
        },
      },
      responses: {
        '200': {
          description: 'Booking dibatalkan.',
          content: {
            'application/json': {
              schema: { type: 'object', properties: { success: { type: 'boolean', enum: [true] }, data: ref('EventBooking') } },
            },
          },
        },
        '401': commonErrors.unauthorized,
        '404': commonErrors.notFound,
        '422': {
          description: 'Booking sudah confirmed atau berjalan.',
          content: { 'application/json': { schema: ref('ErrorResponse') } },
        },
      },
    },
  },

  '/event-availability': {
    get: {
      tags: eventTags,
      summary: 'Cek ketersediaan tanggal event',
      description: 'Menampilkan tanggal yang masih bisa dibooking beserta slot jam yang belum terpakai.',
      operationId: 'eventCheckAvailability',
      security: [],
      parameters: [
        queryParam('branchId', { type: 'string', format: 'uuid' }, 'Wajib diisi.', true),
        dateQueryParam('from', 'Tanggal awal (wajib diisi).', true),
        dateQueryParam('to', 'Tanggal akhir (wajib diisi).'),
        queryParam('guestCount', { type: 'integer' }, 'Jumlah tamu rencana.'),
      ],
      responses: {
        '200': {
          description: 'Tanggal dan slot yang tersedia.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: {
                    type: 'object',
                    properties: {
                      branchId: { type: 'string', format: 'uuid' },
                      dates: { type: 'array', items: ref('EventAvailabilityDate') },
                    },
                  },
                },
              },
            },
          },
        },
        '400': commonErrors.validation,
        '404': commonErrors.notFound,
      },
    },
  },
};

/** Boolean query param tanpa import ulang (dipakai pada blok promo). */
function booleanQueryParamSafe(name: string, description?: string): ParameterObject {
  return { name, in: 'query', required: false, description, schema: { type: 'boolean' } };
}