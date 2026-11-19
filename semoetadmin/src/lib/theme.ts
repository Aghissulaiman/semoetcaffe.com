/**
 * Penyimpanan tema kecil berbasis external store.
 *
 * Dipakai bersama `useSyncExternalStore` supaya tidak perlu memanggil
 * setState di dalam effect (menghindari cascading render).
 */
export type ThemeMode = "light" | "dark" | "auto";
export type ResolvedTheme = "light" | "dark";

const MODE_KEY = "theme-mode";
const LEGACY_KEY = "theme";

const listeners = new Set<() => void>();
let mode: ThemeMode = "light";
let initialized = false;

function readStoredMode(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const saved = (localStorage.getItem(MODE_KEY) ??
    localStorage.getItem(LEGACY_KEY)) as ThemeMode | null;
  return saved === "dark" || saved === "auto" || saved === "light" ? saved : "light";
}

function ensureInit() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  mode = readStoredMode();
}

function mediaQuery(): MediaQueryList | null {
  if (typeof window === "undefined") return null;
  return window.matchMedia("(prefers-color-scheme: dark)");
}

export function getMode(): ThemeMode {
  ensureInit();
  return mode;
}

export function getServerMode(): ThemeMode {
  return "light";
}

export function subscribeMode(listener: () => void): () => void {
  ensureInit();
  listeners.add(listener);
  const mq = mediaQuery();
  const onMediaChange = () => {
    if (getMode() === "auto") listener();
  };
  mq?.addEventListener("change", onMediaChange);
  return () => {
    listeners.delete(listener);
    mq?.removeEventListener("change", onMediaChange);
  };
}

export function setMode(next: ThemeMode) {
  mode = next;
  initialized = true;
  if (typeof window !== "undefined") {
    localStorage.setItem(MODE_KEY, next);
  }
  listeners.forEach((listener) => listener());
}

export function subscribePrefersDark(listener: () => void): () => void {
  const mq = mediaQuery();
  if (!mq) return () => {};
  mq.addEventListener("change", listener);
  return () => mq.removeEventListener("change", listener);
}

export function getPrefersDark(): boolean {
  return mediaQuery()?.matches ?? false;
}

export function getServerPrefersDark(): boolean {
  return false;
}

export function resolveTheme(m: ThemeMode, prefersDark: boolean): ResolvedTheme {
  if (m === "auto") return prefersDark ? "dark" : "light";
  return m;
}

/** Terapkan kelas `dark` ke `<html>`. Murni efek samping (tanpa setState). */
export function applyTheme(m: ThemeMode, prefersDark: boolean): void {
  if (typeof document === "undefined") return;
  const resolved = resolveTheme(m, prefersDark);
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.setAttribute("data-color-scheme", resolved);
  try {
    localStorage.setItem(LEGACY_KEY, resolved);
  } catch {
    // abaikan
  }
}

/** Skrip anti-kedip: dijalankan sebelum paint untuk memasang tema awal. */
export const THEME_INIT_SCRIPT = `(function(){try{var m=localStorage.getItem('theme-mode')||localStorage.getItem('theme')||'light';var d=m==='dark'||(m==='auto'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.setAttribute('data-color-scheme',d?'dark':'light');}catch(e){}})();`;
