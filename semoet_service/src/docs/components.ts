/**
 * Komponen OpenAPI yang dipakai bersama: security scheme, schema envelope,
 * error, paginasi, dan domain entity yang berulang muncul di banyak endpoint.
 */

import type { ComponentsObject, ResponseLike, SchemaLike } from './types.js';
import { commonErrors, ref, successResponse } from './helpers.js';

// --------------------------------------------------------------------------
// Security
// --------------------------------------------------------------------------
const securitySchemes = {
  bearerAuth: {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description:
      'Access token JWT hasil POST /auth/login, /auth/register, /auth/refresh, ' +
      'atau /auth/otp/verify. Kirim sebagai `Authorization: Bearer <token>`.',
  },
  idTokenOAuth: {
    type: 'oauth2',
    description: 'ID token dari Google / Apple untuk POST /auth/oauth/:provider.',
    flows: {
      authorizationCode: {
        authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        scopes: { openid: 'Mengambil ID token', email: 'Mengambil email', profile: 'Mengambil nama' },
      },
    },
  },
};

// --------------------------------------------------------------------------
// Envelope & error
// --------------------------------------------------------------------------
const paginationMeta: SchemaLike = {
  type: 'object',
  description: 'Metadata paginasi, hanya ada pada endpoint list.',
  properties: {
    page: { type: 'integer', example: 1 },
    limit: { type: 'integer', example: 20 },
    total: { type: 'integer', example: 137 },
    totalPages: { type: 'integer', example: 7 },
    hasNext: { type: 'boolean' },
    hasPrev: { type: 'boolean' },
  },
};

