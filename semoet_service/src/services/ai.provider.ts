import type { AiMessageRole, AiPurpose } from '../config/constants.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { ServiceUnavailableError, UnauthorizedError } from '../errors/AppError.js';

/**
 * Adapter provider AI.
 *
 * Tujuannya: service ai tidak pernah bicara langsung ke API model, hanya ke
 * interface di bawah ini. Mengganti OpenAI dengan gateway lain (OpenRouter,
 * Together, vLLM sendiri, dsb) cukup dengan menulis adapter baru lalu
 * mengembalikannya dari getAiProvider().
 */

/** Satu giliran percakapan yang dikirim ke model. */
export interface AiChatTurn {
  role: 'system' | AiMessageRole;
  content: string;
}

export interface AiCompletionRequest {
  /** Menentukan nada & aturan jawaban (lihat AI_PURPOSE di constants.ts). */
  purpose: AiPurpose;
  /** Instruksi sistem, termasuk blok konteks data hasil boundary service. */
  systemPrompt: string;
  /** Riwayat percakapan yang sudah dipotong oleh service. */
  messages: AiChatTurn[];
  maxTokens?: number;
  temperature?: number;
}

export interface AiCompletionUsage {
  promptTokens: number | null;
  completionTokens: number | null;
}

export interface AiCompletionResult {
  text: string;
  model: string;
  usage?: AiCompletionUsage;
  /** true bila jawaban berasal dari fallback lokal, bukan dari model. */
  isFallback: boolean;
}

export interface AiProvider {
  /** Nama provider untuk log & respons API; tidak pernah memuat api key. */
  readonly name: string;
  complete(request: AiCompletionRequest): Promise<AiCompletionResult>;
}

/**
 * Penanda blok konteks data di dalam system prompt. Dipakai bersama oleh
 * service (penulis blok) dan fallback provider (pembaca blok) supaya keduanya
 * selalu sepakat soal batas antara instruksi dan data.
 */
export const CONTEXT_SECTION_MARKER = '## Konteks data (cuplikan, baca saja)';

/** Pengaman lapis kedua: prompt dibersihkan di service juga, angka ini cadangan. */
const MAX_PROMPT_CHARS = 12_000;

/** Batas default pemanggilan model sebelum dibatalkan. */
const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * Basis URL default endpoint Gemini (OpenAI-compatible). Diambil dari env
 * tervalidasi (AI_BASE_URL) sehingga endpoint bisa diganti tanpa menyentuh
 * kode ini.
 */
function resolveBaseUrl(): string {
  const configured = env.AI_BASE_URL?.trim();
  const base =
    configured && configured.length > 0
      ? configured
      : 'https://generativelanguage.googleapis.com/v1beta/openai/';
  return base.replace(/\/+$/, '');
}

