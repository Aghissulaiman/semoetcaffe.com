/**
 * Cetak seluruh route yang benar-benar terdaftar di Express.
 *
 * Berguna untuk membandingkan implementasi dengan spec OpenAPI
 * (`npm run docs:print`) tanpa harus menyalakan server dan menyentuh database.
 *
 *   npm run routes:list
 *   npm run routes:list -- --grep payments
 *
 * Catatan: Express 5 tidak menyimpan path mount di layer router (hanya di dalam
 * closure `matcher`), jadi script ini merekam prefix saat `use(path, router)`
 * dipanggil, lalu menelusuri router tree saat aplikasi sudah selesai dirakit.
 */

import express from 'express';

type Handler = (req: unknown, res: unknown, next: unknown) => unknown;
interface RouterLike {
  (req: unknown, res: unknown, next: unknown): void;
  stack?: LayerLike[];
}
interface LayerLike {
  name?: string;
  route?: { path: string; methods: Record<string, boolean> };
  handle?: Handler;
}

// --- 1. Rekam prefix mount sebelum app di-import -------------------------
const mountPrefix = new WeakMap<object, string>();

function recordMount(target: unknown, path: string): void {
  if (typeof target === 'function') {
    const current = mountPrefix.get(target);
    // Prefix pertama yang tercatat adalah yang paling luar.
    if (current === undefined || current.length === 0) mountPrefix.set(target, path);
  }
}

function patchUse(holder: { use: unknown }): void {
  const original = holder.use;
  if (typeof original !== 'function' || (original as { __patched?: boolean }).__patched) return;

  const patched = function use(this: unknown, ...args: unknown[]): unknown {
    if (typeof args[0] === 'string' && typeof args[1] === 'function') {
      recordMount(args[1], args[0]);
    }
    return (original as (...a: unknown[]) => unknown).apply(this, args);
  };
  (patched as { __patched?: boolean }).__patched = true;
  holder.use = patched;
}

patchUse(express.application as unknown as { use: unknown });
patchUse(express.Router.prototype as unknown as { use: unknown });

// Import dinamis supaya patch di atas berlaku saat `express()` dipanggil.
const { app } = (await import('../src/app.js')) as unknown as { app: express.Express };

// --- 2. Telusuri router tree ----------------------------------------------
interface FlatRoute {
  methods: string;
  path: string;
}

function isRouter(value: unknown): value is RouterLike {
  return typeof value === 'function' && Array.isArray((value as RouterLike).stack);
}

function joinPath(prefix: string, path: string): string {
  const combined = `${prefix}/${path}`;
  const normalized = combined.replace(/\/{2,}/g, '/');
  return normalized.length > 1 && normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
}

function flatten(router: RouterLike, prefix = ''): FlatRoute[] {
  const out: FlatRoute[] = [];

  for (const layer of router.stack ?? []) {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods ?? {})
        .map((method) => method.toUpperCase())
        .sort()
        .join(',');
      out.push({ methods, path: joinPath(prefix, layer.route.path) });
      continue;
    }

    if (isRouter(layer.handle)) {
      out.push(...flatten(layer.handle, joinPath(prefix, mountPrefix.get(layer.handle) ?? '')));
    }
  }

  return out;
}

const root = (app as unknown as { router: RouterLike }).router;
const routes = flatten(root).sort(
  (a, b) => a.path.localeCompare(b.path) || a.methods.localeCompare(b.methods),
);

const grepIndex = process.argv.indexOf('--grep');
const grep = grepIndex >= 0 ? process.argv[grepIndex + 1] : undefined;
const filtered = grep
  ? routes.filter(
      (route) =>
        route.path.toLowerCase().includes(grep.toLowerCase()) ||
        route.methods.toLowerCase().includes(grep.toLowerCase()),
    )
  : routes;

const width = Math.max(0, ...filtered.map((route) => route.methods.length));
for (const route of filtered) {
  // eslint-disable-next-line no-console
  console.log(`${route.methods.padEnd(width)}  ${route.path}`);
}

// eslint-disable-next-line no-console
console.log(`\nTOTAL ${filtered.length} route(s)`);

process.exit(0);