const errorResponse: SchemaLike = {
  type: 'object',
  required: ['success', 'error'],
  properties: {
    success: { type: 'boolean', enum: [false] },
    error: {
      type: 'object',
      required: ['code', 'message'],
      properties: {
        code: {
          type: 'string',
          enum: [
            'VALIDATION_ERROR',
            'BAD_REQUEST',
            'UNAUTHORIZED',
            'TOKEN_EXPIRED',
            'TOKEN_INVALID',
            'FORBIDDEN',
            'NOT_FOUND',
            'CONFLICT',
            'UNPROCESSABLE_ENTITY',
            'TOO_MANY_REQUESTS',
            'DATABASE_ERROR',
            'INTERNAL_SERVER_ERROR',
            'SERVICE_UNAVAILABLE',
          ],
        },
        message: { type: 'string', description: 'Pesan error dalam bahasa Indonesia.' },
        details: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string', description: 'Lokasi field yang bermasalah.' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    requestId: { type: 'string' },
  },
};

// --------------------------------------------------------------------------
// Primitive
// --------------------------------------------------------------------------
const uuid = { type: 'string', format: 'uuid' } as const;
const money = (description: string): SchemaLike => ({
  type: 'integer',
  format: 'int64',
  minimum: 0,
  description,
});

/** Schema UUID yang boleh null, ditulis ulang karena nullable tidak bisa disisipkan ke literal. */
function nullableUuid(): SchemaLike {
  return { type: 'string', format: 'uuid', nullable: true };
}

function nullableStringRef(component: string): SchemaLike {
  return { $ref: `#/components/schemas/${component}`, nullable: true };
}

const dateTime = { type: 'string', format: 'date-time', nullable: true } as const;

const date = { type: 'string', format: 'date', nullable: true } as const;

const nullableString = { type: 'string', nullable: true } as const;

const schemas: Record<string, SchemaLike> = {
  // -- Envelope ----------------------------------------------------------
  PaginationMeta: paginationMeta,
  ErrorResponse: errorResponse,
  ErrorDetail: {
    type: 'object',
    properties: { field: { type: 'string' }, message: { type: 'string' } },
  },

  // -- Auth --------------------------------------------------------------
  User: {
    type: 'object',
    properties: {
      id: uuid,
      email: nullableString,
      phoneE164: nullableString,
      displayName: { type: 'string' },
      status: { type: 'string', enum: ['active', 'pending', 'suspended', 'deleted'] },
      emailVerifiedAt: dateTime,
      phoneVerifiedAt: dateTime,
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
  Role: {
    type: 'object',
    properties: {
      id: uuid,
      code: { type: 'string', example: 'customer' },
      name: { type: 'string', example: 'Pelanggan' },
      description: nullableString,
    },
  },
  Permission: {
    type: 'object',
    properties: {
      id: uuid,
      resource: { type: 'string', example: 'order' },
      action: { type: 'string', example: 'update' },
    },
  },
  AuthTokens: {
    type: 'object',
    properties: {
      accessToken: { type: 'string', description: 'JWT untuk header Authorization.' },
      refreshToken: { type: 'string', description: 'Dipakai POST /auth/refresh, disimpan sebagai cookie httpOnly.' },
      accessTokenExpiresIn: { type: 'integer', description: 'Masa berlaku access token dalam detik.', example: 900 },
      accessTokenExpiresAt: { type: 'string', format: 'date-time' },
      tokenType: { type: 'string', enum: ['Bearer'] },
    },
  },
  AuthSession: {
    type: 'object',
    required: ['success', 'data'],
    properties: {
      success: { type: 'boolean', enum: [true] },
      data: {
        type: 'object',
        properties: {
          user: ref('User'),
          accessToken: { type: 'string' },
          expiresIn: { type: 'integer', description: 'Detik masa berlaku access token.' },
          tokenType: { type: 'string', example: 'Bearer' },
          isNewUser: { type: 'boolean', description: 'True bila akun baru dibuat pada login ini.' },
        },
      },
      requestId: { type: 'string' },
    },
  },
  DeviceSession: {
    type: 'object',
    properties: {
      id: uuid,
      deviceLabel: nullableString,
      ipAddress: nullableString,
      userAgent: nullableString,
      createdAt: { type: 'string', format: 'date-time' },
      expiresAt: { type: 'string', format: 'date-time' },
      isCurrent: { type: 'boolean' },
    },
  },

  // -- Profile & tier ----------------------------------------------------
  CustomerTier: {
    type: 'object',
    properties: {
      id: uuid,
      code: { type: 'string', example: 'gold' },
      name: { type: 'string', example: 'Gold' },
      minimumLifetimePoints: { type: 'integer' },
      benefits: { type: 'object', additionalProperties: true },
      isActive: { type: 'boolean' },
    },
  },
  CustomerProfile: {
    type: 'object',
    properties: {
      user: ref('User'),
      tier: nullableStringRef('CustomerTier'),
      birthDate: date,
      marketingOptIn: { type: 'boolean' },
      preferences: { type: 'object', additionalProperties: true },
    },
  },
  Preferences: { type: 'object', additionalProperties: true },

  // -- Address -----------------------------------------------------------
  Address: {
    type: 'object',
    properties: {
      id: uuid,
      label: { type: 'string', example: 'Rumah' },
      recipientName: { type: 'string' },
      recipientPhone: { type: 'string' },
      addressLine: { type: 'string' },
      addressDetail: nullableString,
      city: { type: 'string' },
      province: nullableString,
      postalCode: nullableString,
      latitude: { type: 'number', nullable: true, description: 'Latitude -90..90.' },
      longitude: { type: 'number', nullable: true, description: 'Longitude -180..180.' },
      deliveryInstructions: nullableString,
      isDefault: { type: 'boolean' },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },

  // -- Family ------------------------------------------------------------
  FamilyGroup: {
    type: 'object',
    properties: { id: uuid, name: { type: 'string' }, ownerUserId: uuid, createdAt: { type: 'string', format: 'date-time' } },
  },
  FamilyMember: {
    type: 'object',
    properties: {
      id: uuid,
      familyGroupId: uuid,
      linkedUserId: nullableUuid(),
      displayName: { type: 'string' },
      relationship: nullableString,
      birthDate: date,
    },
  },

  // -- Branch ------------------------------------------------------------
  BranchHours: {
    type: 'object',
    properties: {
      dayOfWeek: { type: 'integer', minimum: 0, maximum: 6, description: '0=Minggu ... 6=Sabtu' },
      serviceType: { type: 'string', enum: ['all', 'dine_in', 'pickup', 'delivery'] },
      opensAt: { type: 'string', example: '08:00:00' },
      closesAt: { type: 'string', example: '22:00:00' },
      isOpenNow: { type: 'boolean', description: 'Dihitung pada jam cabang.' },
    },
  },
  Branch: {
    type: 'object',
    properties: {
      id: uuid,
      code: { type: 'string', example: 'SMD-JKT-01' },
      name: { type: 'string' },
      phone: nullableString,
      address: { type: 'string' },
      timezone: { type: 'string', example: 'Asia/Jakarta' },
      latitude: { type: 'number', nullable: true },
      longitude: { type: 'number', nullable: true },
      isActive: { type: 'boolean' },
    },
  },
  DiningArea: {
    type: 'object',
    properties: {
      id: uuid,
      branchId: uuid,
      name: { type: 'string' },
      areaType: { type: 'string', enum: ['indoor', 'outdoor', 'private_room', 'other'] },
      isActive: { type: 'boolean' },
      tableCount: { type: 'integer' },
    },
  },
  CafeTable: {
    type: 'object',
    properties: {
      id: uuid,
      areaId: uuid,
      areaName: { type: 'string' },
      tableCode: { type: 'string', example: 'A-01' },
      capacity: { type: 'integer', minimum: 1 },
      isActive: { type: 'boolean' },
    },
  },

  // -- Catalog -----------------------------------------------------------
  ProductImage: {
    type: 'object',
    properties: {
      id: uuid,
      publicUrl: nullableString,
      altText: nullableString,
      sortOrder: { type: 'integer' },
      isPrimary: { type: 'boolean' },
      widthPx: { type: 'integer', nullable: true },
      heightPx: { type: 'integer', nullable: true },
    },
  },
  ProductVariant: {
    type: 'object',
    properties: {
      id: uuid,
      productId: uuid,
      sku: nullableString,
      name: { type: 'string', example: 'Large' },
      priceIdr: money('Harga dalam rupiah bulat.'),
      compareAtPriceIdr: money('Harga coret sebelum diskon.'),
      isDefault: { type: 'boolean' },
      isActive: { type: 'boolean' },
      sortOrder: { type: 'integer' },
    },
  },
  ModifierOption: {
    type: 'object',
    properties: {
      id: uuid,
      groupId: uuid,
      name: { type: 'string', example: 'Less sugar' },
      priceDeltaIdr: money('Tambahan biaya dalam rupiah.'),
      isActive: { type: 'boolean' },
    },
  },
  ModifierGroup: {
    type: 'object',
    properties: {
      id: uuid,
      name: { type: 'string' },
      minSelect: { type: 'integer' },
      maxSelect: { type: 'integer' },
      isRequired: { type: 'boolean' },
      options: { type: 'array', items: ref('ModifierOption') },
    },
  },
  Product: {
    type: 'object',
    properties: {
      id: uuid,
      categoryId: uuid,
      name: { type: 'string' },
      slug: { type: 'string' },
      description: nullableString,
      productKind: {
        type: 'string',
        enum: ['food', 'drink', 'coffee', 'snack', 'dessert', 'bundle', 'buffet', 'event', 'other', 'standard'],
      },
      isActive: { type: 'boolean' },
      isFeatured: { type: 'boolean' },
      availableFrom: dateTime,
      availableUntil: dateTime,
      images: { type: 'array', items: ref('ProductImage') },
      variants: { type: 'array', items: ref('ProductVariant') },
      minPriceIdr: money('Harga varian termurah, untuk tampilan katalog.'),
      isFavorite: { type: 'boolean', description: 'Hanya terisi bila request memakai token.' },
    },
  },
  ProductCategory: {
    type: 'object',
    properties: {
      id: uuid,
      parentId: nullableUuid(),
      name: { type: 'string' },
      slug: { type: 'string' },
      sortOrder: { type: 'integer' },
      isActive: { type: 'boolean' },
      productCount: { type: 'integer' },
      children: { type: 'array', items: ref('ProductCategory') },
    },
  },
  ProductAvailability: {
    type: 'object',
    properties: {
      id: uuid,
      productId: uuid,
      branchId: nullableUuid(),
      dayOfWeek: { type: 'integer', nullable: true, minimum: 0, maximum: 6 },
      startsAt: { type: 'string', nullable: true, example: '08:00:00' },
      endsAt: { type: 'string', nullable: true, example: '17:00:00' },
      startsOn: dateTime,
      endsOn: dateTime,
      isAvailable: { type: 'boolean' },
    },
  },

  // -- Home --------------------------------------------------------------
  HomeBanner: {
    type: 'object',
    properties: {
      id: uuid,
      title: { type: 'string' },
      imageUrl: nullableString,
      targetUrl: nullableString,
      startsAt: dateTime,
      endsAt: dateTime,
      sortOrder: { type: 'integer' },
      isActive: { type: 'boolean' },
    },
  },
  FeaturedPlacement: {
    type: 'object',
    properties: {
      placement: {
        type: 'string',
        enum: ['favorite', 'new', 'family_bundle', 'meeting_bundle', 'birthday_bundle', 'buffet_bundle', 'event'],
      },
      label: { type: 'string', example: 'Paling Favorit' },
      productCount: { type: 'integer' },
    },
  },

  // -- Promo & voucher ---------------------------------------------------
  PromoCampaign: {
    type: 'object',
    properties: {
      id: uuid,
      code: nullableString,
      name: { type: 'string' },
      description: nullableString,
      discountType: { type: 'string', enum: ['percentage', 'fixed', 'free_item'] },
      discountValue: { type: 'number', example: 10 },
      minimumOrderIdr: money('Minimum belanja agar promo berlaku.'),
      maximumDiscountIdr: money('Batas atas diskon untuk tipe percentage.'),
      startsAt: { type: 'string', format: 'date-time' },
      endsAt: { type: 'string', format: 'date-time' },
      isActive: { type: 'boolean' },
    },
  },
  UserVoucher: {
    type: 'object',
    properties: {
      id: uuid,
      promoId: uuid,
      promo: ref('PromoCampaign'),
      code: nullableString,
      status: { type: 'string', enum: ['available', 'reserved', 'used', 'expired', 'revoked'] },
      issuedAt: { type: 'string', format: 'date-time' },
      expiresAt: dateTime,
      usedAt: dateTime,
    },
  },

  // -- Loyalty -----------------------------------------------------------
  LoyaltyReward: {
    type: 'object',
    properties: {
      id: uuid,
      code: { type: 'string' },
      name: { type: 'string' },
      description: nullableString,
      pointsCost: { type: 'integer', minimum: 1 },
      rewardType: { type: 'string', enum: ['voucher', 'free_product', 'discount'] },
      isActive: { type: 'boolean' },
    },
  },
  PointsSummary: {
    type: 'object',
    properties: {
      balance: { type: 'integer', description: 'Saldo poin yang bisa dipakai sekarang.' },
      lifetimeEarned: { type: 'integer' },
      lifetimeRedeemed: { type: 'integer' },
      lifetimeExpired: { type: 'integer' },
      expiringSoon: { type: 'integer' },
      nextExpiryAt: dateTime,
      tier: nullableStringRef('CustomerTier'),
    },
  },
  PointHistoryEntry: {
    type: 'object',
    properties: {
      id: uuid,
      pointsDelta: { type: 'integer', example: 150 },
      mutationType: { type: 'string', enum: ['earn', 'redeem', 'expire', 'adjustment'] },
      description: nullableString,
      referenceType: nullableString,
      referenceId: nullableUuid(),
      expiresAt: dateTime,
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
  LoyaltyRedemption: {
    type: 'object',
    properties: {
      id: uuid,
      rewardId: uuid,
      reward: ref('LoyaltyReward'),
      pointsSpent: { type: 'integer' },
      voucherId: nullableUuid(),
      status: { type: 'string', enum: ['pending', 'completed', 'cancelled'] },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },

  // -- Order -------------------------------------------------------------
  OrderItemModifier: {
    type: 'object',
    properties: {
      id: uuid,
      groupName: { type: 'string' },
      optionName: { type: 'string' },
      unitPriceDeltaIdr: money('Selisih harga modifier dalam rupiah.'),
      quantity: { type: 'integer' },
    },
  },
  OrderItem: {
    type: 'object',
    properties: {
      id: uuid,
      orderId: uuid,
      productId: nullableUuid(),
      variantId: nullableUuid(),
      productName: { type: 'string', description: 'Snapshot nama saat pesanan dibuat.' },
      variantName: { type: 'string' },
      sku: nullableString,
      quantity: { type: 'integer', minimum: 1 },
      unitPriceIdr: money('Harga satuan dalam rupiah.'),
      modifiersTotalIdr: money('Total tambahan harga modifier per unit.'),
      lineTotalIdr: money('quantity * (unitPriceIdr + modifiersTotalIdr).'),
      itemStatus: { type: 'string', enum: ['pending', 'preparing', 'ready', 'cancelled'] },
      specialInstructions: nullableString,
      imageUrl: nullableString,
      modifiers: { type: 'array', items: ref('OrderItemModifier') },
    },
  },
  OrderSummary: {
    type: 'object',
    properties: {
      id: uuid,
      orderNumber: { type: 'string', example: 'SMO-20260105-8F3K2A' },
      branchId: uuid,
      branchName: { type: 'string' },
      fulfillmentType: { type: 'string', enum: ['delivery', 'pickup', 'dine_in'] },
      orderStatus: {
        type: 'string',
        enum: ['placed', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled', 'rejected'],
      },
      paymentStatus: { type: 'string', enum: ['unpaid', 'pending', 'paid', 'partially_refunded', 'refunded', 'failed'] },
      totalIdr: money('Total akhir yang harus dibayar.'),
      itemCount: { type: 'integer' },
      thumbnailUrl: nullableString,
      placedAt: { type: 'string', format: 'date-time' },
    },
  },
  OrderDetail: {
    allOf: [ref('OrderSummary')],
    type: 'object',
    properties: {
      currency: { type: 'string', example: 'IDR' },
      subtotalIdr: money('Total harga barang sebelum diskon.'),
      discountIdr: money('Total diskon yang terpakai.'),
      taxIdr: money('Pajak.'),
      deliveryFeeIdr: money('Biaya antar.'),
      serviceFeeIdr: money('Biaya layanan.'),
      promoId: nullableUuid(),
      voucherId: nullableUuid(),
      customerNotes: nullableString,
      deliveryStatus: nullableString,
      deliveryRecipientName: nullableString,
      deliveryRecipientPhone: nullableString,
      deliveryAddressSnapshot: { type: 'object', additionalProperties: true, nullable: true },
      tableId: nullableUuid(),
      pickupAt: dateTime,
      acceptedAt: dateTime,
      completedAt: dateTime,
      cancelledAt: dateTime,
      items: { type: 'array', items: ref('OrderItem') },
    },
  },
  OrderStatusHistory: {
    type: 'object',
    properties: {
      id: uuid,
      fromStatus: nullableString,
      toStatus: { type: 'string' },
      note: nullableString,
      changedByName: nullableString,
      occurredAt: { type: 'string', format: 'date-time' },
    },
  },

  // -- Payment -----------------------------------------------------------
  PaymentTransaction: {
    type: 'object',
    properties: {
      id: uuid,
      orderId: nullableUuid(),
      provider: { type: 'string', example: 'midtrans' },
      paymentMethod: { type: 'string', enum: ['qris', 'virtual_account', 'bank_transfer', 'ewallet', 'card', 'cash'] },
      transactionType: { type: 'string', enum: ['charge', 'refund'] },
      paymentPurpose: {
        type: 'string',
        enum: ['order', 'event_deposit', 'event_installment', 'event_final', 'event_refund'],
      },
      status: { type: 'string', enum: ['pending', 'succeeded', 'failed', 'expired', 'cancelled'] },
      amountIdr: money('Nominal transaksi dalam rupiah.'),
      currency: { type: 'string', example: 'IDR' },
      providerReference: nullableString,
      paymentUrl: { type: 'string', nullable: true },
      expiresAt: dateTime,
      paidAt: dateTime,
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
  ChargeResult: {
    type: 'object',
    properties: {
      payment: ref('PaymentTransaction'),
      order: ref('OrderSummary'),
      instructions: { type: 'string', nullable: true, description: 'Petunjuk singkat untuk customer.' },
    },
  },

  // -- Delivery ----------------------------------------------------------
  DeliveryTrackingPoint: {
    type: 'object',
    properties: {
      latitude: { type: 'number' },
      longitude: { type: 'number' },
      recordedAt: { type: 'string', format: 'date-time' },
    },
  },
  OrderDelivery: {
    type: 'object',
    properties: {
      id: uuid,
      orderId: uuid,
      provider: nullableString,
      trackingCode: nullableString,
      driverName: nullableString,
      driverPhone: nullableString,
      deliveryStatus: {
        type: 'string',
        enum: ['awaiting_assignment', 'assigned', 'picked_up', 'in_transit', 'delivered', 'failed', 'cancelled'],
      },
      estimatedDeliveryAt: dateTime,
      deliveredAt: dateTime,
      latestPoint: nullableStringRef('DeliveryTrackingPoint'),
    },
  },

  // -- Review ------------------------------------------------------------
  Review: {
    type: 'object',
    properties: {
      id: uuid,
      userId: uuid,
      authorName: { type: 'string' },
      productId: nullableUuid(),
      productName: nullableString,
      foodRating: { type: 'integer', nullable: true, minimum: 1, maximum: 5 },
      serviceRating: { type: 'integer', nullable: true, minimum: 1, maximum: 5 },
      speedRating: { type: 'integer', nullable: true, minimum: 1, maximum: 5 },
      reviewText: nullableString,
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
  ReviewSummary: {
    type: 'object',
    properties: {
      total: { type: 'integer' },
      averageFood: { type: 'number', nullable: true },
      averageService: { type: 'number', nullable: true },
      averageSpeed: { type: 'number', nullable: true },
      distribution: { type: 'object', additionalProperties: { type: 'integer' } },
    },
  },

  // -- Reservation -------------------------------------------------------
  Reservation: {
    type: 'object',
    properties: {
      id: uuid,
      reservationNumber: { type: 'string', example: 'RSV-20260105-7KD2M' },
      branchId: uuid,
      branchName: { type: 'string' },
      areaId: nullableUuid(),
      reservedFor: { type: 'string', format: 'date-time' },
      durationMinutes: { type: 'integer', minimum: 15, maximum: 720 },
      guestCount: { type: 'integer', minimum: 1 },
      seatingPreference: { type: 'string', nullable: true, enum: ['indoor', 'outdoor', 'private_room', 'any'] },
      status: { type: 'string', enum: ['requested', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show'] },
      specialRequests: nullableString,
      tables: { type: 'array', items: ref('CafeTable') },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },

  // -- Event -------------------------------------------------------------
  EventPackage: {
    type: 'object',
    properties: {
      id: uuid,
      code: { type: 'string', example: 'BIRTHDAY-BASIC' },
      name: { type: 'string' },
      description: nullableString,
      basePriceIdr: money('Harga dasar paket event dalam rupiah.'),
      minimumGuests: { type: 'integer' },
      maximumGuests: { type: 'integer', nullable: true },
      inclusions: { type: 'array', items: { type: 'string' } },
      isActive: { type: 'boolean' },
    },
  },
  CateringPackage: {
    type: 'object',
    properties: {
      id: uuid,
      code: { type: 'string', example: 'CATERING-150' },
      name: { type: 'string' },
      description: nullableString,
      pricePerPersonIdr: money('Harga per orang dalam rupiah.'),
      minimumGuests: { type: 'integer' },
      maximumGuests: { type: 'integer', nullable: true },
      menuDetails: { type: 'array', items: { type: 'string' } },
      leadTimeHours: { type: 'integer', description: 'Jam minimal untuk pemesanan.' },
      isActive: { type: 'boolean' },
    },
  },
  EventBookingCateringLine: {
    type: 'object',
    properties: {
      id: uuid,
      cateringPackageId: nullableUuid(),
      packageName: { type: 'string' },
      pricePerPersonIdr: money('Harga per orang hasil snapshot saat booking.'),
      guestCount: { type: 'integer' },
      lineTotalIdr: money('pricePerPersonIdr * guestCount.'),
    },
  },
  EventBookingAddonLine: {
    type: 'object',
    properties: {
      id: uuid,
      name: { type: 'string' },
      quantity: { type: 'integer' },
      unitPriceIdr: money('Harga satuan dalam rupiah.'),
      lineTotalIdr: money('quantity * unitPriceIdr.'),
    },
  },
  EventBooking: {
    type: 'object',
    properties: {
      id: uuid,
      bookingNumber: { type: 'string', example: 'EVT-20260105-9QW3ZP' },
      branchId: uuid,
      branchName: { type: 'string' },
      eventType: {
        type: 'string',
        enum: ['birthday', 'arisan', 'meeting', 'gathering', 'engagement', 'wedding', 'seminar', 'reunion', 'bukber', 'family_gathering', 'other'],
      },
      eventName: nullableString,
      startsAt: { type: 'string', format: 'date-time' },
      endsAt: dateTime,
      guestCount: { type: 'integer', minimum: 1 },
      eventPackageName: nullableString,
      eventPackagePriceIdr: money('Harga paket event hasil snapshot.'),
      subtotalIdr: money('Subtotal seluruh paket, catering, dan addon.'),
      depositIdr: money('DP yang harus dibayar.'),
      paidIdr: money('Sudah dibayar.'),
      status: {
        type: 'string',
        enum: ['requested', 'quoted', 'awaiting_deposit', 'confirmed', 'in_progress', 'completed', 'cancelled'],
      },
      customRequests: nullableString,
      catering: { type: 'array', items: ref('EventBookingCateringLine') },
      addons: { type: 'array', items: ref('EventBookingAddonLine') },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },

  // -- Inventory ---------------------------------------------------------
  Ingredient: {
    type: 'object',
    properties: {
      id: uuid,
      sku: { type: 'string', example: 'ING-BEAN-ARAB-1KG' },
      name: { type: 'string' },
      baseUnit: { type: 'string', example: 'gram' },
      reorderLevel: { type: 'number', description: 'Ambang stok menipis.' },
      isActive: { type: 'boolean' },
    },
  },
  RecipeItem: {
    type: 'object',
    properties: {
      productVariantId: uuid,
      ingredientId: uuid,
      ingredientName: { type: 'string' },
      baseUnit: { type: 'string' },
      quantityInBaseUnit: { type: 'number', exclusiveMinimum: 0 },
      expectedWastePercent: { type: 'number', minimum: 0, maximum: 100 },
    },
  },
  StockLocation: {
    type: 'object',
    properties: { id: uuid, branchId: uuid, branchName: { type: 'string' }, name: { type: 'string' } },
  },
  InventoryMovement: {
    type: 'object',
    properties: {
      id: uuid,
      stockLocationId: uuid,
      ingredientId: uuid,
      ingredientName: { type: 'string' },
      quantityDelta: { type: 'number', description: 'Positif menambah stok, negatif mengurangi.' },
      movementType: {
        type: 'string',
        enum: ['purchase', 'order_consumption', 'waste', 'adjustment', 'transfer_in', 'transfer_out'],
      },
      referenceType: nullableString,
      referenceId: nullableUuid(),
      notes: nullableString,
      createdAt: { type: 'string', format: 'date-time' },
    },
  },

  // -- Moment ------------------------------------------------------------
  MomentMedia: {
    type: 'object',
    properties: {
      id: uuid,
      publicUrl: nullableString,
      mediaType: { type: 'string', enum: ['image', 'video'] },
      sortOrder: { type: 'integer' },
    },
  },
  Moment: {
    type: 'object',
    properties: {
      id: uuid,
      userId: nullableUuid(),
      authorName: { type: 'string' },
      authorAvatarUrl: nullableString,
      title: nullableString,
      caption: nullableString,
      eventType: { type: 'string', nullable: true, enum: ['community', 'birthday', 'wedding', 'event', 'other'] },
      media: { type: 'array', items: ref('MomentMedia') },
      likeCount: { type: 'integer' },
      commentCount: { type: 'integer' },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },

  // -- Notification ------------------------------------------------------
  Notification: {
    type: 'object',
    properties: {
      id: uuid,
      channel: { type: 'string', enum: ['in_app', 'push', 'email', 'sms'] },
      title: { type: 'string' },
      body: { type: 'string' },
      actionUrl: nullableString,
      status: { type: 'string', enum: ['queued', 'sent', 'failed', 'read'] },
      scheduledAt: { type: 'string', format: 'date-time' },
      sentAt: dateTime,
      readAt: dateTime,
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
  NotificationDevice: {
    type: 'object',
    properties: {
      id: uuid,
      provider: { type: 'string', enum: ['fcm', 'apns', 'web_push'] },
      deviceLabel: nullableString,
      lastSeenAt: { type: 'string', format: 'date-time' },
      revokedAt: dateTime,
    },
  },

  // -- Chat --------------------------------------------------------------
  ChatConversation: {
    type: 'object',
    properties: {
      id: uuid,
      userId: uuid,
      userName: { type: 'string' },
      assignedStaffId: nullableUuid(),
      assignedStaffName: nullableString,
      topic: { type: 'string' },
      status: { type: 'string', enum: ['open', 'waiting', 'resolved', 'closed'] },
      lastMessagePreview: nullableString,
      lastMessageAt: dateTime,
      unreadCount: { type: 'integer' },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
  ChatMessage: {
    type: 'object',
    properties: {
      id: uuid,
      conversationId: uuid,
      senderType: { type: 'string', enum: ['customer', 'staff', 'assistant', 'system'] },
      senderUserId: nullableUuid(),
      senderName: nullableString,
      body: { type: 'string' },
      attachmentUrl: nullableString,
      createdAt: { type: 'string', format: 'date-time' },
    },
  },

  // -- Gamification ------------------------------------------------------
  GamificationActivity: {
    type: 'object',
    properties: {
      id: uuid,
      code: { type: 'string', example: 'daily_checkin' },
      name: { type: 'string' },
      activityType: { type: 'string', enum: ['daily_checkin', 'spin_wheel', 'challenge', 'other'] },
      rules: { type: 'object', additionalProperties: true },
      startsAt: dateTime,
      endsAt: dateTime,
      isActive: { type: 'boolean' },
    },
  },
  GamificationReward: {
    type: 'object',
    properties: {
      id: uuid,
      rewardType: { type: 'string', enum: ['points', 'voucher', 'free_product', 'none'] },
      rewardValue: { type: 'integer' },
      weight: { type: 'integer' },
      isWin: { type: 'boolean', description: 'True bila reward ini BringingToLife.' },
    },
  },
  GamificationPlay: {
    type: 'object',
    properties: {
      id: uuid,
      activityId: uuid,
      activityCode: { type: 'string' },
      reward: ref('GamificationReward'),
      playedAt: { type: 'string', format: 'date-time' },
      result: { type: 'object', additionalProperties: true },
    },
  },

  // -- AI ----------------------------------------------------------------
  AiConversation: {
    type: 'object',
    properties: {
      id: uuid,
      userId: nullableUuid(),
      purpose: { type: 'string', enum: ['customer_support', 'admin_assistant'] },
      status: { type: 'string', enum: ['open', 'closed'] },
      createdAt: { type: 'string', format: 'date-time' },
      closedAt: dateTime,
    },
  },
  AiMessage: {
    type: 'object',
    properties: {
      id: uuid,
      conversationId: uuid,
      role: { type: 'string', enum: ['user', 'assistant', 'tool'] },
      content: { type: 'string' },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },

  // -- Request body auth -------------------------------------------------
  RegisterRequest: {
    type: 'object',
    required: ['password', 'displayName'],
    properties: {
      email: { type: 'string', format: 'email', description: 'Minimal salah satu dari email atau phoneE164 wajib diisi.' },
      phoneE164: { type: 'string', example: '628111000111' },
      password: { type: 'string', minLength: 8, description: 'Wajib mengandung huruf besar, huruf kecil, dan angka.' },
      displayName: { type: 'string', minLength: 2, maxLength: 120 },
      marketingOptIn: { type: 'boolean', default: false },
      birthDate: { type: 'string', format: 'date', example: '1998-04-17' },
      deviceLabel: { type: 'string', example: 'iPhone 15' },
    },
  },
  LoginRequest: {
    type: 'object',
    required: ['identifier', 'password'],
    properties: {
      identifier: { type: 'string', description: 'Email atau nomor telepon.' },
      password: { type: 'string' },
      deviceLabel: { type: 'string' },
    },
  },
  LogoutRequest: {
    type: 'object',
    properties: { allDevices: { type: 'boolean', default: false } },
  },
  RefreshRequest: {
    type: 'object',
    properties: {
      refreshToken: {
        type: 'string',
        description: 'Kosongkan bila client memakai cookie httpOnly yang terbit otomatis.',
      },
    },
  },
  OtpRequestInput: {
    type: 'object',
    required: ['phoneE164', 'purpose'],
    properties: {
      phoneE164: { type: 'string', example: '628111000111' },
      purpose: { type: 'string', enum: ['login', 'signup', 'verify_phone', 'password_reset'] },
      deviceLabel: { type: 'string' },
    },
  },
  OtpVerifyInput: {
    type: 'object',
    required: ['phoneE164', 'purpose', 'code'],
    properties: {
      phoneE164: { type: 'string' },
      purpose: { type: 'string', enum: ['login', 'signup', 'verify_phone', 'password_reset'] },
      code: { type: 'string', description: 'Kode OTP 4-10 digit.' },
      displayName: { type: 'string', description: 'Wajib bila purpose signup dan akun baru.' },
      deviceLabel: { type: 'string' },
    },
  },
  ForgotPasswordRequest: {
    type: 'object',
    required: ['identifier'],
    properties: { identifier: { type: 'string', description: 'Email atau nomor telepon.' } },
  },
  ResetPasswordRequest: {
    type: 'object',
    required: ['identifier', 'token', 'newPassword'],
    properties: {
      identifier: { type: 'string' },
      token: { type: 'string', description: 'Token reset atau kode OTP password_reset.' },
      newPassword: { type: 'string', minLength: 8 },
    },
  },
  ChangePasswordRequest: {
    type: 'object',
    required: ['currentPassword', 'newPassword'],
    properties: {
      currentPassword: { type: 'string' },
      newPassword: { type: 'string', minLength: 8 },
    },
  },
  OAuthRequest: {
    type: 'object',
    required: ['idToken'],
    properties: {
      idToken: { type: 'string', description: 'ID token yang diperoleh dari SDK Google / Apple.' },
      deviceLabel: { type: 'string' },
    },
  },
  AuthContextResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', enum: [true] },
      data: {
        type: 'object',
        properties: {
          user: ref('User'),
          sessionId: uuid,
          roles: { type: 'array', items: ref('Role') },
          permissions: { type: 'array', items: ref('Permission') },
        },
      },
    },
  },
  DeviceSessionList: {
    type: 'object',
    properties: {
      success: { type: 'boolean', enum: [true] },
      data: {
        type: 'object',
        properties: { sessions: { type: 'array', items: ref('DeviceSession') } },
      },
    },
  },
  MessageResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', enum: [true] },
      data: { type: 'object', properties: { message: { type: 'string' } } },
    },
  },

  // -- Profile, address, family ------------------------------------------
  UpdateProfileRequest: {
    type: 'object',
    description: 'Partial update: hanya field yang dikirim yang berubah.',
    properties: {
      displayName: { type: 'string', minLength: 2, maxLength: 120 },
      email: { type: 'string', format: 'email' },
      birthDate: { type: 'string', format: 'date' },
      marketingOptIn: { type: 'boolean' },
    },
  },
  TierProgressResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', enum: [true] },
      data: {
        type: 'object',
        properties: {
          tier: nullableStringRef('CustomerTier'),
          lifetimePoints: { type: 'integer', description: 'Akumulasi poin seumur akun.' },
          pointsToNextTier: { type: 'integer', nullable: true, description: 'Poin yang kurang untuk naik tier.' },
          nextTier: nullableStringRef('CustomerTier'),
        },
      },
    },
  },
  FamilyGroupEnvelope: {
    type: 'object',
    properties: {
      success: { type: 'boolean', enum: [true] },
      data: {
        type: 'object',
        properties: {
          group: nullableStringRef('FamilyGroup'),
          memberCount: { type: 'integer' },
        },
      },
    },
  },
  CreateAddressRequest: {
    type: 'object',
    required: ['label', 'recipientName', 'recipientPhone', 'addressLine', 'city'],
    properties: {
      label: { type: 'string', minLength: 1, maxLength: 40, example: 'Rumah' },
      recipientName: { type: 'string', maxLength: 120 },
      recipientPhone: { type: 'string' },
      addressLine: { type: 'string', maxLength: 255 },
      addressDetail: { type: 'string', nullable: true },
      city: { type: 'string', maxLength: 100 },
      province: { type: 'string', nullable: true },
      postalCode: { type: 'string', nullable: true },
      latitude: { type: 'number', minimum: -90, maximum: 90, nullable: true },
      longitude: { type: 'number', minimum: -180, maximum: 180, nullable: true },
      deliveryInstructions: { type: 'string', nullable: true },
      isDefault: { type: 'boolean', default: false },
    },
  },
  UpdateAddressRequest: {
    type: 'object',
    description: 'Partial update dari CreateAddressRequest.',
    properties: {
      label: { type: 'string' },
      recipientName: { type: 'string' },
      recipientPhone: { type: 'string' },
      addressLine: { type: 'string' },
      addressDetail: { type: 'string', nullable: true },
      city: { type: 'string' },
      province: { type: 'string', nullable: true },
      postalCode: { type: 'string', nullable: true },
      latitude: { type: 'number', nullable: true },
      longitude: { type: 'number', nullable: true },
      deliveryInstructions: { type: 'string', nullable: true },
    },
  },
  CreateFamilyMemberRequest: {
    type: 'object',
    required: ['displayName'],
    properties: {
      displayName: { type: 'string', minLength: 1, maxLength: 120 },
      relationship: { type: 'string', nullable: true, maxLength: 40, example: 'Anak' },
      birthDate: { type: 'string', format: 'date' },
      linkedUserId: { type: 'string', format: 'uuid', nullable: true, description: 'ID user yang sudah punya akun Semoet.' },
    },
  },
  UpdateFamilyMemberRequest: {
    type: 'object',
    properties: {
      displayName: { type: 'string' },
      relationship: { type: 'string', nullable: true },
      birthDate: { type: 'string', format: 'date' },
    },
  },

  // -- Order -------------------------------------------------------------
  CreateOrderRequest: {
    type: 'object',
    required: ['branchId', 'fulfillmentType', 'items'],
    properties: {
      branchId: uuid,
      fulfillmentType: {
        type: 'string',
        enum: ['delivery', 'pickup', 'dine_in'],
        description: 'delivery butuh addressId, dine_in butuh tableId.',
      },
      items: { type: 'array', minItems: 1, items: ref('CreateOrderItem') },
      promoCode: { type: 'string', nullable: true, description: 'Kode promo publik yang akan dihitung server.' },
      voucherId: { type: 'string', format: 'uuid', nullable: true, description: 'ID voucher milik user sendiri.' },
      addressId: { ...uuid, nullable: true } as SchemaLike,
      tableId: { ...uuid, nullable: true } as SchemaLike,
      pickupAt: { type: 'string', format: 'date-time', nullable: true },
      customerNotes: { type: 'string', nullable: true, maxLength: 500 },
    },
  },
  CreateOrderItem: {
    type: 'object',
    required: ['productId', 'variantId', 'quantity'],
    properties: {
      productId: uuid,
      variantId: uuid,
      quantity: { type: 'integer', minimum: 1, maximum: 99 },
      modifiers: {
        type: 'array',
        description: 'Pilihan modifier per item. Jumlah wajib sesuai min/max grup.',
        items: ref('CreateOrderItemModifier'),
      },
      specialInstructions: { type: 'string', nullable: true, maxLength: 300 },
    },
  },
  CreateOrderItemModifier: {
    type: 'object',
    required: ['optionId'],
    properties: {
      optionId: uuid,
      quantity: { type: 'integer', minimum: 1, default: 1 },
    },
  },
  CreateChargeRequest: {
    type: 'object',
    required: ['orderId', 'paymentMethod'],
    properties: {
      orderId: uuid,
      paymentMethod: { type: 'string', enum: ['qris', 'virtual_account', 'bank_transfer', 'ewallet', 'card', 'cash'] },
      provider: { type: 'string', nullable: true, description: 'Default dari env PAYMENT_PROVIDER_DEFAULT.' },
      amountIdr: {
        type: 'integer',
        nullable: true,
        description: 'Hanya untuk partial payment. Kosongkan untuk melunasi seluruh total order.',
      },
    },
  },
  RefundRequest: {
    type: 'object',
    properties: {
      amountIdr: { type: 'integer', minimum: 1, description: 'Kosongkan untuk refund penuh.' },
      reason: { type: 'string', maxLength: 500 },
    },
  },
  PaymentWebhookRequest: {
    type: 'object',
    required: ['providerEventId', 'eventType'],
    properties: {
      providerEventId: { type: 'string', description: 'Id unik event dari provider, dipakai idempotensi.' },
      provider: { type: 'string', nullable: true },
      eventType: {
        type: 'string',
        enum: ['payment.succeeded', 'payment.pending', 'payment.failed', 'payment.expired', 'payment.cancelled', 'refund.succeeded'],
      },
      transactionStatus: { type: 'string', nullable: true },
      providerReference: { type: 'string', nullable: true },
      amountIdr: { type: 'integer', nullable: true },
      orderId: { ...uuid, nullable: true } as SchemaLike,
      paidAt: { type: 'string', format: 'date-time', nullable: true },
      raw: { type: 'object', additionalProperties: true, nullable: true, description: 'Payload mentah provider, disimpan di raw_provider_data.' },
    },
  },
  AssignDeliveryRequest: {
    type: 'object',
    properties: {
      provider: { type: 'string', nullable: true, example: 'gojek' },
      driverName: { type: 'string', nullable: true },
      driverPhone: { type: 'string', nullable: true },
      trackingCode: { type: 'string', nullable: true },
      estimatedDeliveryAt: { type: 'string', format: 'date-time', nullable: true },
      notes: { type: 'string', nullable: true },
    },
  },
  DeliveryTrackingRequest: {
    type: 'object',
    required: ['latitude', 'longitude'],
    properties: {
      latitude: { type: 'number', minimum: -90, maximum: 90 },
      longitude: { type: 'number', minimum: -180, maximum: 180 },
      recordedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Default waktu server.' },
    },
  },
  UpdateDeliveryStatusRequest: {
    type: 'object',
    required: ['deliveryStatus'],
    properties: {
      deliveryStatus: {
        type: 'string',
        enum: ['awaiting_assignment', 'assigned', 'picked_up', 'in_transit', 'delivered', 'failed', 'cancelled'],
      },
      note: { type: 'string', nullable: true },
      estimatedDeliveryAt: { type: 'string', format: 'date-time', nullable: true },
    },
  },

  // -- Promo, loyalty, review, reservasi, event --------------------------
  ValidateVoucherRequest: {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'Kode voucher yang dimiliki user.' },
      voucherId: { type: 'string', format: 'uuid', nullable: true },
      subtotalIdr: { type: 'integer', minimum: 0, description: 'Subtotal belanja untuk simulasi diskon.' },
      productIds: {
        type: 'array',
        items: uuid,
        description: 'Produk yang ada di keranjang; dipakai mengecek eligibility promo.',
      },
    },
  },
  VoucherValidationResult: {
    type: 'object',
    properties: {
      isValid: { type: 'boolean' },
      message: { type: 'string', nullable: true, description: 'Alasan bila tidak valid.' },
      discountIdr: { type: 'integer', description: 'Perkiraan nominal diskon.' },
      promoId: { ...uuid, nullable: true } as SchemaLike,
      promoName: { type: 'string', nullable: true },
      voucherId: { ...uuid, nullable: true } as SchemaLike,
      remainingQuota: { type: 'integer', nullable: true },
    },
  },
  UpdateReviewRequest: {
    type: 'object',
    properties: {
      foodRating: { type: 'integer', minimum: 1, maximum: 5, nullable: true },
      serviceRating: { type: 'integer', minimum: 1, maximum: 5, nullable: true },
      speedRating: { type: 'integer', minimum: 1, maximum: 5, nullable: true },
      reviewText: { type: 'string', nullable: true, maxLength: 2000 },
    },
  },
  CreateReservationRequest: {
    type: 'object',
    required: ['branchId', 'reservedFor', 'guestCount'],
    properties: {
      branchId: uuid,
      areaId: { ...uuid, nullable: true } as SchemaLike,
      reservedFor: { type: 'string', format: 'date-time' },
      durationMinutes: { type: 'integer', minimum: 15, maximum: 720, default: 120 },
      guestCount: { type: 'integer', minimum: 1, maximum: 100 },
      seatingPreference: { type: 'string', nullable: true, enum: ['indoor', 'outdoor', 'private_room', 'any'] },
      tableIds: { type: 'array', items: uuid, description: 'Meja yang ingin diamankan (opsional).' },
      specialRequests: { type: 'string', nullable: true, maxLength: 500 },
    },
  },
  EventAvailabilityDate: {
    type: 'object',
    properties: {
      date: { type: 'string', format: 'date' },
      isAvailable: { type: 'boolean' },
      maxGuests: { type: 'integer', nullable: true, description: 'Perkiraan kapasitas tersedia.' },
      bookedSlots: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            startsAt: { type: 'string', format: 'date-time' },
            endsAt: { type: 'string', format: 'date-time', nullable: true },
            eventName: { type: 'string', nullable: true },
          },
        },
      },
    },
  },
  CreateEventBookingRequest: {
    type: 'object',
    required: ['branchId', 'eventType', 'startsAt', 'guestCount'],
    properties: {
      branchId: uuid,
      eventPackageId: { ...uuid, nullable: true } as SchemaLike,
      eventType: {
        type: 'string',
        enum: ['birthday', 'arisan', 'meeting', 'gathering', 'engagement', 'wedding', 'seminar', 'reunion', 'bukber', 'family_gathering', 'other'],
      },
      eventName: { type: 'string', nullable: true, maxLength: 120 },
      startsAt: { type: 'string', format: 'date-time' },
      endsAt: { type: 'string', format: 'date-time', nullable: true },
      guestCount: { type: 'integer', minimum: 1 },
      catering: { type: 'array', items: ref('CreateBookingCatering') },
      addons: { type: 'array', items: ref('CreateBookingAddon') },
      customRequests: { type: 'string', nullable: true, maxLength: 1000 },
    },
  },
  CreateBookingCatering: {
    type: 'object',
    required: ['guestCount'],
    properties: {
      cateringPackageId: { type: 'string', format: 'uuid', nullable: true },
      packageName: { type: 'string', nullable: true, description: 'Kustom katering; wajib bila cateringPackageId kosong.' },
      pricePerPersonIdr: { type: 'integer', minimum: 0, nullable: true, description: 'Harga per orang untuk kustom katering.' },
      guestCount: { type: 'integer', minimum: 1 },
    },
  },
  CreateBookingAddon: {
    type: 'object',
    required: ['name', 'unitPriceIdr'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 120 },
      quantity: { type: 'integer', minimum: 1, default: 1 },
      unitPriceIdr: { type: 'integer', minimum: 0 },
    },
  },

  CreateReviewRequest: {
    type: 'object',
    required: ['orderItemId'],
    description: 'Minimal satu dari foodRating / serviceRating / speedRating wajib diisi.',
    properties: {
      orderItemId: { type: 'string', format: 'uuid', description: 'Item pesanan yang direview.' },
      foodRating: { type: 'integer', minimum: 1, maximum: 5, nullable: true },
      serviceRating: { type: 'integer', minimum: 1, maximum: 5, nullable: true },
      speedRating: { type: 'integer', minimum: 1, maximum: 5, nullable: true },
      reviewText: { type: 'string', nullable: true, maxLength: 2000 },
    },
  },

  // -- Admin -------------------------------------------------------------
  AdminDailySales: {
    type: 'object',
    properties: {
      branchId: uuid,
      branchName: { type: 'string' },
      businessDate: { type: 'string', format: 'date' },
      orderCount: { type: 'integer' },
      paidSalesIdr: money('Akumulasi penjualan yang sudah dibayar.'),
    },
  },
  AdminSalesSummary: {
    type: 'object',
    properties: {
      from: { type: 'string', format: 'date' },
      to: { type: 'string', format: 'date' },
      totalOrders: { type: 'integer' },
      paidSalesIdr: money('Total penjualan terbayar dalam rentang.'),
      averageOrderIdr: money('Rata-rata nilai pesanan.'),
      paidOrderCount: { type: 'integer' },
      cancelledOrderCount: { type: 'integer' },
      ordersByStatus: { type: 'array', items: ref('AdminStatusCount') },
    },
  },
  AdminStatusCount: {
    type: 'object',
    properties: { orderStatus: { type: 'string' }, count: { type: 'integer' } },
  },
  AuditLog: {
    type: 'object',
    properties: {
      id: { type: 'integer', description: 'bigserial' },
      actorUserId: nullableUuid(),
      actorName: nullableString,
      action: { type: 'string', example: 'order.status.update' },
      entityType: { type: 'string', example: 'order' },
      entityId: nullableUuid(),
      oldData: { type: 'object', additionalProperties: true, nullable: true },
      newData: { type: 'object', additionalProperties: true, nullable: true },
      requestId: nullableString,
      ipAddress: nullableString,
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
};

// --------------------------------------------------------------------------
// Response reusable
// --------------------------------------------------------------------------
const responses: Record<string, ResponseLike> = {
  Unauthorized: commonErrors.unauthorized,
  Forbidden: commonErrors.forbidden,
  NotFound: commonErrors.notFound,
  Conflict: commonErrors.conflict,
  ValidationError: commonErrors.validation,
  RateLimited: commonErrors.rateLimited,
  ServerError: {
    description: 'Terjadi kesalahan pada server.',
    content: { 'application/json': { schema: ref('ErrorResponse') } },
  },
};

export const components: ComponentsObject = {
  schemas,
  parameters: {},
  responses,
  headers: {},
  requestBodies: {},
  securitySchemes,
};

export { successResponse };