function resolveTimeoutMs(): number {
  const parsed = Number(env.AI_REQUEST_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function resolveApiKey(): string | null {
  const key = env.AI_API_KEY?.trim();
  return key && key.length > 0 ? key : null;
}

function clampHistory(messages: AiChatTurn[]): AiChatTurn[] {
  const budgeted: AiChatTurn[] = [];
  let used = 0;
  for (const message of messages) {
    if (message.role === 'user' || message.role === 'assistant') {
      used += message.content.length;
    }
    budgeted.push(message);
  }
  while (budgeted.length > 1 && used > MAX_PROMPT_CHARS) {
    const removed = budgeted.shift();
    if (removed) used -= removed.content.length;
  }
  return budgeted;
}

function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 3))}...`;
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toUsage(value: unknown): AiCompletionUsage {
  const usage = (value ?? {}) as Record<string, unknown>;
  const prompt = Number(usage.prompt_tokens ?? usage.promptTokens);
  const completion = Number(usage.completion_tokens ?? usage.completionTokens);
  return {
    promptTokens: Number.isFinite(prompt) ? prompt : null,
    completionTokens: Number.isFinite(completion) ? completion : null,
  };
}

/**
 * Provider OpenAI-compatible. Memakai fetch bawaan Node 20 supaya tidak ada
 * dependensi SDK tambahan. Format request/response mengikuti API chat
 * completions supaya gateway lain bisa ditukar tanpa mengubah kode.
 */
export const openAiCompatibleProvider: AiProvider = {
  name: 'openai-compatible',

  async complete(request: AiCompletionRequest): Promise<AiCompletionResult> {
    const apiKey = resolveApiKey();
    if (!apiKey) {
      throw new ServiceUnavailableError(
        'Kredensial provider AI belum dikonfigurasi (AI_API_KEY kosong)',
      );
    }

    const model = env.AI_MODEL;
    const url = `${resolveBaseUrl()}/chat/completions`;
    const payload = {
      model,
      messages: [
        { role: 'system', content: truncateText(request.systemPrompt, MAX_PROMPT_CHARS) },
        ...clampHistory(request.messages).map((message) => ({
          role: message.role,
          content: truncateText(message.content, 4_000),
        })),
      ],
      temperature: request.temperature ?? 0.3,
      max_tokens: request.maxTokens ?? 700,
      stream: false,
    };

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          // Header ini hanya dibaca di dalam fetch; nilai key tidak pernah
          // ditulis ke log atau respons API.
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(resolveTimeoutMs()),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'error tidak diketahui';
      logger.error(
        { provider: env.AI_PROVIDER, model, purpose: request.purpose, reason },
        '[ai] gagal memanggil provider AI',
      );
      throw new ServiceUnavailableError(
        'Layanan AI sedang tidak dapat dihubungi. Silakan coba lagi sebentar lagi.',
      );
    }

    if (!response.ok) {
      const detail = await readProviderError(response);
      logger.error(
        {
          provider: env.AI_PROVIDER,
          model,
          purpose: request.purpose,
          status: response.status,
          reason: detail,
        },
        '[ai] provider AI mengembalikan status error',
      );

      if (response.status === 401 || response.status === 403) {
        throw new UnauthorizedError(
          'Kredensial provider AI ditolak. Periksa konfigurasi AI_API_KEY pada layanan.',
        );
      }
      throw new ServiceUnavailableError(
        response.status === 429
          ? 'Kuota provider AI sedang habis. Silakan coba lagi nanti.'
          : 'Layanan AI sedang tidak stabil. Silakan coba lagi sebentar lagi.',
      );
    }

    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    const choices = Array.isArray(body?.choices) ? (body?.choices as unknown[]) : [];
    const firstChoice = (choices[0] ?? null) as Record<string, unknown> | null;
    const message = (firstChoice?.message ?? null) as Record<string, unknown> | null;
    const text = readText(message?.content);

    if (!text) {
      logger.error(
        { provider: env.AI_PROVIDER, model, purpose: request.purpose },
        '[ai] provider AI tidak mengembalikan isi jawaban',
      );
      throw new ServiceUnavailableError(
        'Layanan AI tidak mengembalikan jawaban yang bisa dibaca. Silakan coba lagi.',
      );
    }

    return {
      text,
      model: readText(body?.model) || model,
      usage: toUsage(body?.usage),
      isFallback: false,
    };
  },
};

async function readProviderError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as Record<string, unknown> | null;
    const error = (body?.error ?? null) as Record<string, unknown> | null;
    const message = readText(error?.message) || readText(error?.type);
    if (message) return message.slice(0, 200);
  } catch {
    // Body bukan JSON; pakai status saja.
  }
  return `status ${response.status}`;
}

// --------------------------------------------------------------------------
// Fallback deterministik
// --------------------------------------------------------------------------

/**
 * Topik jawaban beserta kata kunci pemicunya pada pesan pengguna.
 *
 * Urutan penting: topik paling spesifik dicek lebih dulu. Bila kata kunci
 * cocok tetapi tidak ada bagian konteks dengan judul yang sesuai (misalnya
 * "best seller" pada percakapan pelanggan, yang tidak punya bagian
 * "Produk terlaris"), pencarian lanjut ke topik berikutnya.
 */
const FALLBACK_TOPICS: Array<{ keywords: string[]; sectionPrefixes: string[] }> = [
  {
    keywords: ['terlaris', 'terlaru', 'paling laku', 'best seller', 'bestseller', 'laris', 'laku'],
    sectionPrefixes: ['Produk terlaris'],
  },
  {
    keywords: ['stok', 'bahan', 'inventory', 'restock', 'gudang', 'reorder'],
    sectionPrefixes: ['Stok'],
  },
  {
    keywords: ['penjualan', 'omzet', 'revenue', 'transaksi', 'sales', 'pendapatan', 'cabut'],
    sectionPrefixes: ['Penjualan', 'Ringkasan penjualan'],
  },
  {
    keywords: ['promo', 'diskon', 'voucher', 'kupon', 'cashback'],
    sectionPrefixes: ['Promo', 'Voucher'],
  },
  {
    keywords: ['cabang', 'gerai', 'outlet', 'alamat', 'lokasi', 'jam', 'buka', 'tutup', 'branch'],
    sectionPrefixes: ['Cabang', 'Jam'],
  },
  {
    keywords: ['pesanan', 'order', 'status', 'tracking', 'pengiriman', 'pembayaran', 'kurir'],
    sectionPrefixes: ['Pesanan'],
  },
  {
    keywords: ['menu', 'produk', 'harga', 'varian', 'rekomendasi', 'kopi', 'makanan', 'minuman'],
    sectionPrefixes: ['Menu', 'Rekomendasi', 'Katalog'],
  },
];

function splitContext(systemPrompt: string): { instruction: string; context: string } {
  const markerIndex = systemPrompt.indexOf(CONTEXT_SECTION_MARKER);
  if (markerIndex < 0) {
    return { instruction: systemPrompt.trim(), context: '' };
  }
  return {
    instruction: systemPrompt.slice(0, markerIndex).trim(),
    context: systemPrompt.slice(markerIndex + CONTEXT_SECTION_MARKER.length).trim(),
  };
}

/** Pecah blok konteks menjadi bagian per judul "## Judul". */
function splitSections(context: string): Array<{ title: string; body: string }> {
  const sections: Array<{ title: string; body: string }> = [];
  let currentTitle: string | null = null;
  let currentLines: string[] = [];

  const flush = (): void => {
    if (currentTitle === null) return;
    const body = currentLines.join('\n').trim();
    sections.push({ title: currentTitle, body });
  };

  for (const line of context.split('\n')) {
    if (line.startsWith('## ')) {
      flush();
      currentTitle = line.slice(3).trim();
      currentLines = [];
      continue;
    }
    if (currentTitle !== null) currentLines.push(line);
  }
  flush();
  return sections.filter((section) => section.body.length > 0);
}

function pickSections(
  sections: Array<{ title: string; body: string }>,
  question: string,
): Array<{ title: string; body: string }> {
  if (sections.length === 0) return [];
  const normalized = question.toLowerCase();

  for (const topic of FALLBACK_TOPICS) {
    const matches = topic.keywords.some((keyword) => normalized.includes(keyword));
    if (!matches) continue;
    const picked = sections.filter((section) =>
      topic.sectionPrefixes.some((prefix) => section.title.toLowerCase().includes(prefix.toLowerCase())),
    );
    if (picked.length > 0) return picked;
  }

  // Pertanyaan tidak dikenali: kirim maksimal dua bagian paling awal supaya
  // jawaban tetap ringkas namun informatif.
  return sections.slice(0, 2);
}

/**
 * Provider cadangan. Tidak memanggil model apa pun: jawaban disusun dari
 * konteks yang dikirim service sehingga seluruh alur tetap bisa diuji tanpa
 * kredensial. Semua jawaban diberi label agar terlihat jelas di log dan di
 * aplikasi bahwa ini bukan keluaran model.
 */
export const fallbackAiProvider: AiProvider = {
  name: 'fallback-lokal',

  async complete(request: AiCompletionRequest): Promise<AiCompletionResult> {
    const { context } = splitContext(request.systemPrompt);
    const lastUserMessage =
      [...request.messages].reverse().find((message) => message.role === 'user')?.content ?? '';
    const sections = pickSections(splitSections(context), lastUserMessage);

    const lines: string[] = [
      '[Jawaban cadangan otomatis] Kredensial AI belum dikonfigurasi sehingga tidak ada model yang dipanggil. Jalur ini hanya untuk pengembangan dan pengujian.',
      '',
    ];

    if (lastUserMessage) {
      lines.push(`Pertanyaan Anda: ${truncateText(lastUserMessage.trim(), 300)}`, '');
    }

    if (sections.length === 0) {
      lines.push(
        request.purpose === 'admin_assistant'
          ? 'Belum ada ringkasan bisnis yang bisa ditampilkan. Coba lagi setelah data penjualan tersedia.'
          : 'Belum ada data katalog, cabang, promo, atau pesanan yang bisa ditampilkan. Silakan coba lagi nanti.',
      );
    } else {
      for (const section of sections) {
        lines.push(`## ${section.title}`, section.body, '');
      }
      lines.push('Ringkasan di atas diambil langsung dari data sistem, tanpa menebak.');
    }

    lines.push(
      request.purpose === 'admin_assistant'
        ? 'Isi AI_API_KEY pada konfigurasi layanan agar jawaban bisnis tersedia lengkap dari model.'
        : 'Isi AI_API_KEY pada konfigurasi layanan agar jawaban dibantu model secara lengkap.',
    );

    return {
      text: lines.join('\n').trim(),
      model: `fallback-${env.AI_MODEL}`,
      usage: {
        promptTokens: request.systemPrompt.length,
        completionTokens: 0,
      },
      isFallback: true,
    };
  },
};

let warned = false;

/**
 * Mengembalikan adapter AI yang aktif.
 * Dengan AI_API_KEY terisi memakai provider OpenAI-compatible; tanpa kredensial
 * memakai fallback lokal supaya alur tetap dapat diuji. Peringatan dicatat satu
 * kali per proses supaya log tidak membanjir.
 */
export function getAiProvider(): AiProvider {
  const apiKey = resolveApiKey();
  if (!apiKey) {
    if (!warned) {
      warned = true;
      logger.warn(
        { provider: env.AI_PROVIDER, model: env.AI_MODEL },
        '[ai] AI_API_KEY belum diisi, memakai provider cadangan lokal',
      );
    }
    return fallbackAiProvider;
  }
  return openAiCompatibleProvider;
}
