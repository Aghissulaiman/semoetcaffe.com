/** Endpoint /api/v1/auth — login, register, logout, sesi. */
import { api, setAccessToken, clearSession } from './client';

import type { AuthSession, User } from '@/types/api';

export interface LoginInput {
  identifier: string;
  password: string;
  deviceLabel?: string;
}

export interface RegisterInput {
  email?: string;
  phoneE164?: string;
  password: string;
  displayName: string;
  marketingOptIn?: boolean;
  deviceLabel?: string;
}

async function persistSession(session: AuthSession): Promise<AuthSession> {
  if (session.accessToken) {
    await setAccessToken(session.accessToken, session.expiresIn);
  }
  return session;
}

export function login(input: LoginInput): Promise<AuthSession> {
  return api<AuthSession>('/auth/login', { method: 'POST', auth: false, body: input }).then(persistSession);
}

export function register(input: RegisterInput): Promise<AuthSession> {
  return api<AuthSession>('/auth/register', { method: 'POST', auth: false, body: input }).then(persistSession);
}

/**
 * Keluar dari sesi. Bersifat best-effort: kalau token sudah kedaluwarsa /
 * dicabut, permintaan ke server boleh gagal — yang penting sesi lokal tetap
 * dibersihkan dan pemanggil tidak menerima error.
 */
export async function logout(allDevices = false): Promise<void> {
  try {
    await api('/auth/logout', { method: 'POST', body: { allDevices } });
  } catch {
    // Abaikan: cabut token lokal di bawah.
  } finally {
    await clearSession();
  }
}

/** GET /auth/me membalikkan bungkusan `{ user }`, bukan objek user langsung. */
export function getAuthMe(): Promise<User> {
  return api<{ user: User }>('/auth/me').then((data) => data.user);
}
