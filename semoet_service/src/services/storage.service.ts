import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { badRequest, ServiceUnavailableError, unprocessable } from '../errors/AppError.js';

/**
 * Layanan object storage berbasis Supabase Storage (S3-compatible).
 *
 * Sengaja memakai REST API lewat `fetch` (bukan SDK) supaya tidak menambah
 * dependensi. Kredensial (service role key) hanya hidup di server — browser
 * tidak pernah memegangnya.
 */

/** Tipe gambar yang diizinkan, beserta ekstensi berkasnya. */
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

/** Ukuran maksimum berkas gambar (byte). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function isStorageConfigured(): boolean {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && env.STORAGE_BUCKET_NAME);
}

function assetBaseUrl(): string {
  if (env.STORAGE_PUBLIC_BASE_URL) return env.STORAGE_PUBLIC_BASE_URL.replace(/\/+$/, '');
  return `${env.SUPABASE_URL}/storage/v1/object/public/${env.STORAGE_BUCKET_NAME}`;
}

/** Buang prefix `data:<mime>;base64,` bila ada, ambil mime-nya. */
function parseBase64(input: string): { buffer: Buffer; mimeFromDataUrl: string | null } {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(input);
  if (match) {
    return { buffer: Buffer.from(match[2], 'base64'), mimeFromDataUrl: match[1] };
  }
  return { buffer: Buffer.from(input, 'base64'), mimeFromDataUrl: null };
}

function twoDigits(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

export interface UploadImageInput {
  /** Isi berkas: base64 murni atau data URL (`data:image/png;base64,...`). */
  data: string;
  /** MIME type; opsional bila `data` berupa data URL. */
  contentType?: string;
  /** Sub-folder tujuan di dalam bucket (mis. `products`). */
  folder?: string;
}

export interface UploadedImage {
  storageKey: string;
  publicUrl: string;
  contentType: string;
  sizeBytes: number;
}

/**
 * Unggah gambar ke bucket Supabase, kembalikan storage key + URL publiknya.
 * Melempar AppError yang ramah pengguna bila tidak valid atau gagal.
 */
export async function uploadImage(input: UploadImageInput): Promise<UploadedImage> {
  if (!isStorageConfigured()) {
    throw unprocessable(
      'Penyimpanan gambar belum dikonfigurasi. Hubungi administrator.',
    );
  }

  const { buffer, mimeFromDataUrl } = parseBase64(input.data.trim());
  if (buffer.length === 0) throw badRequest('Berkas gambar kosong');

  const contentType = (input.contentType ?? mimeFromDataUrl ?? '').toLowerCase().split(';')[0].trim();
  const ext = ALLOWED_TYPES[contentType];
  if (!ext) {
    throw badRequest('Tipe gambar tidak didukung. Gunakan JPG, PNG, WebP, GIF, atau AVIF.');
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw badRequest('Ukuran gambar maksimal 5 MB.');
  }

  const folder = (input.folder ?? 'products').replace(/[^a-z0-9/_-]/gi, '') || 'products';
  const now = new Date();
  const storageKey = `${folder}/${now.getUTCFullYear()}/${twoDigits(
    now.getUTCMonth() + 1,
  )}/${crypto.randomUUID()}.${ext}`;

  const endpoint = `${env.SUPABASE_URL}/storage/v1/object/${env.STORAGE_BUCKET_NAME}/${encodeURI(
    storageKey,
  )}`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: env.SUPABASE_SERVICE_ROLE_KEY ?? '',
        'Content-Type': contentType,
        'cache-control': 'public, max-age=31536000, immutable',
        'x-upsert': 'false',
      },
      body: new Uint8Array(buffer),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    logger.error({ err: error }, 'gagal menghubungi Supabase Storage');
    throw new ServiceUnavailableError('Penyimpanan gambar sedang tidak dapat dihubungi');
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    logger.error(
      { status: response.status, detail: detail.slice(0, 300) },
      'unggah gambar ke Supabase Storage gagal',
    );
    throw new ServiceUnavailableError('Gagal mengunggah gambar ke penyimpanan');
  }

  return {
    storageKey,
    publicUrl: `${assetBaseUrl()}/${storageKey}`,
    contentType,
    sizeBytes: buffer.length,
  };
}

/**
 * Hapus objek dari bucket. Bertujuan "best effort": kegagalan hanya dicatat,
 * tidak menggagalkan operasi utama (mis. saat mengganti gambar produk).
 */
export async function deleteImage(storageKey: string): Promise<void> {
  if (!isStorageConfigured() || !storageKey) return;
  try {
    const response = await fetch(
      `${env.SUPABASE_URL}/storage/v1/object/${env.STORAGE_BUCKET_NAME}/${encodeURI(storageKey)}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          apikey: env.SUPABASE_SERVICE_ROLE_KEY ?? '',
        },
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!response.ok) {
      logger.warn({ status: response.status, storageKey }, 'gagal menghapus objek storage');
    }
  } catch (error) {
    logger.warn({ err: error, storageKey }, 'gagal menghapus objek storage');
  }
}
