/**
 * Status login pelanggan (web).
 *
 * Access token + user disimpan di localStorage supaya tetap login saat app
 * dibuka lagi; refresh token ditangani oleh `services/client.ts`.
 */
import { create } from 'zustand';

import * as authService from '@/services/auth.service';
import {
  ApiError,
  getAccessToken,
  setAccessToken,
  setSessionExpiredHandler,
} from '@/services/client';

import type { User } from '@/types/api';

const USER_KEY = 'semoet.user';

export type AuthStatus = 'loading' | 'authenticated' | 'guest';

interface AuthState {
  status: AuthStatus;
  user: User | null;
  /** Baca sesi tersimpan saat app start. */
  hydrate: () => Promise<void>;
  login: (identifier: string, password: string) => Promise<void>;
  register: (input: authService.RegisterInput) => Promise<void>;
  logout: (allDevices?: boolean) => Promise<void>;
  setUser: (user: User | null) => void;
}

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readStoredUser(): User | null {
  try {
    const raw = storage()?.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

function writeStoredUser(user: User | null): void {
  try {
    const store = storage();
    if (!store) return;
    if (user) store.setItem(USER_KEY, JSON.stringify(user));
    else store.removeItem(USER_KEY);
  } catch {
    // abaikan bila storage tidak tersedia
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'loading',
  user: null,

  hydrate: async () => {
    const [token, user] = await Promise.all([getAccessToken(), Promise.resolve(readStoredUser())]);
    if (token) {
      set({ status: 'authenticated', user });
      // Segarkan data user di latar belakang; bila token kedaluwarsa,
      // client akan refresh atau membuang sesi.
      authService
        .getAuthMe()
        .then((fresh) => {
          writeStoredUser(fresh);
          set({ status: 'authenticated', user: fresh });
        })
        .catch(async (err: unknown) => {
          // Hanya 401/403 yang berarti sesi benar-benar tidak berlaku.
          // Gangguan jaringan / error server sementara tidak boleh membuat
          // pengguna tiba-tiba ter-logout.
          if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
            await setAccessToken(null);
            writeStoredUser(null);
            set({ status: 'guest', user: null });
            return;
          }
          set({ status: 'authenticated', user });
        });
    } else {
      set({ status: 'guest', user: null });
    }
  },

  login: async (identifier, password) => {
    const session = await authService.login({ identifier, password });
    writeStoredUser(session.user);
    set({ status: 'authenticated', user: session.user });
  },

  register: async (input) => {
    const session = await authService.register(input);
    writeStoredUser(session.user);
    set({ status: 'authenticated', user: session.user });
  },

  logout: async (allDevices = false) => {
    try {
      await authService.logout(allDevices);
    } finally {
      // Selalu bersihkan sesi lokal, apa pun hasil panggilan server.
      writeStoredUser(null);
      set({ status: 'guest', user: null });
    }
  },

  setUser: (user) => {
    writeStoredUser(user);
    set({ user });
  },
}));

export const useIsAuthenticated = () => useAuthStore((state) => state.status === 'authenticated');

// Saat token tidak bisa dipulihkan, reset state login supaya seluruh layar ikut
// mengarahkan user ke halaman masuk (menghindari sesi "zombie").
setSessionExpiredHandler(() => {
  if (useAuthStore.getState().status === 'guest') return;
  writeStoredUser(null);
  useAuthStore.setState({ status: 'guest', user: null });
});
