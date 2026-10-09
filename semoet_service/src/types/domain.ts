/** Role + permission milik user yang sudah diautentikasi. */
export interface RoleContext {
  code: string;
  name: string;
}

export interface PermissionContext {
  resource: string;
  action: string;
}

/** Objek yang diattach ke req.user oleh middleware authenticate. */
export interface AuthContext {
  id: string;
  sessionId: string;
  email: string | null;
  phone: string | null;
  displayName: string;
  status: string;
  roles: RoleContext[];
  roleCodes: string[];
  permissions: PermissionContext[];
  permissionKeys: string[];
  isSuperAdmin: boolean;
  isStaff: boolean;
}

export interface SessionDevice {
  deviceLabel?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Bentuk token yang dikembalikan endpoint auth. */
export interface AuthTokensPayload {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  accessTokenExpiresAt: string;
  tokenType: 'Bearer';
}

export interface AuthResult {
  user: Record<string, unknown>;
  tokens: AuthTokensPayload;
  sessionId: string;
  isNewUser: boolean;
}

export interface OrderItemInput {
  productId: string;
  variantId: string;
  quantity: number;
  modifiers?: Array<{ optionId: string; quantity?: number }>;
  specialInstructions?: string | null;
}

export interface CreateOrderInput {
  branchId: string;
  fulfillmentType: 'delivery' | 'pickup' | 'dine_in';
  items: OrderItemInput[];
  promoCode?: string | null;
  voucherId?: string | null;
  addressId?: string | null;
  tableId?: string | null;
  pickupAt?: string | null;
  customerNotes?: string | null;
  idempotencyKey?: string | null;
}

export interface OrderTotalsSnapshot {
  subtotalIdr: number;
  discountIdr: number;
  taxIdr: number;
  deliveryFeeIdr: number;
  serviceFeeIdr: number;
  totalIdr: number;
}

export interface PromoValidationResult {
  valid: boolean;
  message?: string;
  discountIdr: number;
  promoId?: string | null;
  voucherId?: string | null;
  promoName?: string | null;
}

export interface PointsSummary {
  balance: number;
  lifetimeEarned: number;
  lifetimeRedeemed: number;
  lifetimeExpired: number;
  expiringSoon: number;
  nextExpiryAt: string | null;
  tier: {
    id: string | null;
    code: string | null;
    name: string | null;
    minimumLifetimePoints: number;
    benefits: Record<string, unknown>;
    pointsToNextTier: number | null;
  } | null;
}