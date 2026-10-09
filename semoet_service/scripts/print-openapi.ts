/**
 * Cetak dokumen OpenAPI ke stdout atau file.
 *
 * Berguna untuk:
 * - commit `openapi.json` agar client (mobile / dashboard) bisa di-code-gen
 * - membandingkan spec sebelum dan sesudah perubahan endpoint
 * - mencari `$ref` yang menggantung
 *
 * Jalankan:
 *   npm run docs:print                      # ke stdout
 *   npm run docs:print > openapi.json       # simpan sebagai file
 *   npx tsx scripts/print-openapi.ts --check # validasi saja, tanpa output
 */

import { writeFile } from 'node:fs/promises';
import { countOperations, openApiDocument } from '../src/docs/openapi.js';

interface RefIssue {
  location: string;
  ref: string;
}

/** Kumpulkan seluruh nilai `$ref` di dalam dokumen. */
function collectRefs(node: unknown, location: string, output: RefIssue[]): void {
  if (Array.isArray(node)) {
    node.forEach((item, index) => collectRefs(item, `${location}/${index}`, output));
    return;
  }
  if (node === null || typeof node !== 'object') return;

  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === '$ref' && typeof value === 'string') {
      output.push({ location, ref: value });
      continue;
    }
    collectRefs(value, `${location}/${key}`, output);
  }
}

/** Cek apakah sebuah `#/components/<section>/<name>` benar-benar ada. */
function resolveRef(documentRef: unknown, ref: string): boolean {
  if (!ref.startsWith('#/')) return true;
  let current: unknown = documentRef;
  for (const segment of ref.slice(2).split('/')) {
    if (current === null || typeof current !== 'object') return false;
    current = (current as Record<string, unknown>)[segment];
  }
  return current !== undefined;
}

function validateRefs(): { issues: RefIssue[]; total: number } {
  const found: RefIssue[] = [];
  collectRefs(openApiDocument, '#', found);

  const issues = found.filter((item) => !resolveRef(openApiDocument, item.ref));
  return { issues, total: found.length };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check');

  const json = `${JSON.stringify(openApiDocument, null, 2)}\n`;
  const { issues, total } = validateRefs();
  const operations = countOperations();
  const pathCount = Object.keys(openApiDocument.paths).length;

  // Ringkasan selalu dicetak ke stderr supaya tidak mengotori output JSON.
  console.error(
    `[openapi] ${operations} operasi pada ${pathCount} path, ${total} referensi diperiksa`,
  );

  if (issues.length > 0) {
    console.error(`[openapi] DITEMUKAN ${issues.length} $ref yang menggantung:`);
    for (const issue of issues.slice(0, 50)) {
      console.error(`  - ${issue.ref}  (di ${issue.location})`);
    }
    if (issues.length > 50) console.error(`  ... dan ${issues.length - 50} lainnya`);
    process.exitCode = 1;
    return;
  }

  if (checkOnly) {
    console.error('[openapi] semua $ref valid');
    return;
  }

  const target = args.find((arg) => !arg.startsWith('--'));
  if (target) {
    await writeFile(target, json, 'utf8');
    console.error(`[openapi] spec ditulis ke ${target}`);
    return;
  }

  process.stdout.write(json);
}

main().catch((error: unknown) => {
  console.error('[openapi] gagal membuat spec:', error);
  process.exitCode = 1;
});
