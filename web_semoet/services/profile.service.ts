/** Endpoint /api/v1/me (profile) & /me/preferences. */
import { api } from './client';

import type { CustomerTier, MePayload } from '@/types/api';

export function getProfile(): Promise<MePayload> {
  return api<MePayload>('/me', { auth: true });
}

export function getPreferences(): Promise<Record<string, unknown>> {
  return api<Record<string, unknown>>('/me/preferences', { auth: true });
}

export function getTiers(): Promise<CustomerTier[]> {
  return api<CustomerTier[]>('/me/tiers', { auth: true });
}
