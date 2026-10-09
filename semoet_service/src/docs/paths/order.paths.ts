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
  uuidPathParam,
} from '../helpers.js';
import type { PathSpec } from '../helpers.js';

const orderStatusValues = [
  'placed',
  'accepted',
  'preparing',
  'ready',
  'out_for_delivery',
  'completed',
  'cancelled',
  'rejected',
] as const;

const paymentStatusValues = [
  'unpaid',
  'pending',
  'paid',
  'partially_refunded',
  'refunded',
  'failed',
] as const;

// --------------------------------------------------------------------------
// Order
// --------------------------------------------------------------------------
const orderTags = ['Order'];

export const orderPaths: Record<string, PathSpec> = {
  '/orders': {
    post: {
      tags: orderTags,
      summary: 'Buat pesanan',
      description: [
        'Harga selalu dihitung ulang di server dari variant + modifier, bukan dari nilai yang dikirim client.',
        '',
        'Seluruh langkah (validasi modifier min/max, penerapan promo, pembuatan order, item,',
        'redemption promo, dan biteback poin) berjalan dalam satu transaksi. Pengiriman ulang',
        'request dengan Idempotency-Key yang sama tidak akan membuat order ganda.',
        '',
        'Aturan domain:',
        '- `delivery` wajib menyertakan `addressId` milik user sendiri (di-snapshot ke order).',
        '- `dine_in` wajib menyertakan `tableId`.',
        '- Total harus memenuhi CHECK constraint: total = subtotal - discount + tax + deliveryFee + serviceFee.',
      ].join('\n'),
      operationId: 'orderCreate',
      parameters: [
        {
          name: 'Idempotency-Key',
          in: 'header',
          required: false,
          description: 'Kunci unik per percobaan (8-128 karakter). Mencegah dobel order dari mobile.',
          schema: { type: 'string', minLength: 8, maxLength: 128, pattern: '^[A-Za-z0-9._:-]+$' },
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: ref('CreateOrderRequest'),
            examples: {
              delivery: {
                summary: 'Antar ke alamat',
                value: {
                  branchId: '11111111-1111-4111-8111-111111111111',
                  fulfillmentType: 'delivery',
                  addressId: '22222222-2222-4222-8222-222222222222',
                  items: [
                    {
                      productId: '33333333-3333-4333-8333-333333333333',
                      variantId: '44444444-4444-4444-8444-444444444444',
                      quantity: 2,
                      modifiers: [{ optionId: '55555555-5555-4555-8555-555555555555', quantity: 1 }],
                      specialInstructions: 'Tanpa gula',
                    },
                  ],
                  promoCode: 'SEMOET10',
                  customerNotes: 'Tolong cepat, menit di mobil',
                },
              },
              dineIn: {
                summary: 'Makan di tempat',
                value: {
                  branchId: '11111111-1111-4111-8111-111111111111',
                  fulfillmentType: 'dine_in',
                  tableId: '66666666-6666-4666-8666-666666666666',
                  items: [
                    {
                      productId: '33333333-3333-4333-8333-333333333333',
                      variantId: '44444444-4444-4444-8444-444444444444',
                      quantity: 1,
                    },
                  ],
                },
              },
            },
          },
        },
      },
      responses: {
        '201': {
          description: 'Pesanan dibuat dengan status placed dan payment_status unpaid.',
          content: { 'application/json': { schema: ref('OrderDetail') } },
        },
        '400': commonErrors.validation,
        '401': commonErrors.unauthorized,
        '404': {
          description: 'Produk, variant, cabang, alamat, atau meja tidak ditemukan.',
          content: { 'application/json': { schema: ref('ErrorResponse') } },
        },
        '409': {
          description: 'Idempotency-Key sudah dipakai atau alamat bukan milik user.',
          content: { 'application/json': { schema: ref('ErrorResponse') } },
        },
        '422': {
          description:
            'Aturan bisnis dilanggar: modifier melebihi batas, promo kedaluwarsa/kuota habis, ' +
            'voucher bukan milik user, atau stok tidak cukup.',
          content: { 'application/json': { schema: ref('ErrorResponse') } },
        },
        '429': commonErrors.rateLimited,
      },
    },
  },

  '/me/orders': {
    get: {
      tags: orderTags,
      summary: 'Riwayat pesanan saya',
      description: 'Mendukung filter status, cabang, rentang tanggal, dan sorting.',
      operationId: 'orderListMine',
      parameters: [
        ...paginationParameters(),
        enumQueryParam('orderStatus', orderStatusValues, 'Filter status pesanan.'),
        enumQueryParam('paymentStatus', paymentStatusValues, 'Filter status pembayaran.'),
        queryParam('branchId', { type: 'string', format: 'uuid' }, 'Filter cabang.'),
        dateTimeQueryParam('from', 'Tanggal awal (placed_at >= from).'),
        dateTimeQueryParam('to', 'Tanggal akhir (placed_at <= to).'),
        queryParam('sort', { type: 'string', enum: ['newest', 'oldest', 'total_desc'] }, 'Default newest.'),
      ],
      responses: {
        '200': paginatedResponse(ref('OrderSummary')),
        '401': commonErrors.unauthorized,
      },
    },
  },

  '/orders/{id}': {
    get: {
      tags: orderTags,
      summary: 'Detail pesanan',
      description: 'Hanya pemilik order yang bisa membaca. Sertakan item, modifier, dan alamat snapshot.',
      operationId: 'orderDetail',
      parameters: [uuidPathParam('id', 'ID pesanan.')],
      responses: {
        '200': {
          description: 'Detail pesanan lengkap.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: ref('OrderDetail'),
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

  '/orders/{id}/cancel': {
    post: {
      tags: orderTags,
      summary: 'Batalkan pesanan',
      description:
        'Hanya bisa dibatalkan saat status masih placed, accepted, atau preparing. ' +
        'Voucher dan promo yang sempat dipakai dikembalikan, dan poin yang telanjur ' +
        'didarabkan dipotong balik. Pengecekan dilakukan di dalam transaksi dengan row lock.',
      operationId: 'orderCancel',
      parameters: [uuidPathParam('id', 'ID pesanan.')],
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: { type: 'object', properties: { reason: { type: 'string', maxLength: 500 } } },
            example: { reason: 'Salah pilih ukuran' },
          },
        },
      },
      responses: {
        '200': {
          description: 'Pesanan dibatalkan.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: ref('OrderSummary'),
                },
              },
            },
          },
        },
        '401': commonErrors.unauthorized,
        '404': commonErrors.notFound,
        '422': {
          description: 'Status pesanan tidak bisa dibatalkan lagi.',
          content: { 'application/json': { schema: ref('ErrorResponse') } },
        },
      },
    },
  },

  '/orders/{id}/status': {
    get: {
      tags: orderTags,
      summary: 'Riwayat status pesanan',
      description: 'Setiap perubahan status tercatat di order_status_history.',
      operationId: 'orderStatusHistory',
      parameters: [uuidPathParam('id', 'ID pesanan.')],
      responses: {
        '200': {
          description: 'Riwayat perubahan status dari placed hingga selesai.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: {
                    type: 'object',
                    properties: {
                      orderId: uuidPathSchema(),
                      currentStatus: { type: 'string', example: 'preparing' },
                      history: { type: 'array', items: ref('OrderStatusHistory') },
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

  '/orders/{id}/items': {
    get: {
      tags: orderTags,
      summary: 'Rincian item pesanan',
      operationId: 'orderItems',
      parameters: [uuidPathParam('id', 'ID pesanan.')],
      responses: {
        '200': {
          description: 'Item beserta modifier yang dipilih.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: { type: 'array', items: ref('OrderItem') },
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
};

// --------------------------------------------------------------------------
// Payment
// --------------------------------------------------------------------------
const paymentTags = ['Payment'];

export const paymentPaths: Record<string, PathSpec> = {
  '/payments/charge': {
    post: {
      tags: paymentTags,
      summary: 'Buat transaksi pembayaran',
      description: [
        'Membuat transaksi charge (atau refund) untuk satu order.',
        '',
        'Aturan penting:',
        '- Idempotency-Key wajib diisi untuk transaksi charge; pengiriman ulang mengembalikan',
        '  transaksi yang sama, bukan membuat transaksi baru.',
        '- Status order hanya berubah dari event provider yang sudah diverifikasi signature-nya,',
        '  bukan dari respons Charge API.',
        '- Pembayaran cash tidak butuh provider.',
      ].join('\n'),
      operationId: 'paymentCreateCharge',
      parameters: [
        {
          name: 'Idempotency-Key',
          in: 'header',
          required: true,
          description: 'Kunci unik per percobaan. Wajib untuk transaksi charge.',
          schema: { type: 'string', minLength: 8, maxLength: 128, pattern: '^[A-Za-z0-9._:-]+$' },
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: ref('CreateChargeRequest'),
            example: {
              orderId: '77777777-7777-4777-8777-777777777777',
              paymentMethod: 'qris',
              provider: 'midtrans',
            },
          },
        },
      },
      responses: {
        '202': {
          description: 'Transaksi dibuat. Customer perlu menyelesaikan pembayaran di paymentUrl.',
          content: { 'application/json': { schema: ref('ChargeResult') } },
        },
        '400': commonErrors.validation,
        '401': commonErrors.unauthorized,
        '404': commonErrors.notFound,
        '409': {
          description: 'Idempotency-Key sudah dipakai untuk nilai yang berbeda.',
          content: { 'application/json': { schema: ref('ErrorResponse') } },
        },
        '422': {
          description: 'Nominal tidak cocok dengan total order atau order sudah dibayar.',
          content: { 'application/json': { schema: ref('ErrorResponse') } },
        },
        '429': commonErrors.rateLimited,
      },
    },
  },

  '/payments/{id}': {
    get: {
      tags: paymentTags,
      summary: 'Detail transaksi pembayaran',
      operationId: 'paymentDetail',
      parameters: [uuidPathParam('id', 'ID transaksi.')],
      responses: {
        '200': { description: 'Detail transaksi.', content: { 'application/json': { schema: ref('PaymentTransaction') } } },
        '401': commonErrors.unauthorized,
        '404': commonErrors.notFound,
      },
    },
  },

  '/payments/{id}/verify': {
    get: {
      tags: paymentTags,
      summary: 'Verifikasi status pembayaran ke provider',
      description:
        'Meminta status terbaru ke payment gateway untuk memastikan pembayaran benar-benar masuk, ' +
        'lalu menyinkronkan order bila perlu. Aman dipanggil berkali-kali.',
      operationId: 'paymentVerify',
      parameters: [uuidPathParam('id', 'ID transaksi.')],
      responses: {
        '200': {
          description: 'Status terbaru beserta order yang sudah disinkronkan.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: {
                    type: 'object',
                    properties: {
                      payment: ref('PaymentTransaction'),
                      orderStatus: { type: 'string' },
                      paymentStatus: { type: 'string' },
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

  '/payments/{id}/refund': {
    post: {
      tags: paymentTags,
      summary: 'Refund transaksi',
      description: 'Hanya staff/admin dengan permission payment:update. Partial refund didukung sampai total refund tidak melebihi charge.',
      operationId: 'paymentRefund',
      parameters: [uuidPathParam('id', 'ID transaksi.')],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: ref('RefundRequest'),
            example: { amountIdr: 50000, reason: 'Pesanan tidak sampai' },
          },
        },
      },
      responses: {
        '201': {
          description: 'Refund diproses.',
          content: { 'application/json': { schema: ref('PaymentTransaction') } },
        },
        '400': commonErrors.validation,
        '401': commonErrors.unauthorized,
        '403': commonErrors.forbidden,
        '404': commonErrors.notFound,
        '422': {
          description: 'Nominal refund melebihi sisa yang bisa dikembalikan.',
          content: { 'application/json': { schema: ref('ErrorResponse') } },
        },
      },
    },
  },

  '/payments/webhook': {
    post: {
      tags: paymentTags,
      summary: 'Webhook dari payment provider',
      description: [
        'Endpoint publik yang hanya dipakai provider.',
        '',
        'Keamanan:',
        '- Signature HMAC diverifikasi terhadap raw body memakai timing-safe compare.',
        '- `provider_event_id` bersifat unik sehingga event yang terkirim dua kali diproses satu kali.',
        '- Response 200 diberikan segera agar provider tidak melakukan retry panjang.',
      ].join('\n'),
      operationId: 'paymentWebhook',
      security: [],
      parameters: [
        {
          name: 'x-webhook-signature',
          in: 'header',
          required: true,
          description: 'Signature HMAC dari provider (hex atau base64).',
          schema: { type: 'string' },
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: ref('PaymentWebhookRequest'),
            example: {
              providerEventId: 'evt_123abc',
              provider: 'midtrans',
              eventType: 'payment.succeeded',
              transactionStatus: 'settlement',
              providerReference: 'trx_998877',
              amountIdr: 45000,
              paidAt: '2026-01-05T10:20:00+07:00',
              raw: { transaction_id: 'trx_998877' },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Event diterima (diproses atau diabaikan karena duplikat).' },
        '400': {
          description: 'Signature tidak valid atau payload tidak dikenali.',
          content: { 'application/json': { schema: ref('ErrorResponse') } },
        },
      },
    },
  },

  '/orders/{id}/payments': {
    get: {
      tags: paymentTags,
      summary: 'Riwayat pembayaran sebuah order',
      description: 'Menampilkan semua charge dan refund yang terkait dengan order.',
      operationId: 'paymentListForOrder',
      parameters: [uuidPathParam('id', 'ID pesanan.'), ...paginationParameters()],
      responses: {
        '200': paginatedResponse(ref('PaymentTransaction')),
        '401': commonErrors.unauthorized,
        '404': commonErrors.notFound,
      },
    },
  },

  // ------------------------------------------------------------------------
  // Delivery
  // ------------------------------------------------------------------------
  '/orders/{id}/delivery': {
    get: {
      tags: ['Delivery'],
      summary: 'Status pengiriman order',
      description: 'Menampilkan kurir, estimasi tiba, dan titik tracking terakhir.',
      operationId: 'deliveryDetail',
      parameters: [uuidPathParam('id', 'ID pesanan.')],
      responses: {
        '200': {
          description: 'Detail pengiriman.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: {
                    type: 'object',
                    properties: {
                      orderId: uuidPathSchema(),
                      delivery: { ...(ref('OrderDelivery') as object), nullable: true } as object,
                    },
                  },
                },
              },
            },
          },
        },
        '401': commonErrors.unauthorized,
        '404': commonErrors.notFound,
        '422': {
          description: 'Order bukan tipe delivery.',
          content: { 'application/json': { schema: ref('ErrorResponse') } },
        },
      },
    },
  },

  '/orders/{id}/delivery/tracking': {
    get: {
      tags: ['Delivery'],
      summary: 'Riwayat posisi kurir',
      description: 'Titik GPS yang dicatat kurir, diurutkan dari yang terbaru.',
      operationId: 'deliveryTracking',
      parameters: [uuidPathParam('id', 'ID pesanan.'), ...paginationParameters()],
      responses: {
        '200': paginatedResponse(ref('DeliveryTrackingPoint')),
        '401': commonErrors.unauthorized,
        '404': commonErrors.notFound,
      },
    },
    post: {
      tags: ['Delivery'],
      summary: 'Catat posisi kurir (staff)',
      description: 'Dipakai aplikasi kurir mengirim titik GPS berkala.',
      operationId: 'deliveryAddTrackingPoint',
      parameters: [uuidPathParam('id', 'ID pesanan.')],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: ref('DeliveryTrackingRequest'),
            example: { latitude: -6.9175, longitude: 107.6191, recordedAt: '2026-01-05T11:00:00+07:00' },
          },
        },
      },
      responses: {
        '201': successResponse(ref('DeliveryTrackingPoint'), 'Posisi tercatat.'),
        '400': commonErrors.validation,
        '401': commonErrors.unauthorized,
        '403': commonErrors.forbidden,
        '404': commonErrors.notFound,
      },
    },
  },

  '/orders/{id}/delivery/assign': {
    post: {
      tags: ['Delivery'],
      summary: 'Tugaskan kurir (staff)',
      description: 'Mengubah status pengiriman menjadi assigned dan mencatat kurir serta nomor lacaknya.',
      operationId: 'deliveryAssign',
      parameters: [uuidPathParam('id', 'ID pesanan.')],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: ref('AssignDeliveryRequest'),
            example: {
              provider: 'gojek',
              driverName: 'Rudi',
              driverPhone: '08123456789',
              trackingCode: 'GJK-88213',
              estimatedDeliveryAt: '2026-01-05T12:00:00+07:00',
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Kurir ditugaskan.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { success: { type: 'boolean', enum: [true] }, data: ref('OrderDelivery') },
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

  '/orders/{id}/delivery/status': {
    patch: {
      tags: ['Delivery'],
      summary: 'Ubah status pengiriman (staff)',
      description: 'Urutan status: awaiting_assignment -> assigned -> picked_up -> in_transit -> delivered. Status delivered juga menutup order.',
      operationId: 'deliveryUpdateStatus',
      parameters: [uuidPathParam('id', 'ID pesanan.')],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: ref('UpdateDeliveryStatusRequest'),
            example: { deliveryStatus: 'delivered', note: 'Diterima penerima' },
          },
        },
      },
      responses: {
        '200': successResponse(ref('OrderDelivery'), 'Status pengiriman diperbarui.'),
        '400': commonErrors.validation,
        '401': commonErrors.unauthorized,
        '403': commonErrors.forbidden,
        '404': commonErrors.notFound,
        '422': {
          description: 'Perpindahan status tidak sesuai alur.',
          content: { 'application/json': { schema: ref('ErrorResponse') } },
        },
      },
    },
  },

  '/deliveries': {
    get: {
      tags: ['Delivery'],
      summary: 'Daftar pengiriman (staff)',
      operationId: 'deliveryList',
      parameters: [
        ...paginationParameters(),
        queryParam('branchId', { type: 'string', format: 'uuid' }, 'Wajib diisi oleh staff non-admin.'),
        enumQueryParam(
          'deliveryStatus',
          ['awaiting_assignment', 'assigned', 'picked_up', 'in_transit', 'delivered', 'failed', 'cancelled'],
          'Filter status pengiriman.',
        ),
        queryParam('orderId', { type: 'string', format: 'uuid' }, 'Filter satu order.'),
      ],
      responses: {
        '200': paginatedResponse(ref('OrderDelivery')),
        '401': commonErrors.unauthorized,
        '403': commonErrors.forbidden,
      },
    },
  },

  '/deliveries/active': {
    get: {
      tags: ['Delivery'],
      summary: 'Pengiriman yang sedang berjalan',
      description: 'Daftar kiriman aktif untuk halaman operasional kurir.',
      operationId: 'deliveryListActive',
      parameters: [queryParam('branchId', { type: 'string', format: 'uuid' })],
      responses: {
        '200': {
          description: 'Pengiriman aktif.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: { type: 'array', items: ref('OrderDelivery') },
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

/** Schema UUID untuk field di dalam response body (bukan path param). */
function uuidPathSchema(): Record<string, unknown> {
  return { type: 'string', format: 'uuid' };
}

export { orderStatusValues, paymentStatusValues };