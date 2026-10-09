import * as authRepo from '../repositories/auth.repository.js';
import * as loyaltyRepo from '../repositories/loyalty.repository.js';
import * as userRepo from '../repositories/user.repository.js';
import { buildPaginationMeta, parsePagination, type Pagination } from '../utils/pagination.js';
import { conflict, unprocessable } from '../errors/AppError.js';
import type {
  UpdateMeInput,
  UpdatePreferencesInput,
} from '../validators/user.validator.js';

function shapeTier(row: Record<string, unknown>) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    minimumLifetimePoints: row.minimumLifetimePoints ?? row.minimum_lifetime_points,
    benefits: row.benefits,
    isActive: Boolean(row.isActive ?? row.is_active),
  };
}

function shapeProfileRow(row: Record<string, unknown>) {
  return {
    userId: row.id ?? row.userId,
    email: row.email,
    phoneE164: row.phoneE164 ?? row.phone_e164,
    displayName: row.displayName ?? row.display_name,
    status: row.status,
    emailVerifiedAt: row.emailVerifiedAt ?? row.email_verified_at,
    phoneVerifiedAt: row.phoneVerifiedAt ?? row.phone_verified_at,
    lastLoginAt: row.lastLoginAt ?? row.last_login_at,
    createdAt: row.createdAt ?? row.created_at,
    tierId: row.tierId ?? row.tier_id,
    birthDate: row.birthDate ?? row.birth_date,
    marketingOptIn: Boolean(row.marketingOptIn ?? row.marketing_opt_in),
    preferences: row.preferences ?? {},
    tierCode: row.tierCode ?? row.tier_code,
    tierName: row.tierName ?? row.tier_name,
    tierBenefits: row.tierBenefits ?? row.tier_benefits,
  };
}

export async function getMyProfile(userId: string) {
  const [profile, preferences, customerProfile, loyaltyPoints] = await Promise.all([
    userRepo.findProfile(userId),
    userRepo.findPreferences(userId),
    authRepo.findCustomerProfile(userId),
    loyaltyRepo.getPointsSummary(userId),
  ]);

  const combined: Record<string, unknown> = {
    ...(profile ?? {}),
    preferences: preferences ?? {},
  };

  if (customerProfile) {
    combined.birthDate = combined.birthDate ?? customerProfile.birth_date;
    combined.marketingOptIn = combined.marketingOptIn ?? customerProfile.marketing_opt_in;
  }

  return {
    profile: shapeProfileRow(combined),
    loyalty: {
      balance: loyaltyPoints?.balance ?? 0,
      lifetimeEarned: loyaltyPoints?.lifetimeEarned ?? 0,
      lifetimeRedeemed: loyaltyPoints?.lifetimeRedeemed ?? 0,
      lifetimeExpired: loyaltyPoints?.lifetimeExpired ?? 0,
      expiringSoon: loyaltyPoints?.expiringSoon ?? 0,
      nextExpiryAt: loyaltyPoints?.nextExpiryAt ?? null,
    },
  };
}

export async function updateMe(userId: string, input: UpdateMeInput) {
  const userUpdates: Record<string, unknown> = {};
  const customerUpdates: Record<string, unknown> = {};

  if (input.displayName !== undefined) {
    userUpdates.display_name = input.displayName.trim();
  }

  if (input.email !== undefined) {
    const email = input.email.trim().toLowerCase();
    if (email) {
      const exists = await authRepo.emailExists(email);
      if (exists) {
        throw conflict('Email sudah terdaftar');
      }
      userUpdates.email = email;
    } else {
      userUpdates.email = null;
    }
  }

  if (input.phoneE164 !== undefined) {
    const phone = input.phoneE164.trim();
    if (phone) {
      const exists = await authRepo.phoneExists(phone);
      if (exists) {
        throw conflict('Nomor telepon sudah terdaftar');
      }
      userUpdates.phone_e164 = phone;
    } else {
      userUpdates.phone_e164 = null;
    }
  }

  if (input.birthDate !== undefined) {
    customerUpdates.birth_date = input.birthDate;
  }

  if (input.marketingOptIn !== undefined) {
    customerUpdates.marketing_opt_in = input.marketingOptIn;
  }

  if (Object.keys(userUpdates).length > 0) {
    await userRepo.updateUser(userId, userUpdates);
  }

  if (Object.keys(customerUpdates).length > 0) {
    await authRepo.ensureCustomerProfile(userId);
    await authRepo.updateCustomerProfile(userId, customerUpdates);
  }

  return getMyProfile(userId);
}

export async function getPreferences(userId: string) {
  const prefs = await userRepo.findPreferences(userId);
  return { preferences: prefs };
}

export async function updatePreferences(userId: string, input: UpdatePreferencesInput) {
  const current = await userRepo.findPreferences(userId);
  const merge = input.merge !== false;
  const newPrefs = merge
    ? { ...(current ?? {}), ...(input.preferences ?? {}) }
    : (input.preferences ?? {});
  await userRepo.updatePreferences(userId, newPrefs);
  return { preferences: newPrefs };
}

export async function getTiers(userId: string) {
  const [tiers, profile] = await Promise.all([
    userRepo.findTiers(),
    userRepo.findProfile(userId),
  ]);

  const loyaltyPoints = await loyaltyRepo.getPointsSummary(userId).catch(() => null);

  return {
    tiers: tiers.map(shapeTier),
    currentTier: profile?.tier_code
      ? {
          code: profile.tier_code,
          name: profile.tier_name,
          tierId: profile.tier_id,
          lifetimePoints: loyaltyPoints?.balance ?? 0,
        }
      : null,
    loyalty: loyaltyPoints
      ? {
          balance: loyaltyPoints.balance,
          lifetimeEarned: loyaltyPoints.lifetimeEarned,
          lifetimeRedeemed: loyaltyPoints.lifetimeRedeemed,
          lifetimeExpired: loyaltyPoints.lifetimeExpired,
        }
      : null,
  };
}