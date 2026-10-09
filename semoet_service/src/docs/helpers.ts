/**
 * Helper ringkas untuk menulis OpenAPI path item.
 *
 * Tujuannya supaya file `src/docs/paths/*.ts` tetap terbaca seperti daftar
 * endpoint: tidak ada ulangan panjang untuk security, parameter, dan wrapper
 * response yang sama.
 */

import type {
  HeaderObject,
  OperationObject,
  ParameterLike,
  ParameterObject,
  PathItemObject,
  RequestBodyObject,
  ResponseLike,
  SchemaLike,
} from './types.js';

/** Skema paling sering dipakai: uuid path param. */
export const uuid = { type: 'string', format: 'uuid' } as const;
const uuidSchema = uuid;
const paginationParams: ParameterObject[] = [
  {
    name: 'page',
    in: 'query',
    description: 'Nomor halaman, mulai dari 1.',
    schema: { type: 'integer', minimum: 1, default: 1 },
  },
  {
    name: 'limit',
    in: 'query',
    description: 'Jumlah data per halaman (maksimum 100).',
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  },
];

/** Security default: seluruh endpoint wajib Bearer token kecuali yang dikosongkan. */
const AUTHENTICATED = [{ bearerAuth: [] }];

export interface OperationInput {
  /** Nama endpoint harus unik dan stable (dipakai client generator). */
  operationId: string;
  summary: string;
  description?: string;
  tags: string[];
  /** `false` menandai endpoint publik (tanpa Authorization). */
  auth?: boolean;
  params?: ParameterLike[];
  /** Skema body/request. `undefined` berarti tanpa request body. */
  body?: SchemaLike;
  /** Deskripsi singkat untuk isi request body (mis. idempotency). */
  bodyDescription?: string;
  responses: Record<string, ResponseLike>;
  deprecated?: boolean;
}

/** Bangun satu operation object lengkap dengan security + parameter. */
export function operation(input: OperationInput): OperationObject {
  const parameters = [...(input.params ?? [])];

  // Idempotency-Key otomatis untuk endpoint tulis yang butuh idempotensi.
  if (input.body && POST_LIKE.has(input.operationId)) {
    parameters.push(idempotencyKeyHeader());
  }

  const operationObject: OperationObject = {
    tags: input.tags,
    summary: input.summary,
    operationId: input.operationId,
    security: input.auth === false ? [] : AUTHENTICATED,
    responses: input.responses,
  };

  if (input.description) operationObject.description = input.description;
  if (parameters.length > 0) operationObject.parameters = parameters;
  if (input.body) {
    const requestBody: RequestBodyObject = {
      required: true,
      content: { 'application/json': { schema: input.body } },
    };
    if (input.bodyDescription) requestBody.description = input.bodyDescription;
    operationObject.requestBody = requestBody;
  }
  if (input.deprecated) operationObject.deprecated = true;

  return operationObject;
}

// Endpoint yang secara semantik POST dan umumnya perlu Idempotency-Key.
const POST_LIKE = new Set<string>();

/** Tandai operationId sebagai endpoint yang tanpa-syarat butuh Idempotency-Key. */
export function withIdempotency(operationId: string): void {
  POST_LIKE.add(operationId);
}

export function idempotencyKeyHeader(): ParameterObject {
  return {
    name: 'Idempotency-Key',
    in: 'header',
    description:
      'Kunci unik per percobaan (8-128 karakter: A-Z a-z 0-9 . _ : -). ' +
      'Kirim ulang dengan kunci yang sama tidak akan membuat data ganda.',
    required: false,
    schema: { type: 'string', minLength: 8, maxLength: 128, pattern: '^[A-Za-z0-9._:-]+$' },
  };
}

// --------------------------------------------------------------------------
// Parameter
// --------------------------------------------------------------------------
export function uuidPathParam(name = 'id', description = 'ID sumber daya (UUID).'): ParameterObject {
  return { name, in: 'path', required: true, description, schema: uuidSchema };
}

export function slugPathParam(
  name = 'slug',
  description = 'Slug unik sumber daya.',
): ParameterObject {
  return { name, in: 'path', required: true, description, schema: { type: 'string', minLength: 1 } };
}

export function tokenPathParam(
  name = 'token',
  description = 'Token opaque dari QR code meja.',
): ParameterObject {
  return { name, in: 'path', required: true, description, schema: { type: 'string', minLength: 8 } };
}

export function queryParam(
  name: string,
  schema: SchemaLike,
  description?: string,
  required = false,
): ParameterObject {
  const param: ParameterObject = { name, in: 'query', required, schema };
  if (description) param.description = description;
  return param;
}

export function enumQueryParam(
  name: string,
  values: readonly string[],
  description?: string,
): ParameterObject {
  return queryParam(name, { type: 'string', enum: [...values] }, description);
}

export function booleanQueryParam(
  name: string,
  description?: string,
  defaultValue?: boolean,
): ParameterObject {
  return queryParam(
    name,
    { type: 'boolean', ...(defaultValue === undefined ? {} : { default: defaultValue }) },
    description,
  );
}

export function dateQueryParam(
  name: string,
  description?: string,
  required = false,
): ParameterObject {
  return queryParam(name, { type: 'string', format: 'date' }, description, required);
}

export function dateTimeQueryParam(name: string, description?: string): ParameterObject {
  return queryParam(name, { type: 'string', format: 'date-time' }, description);
}

export function searchQueryParam(): ParameterObject {
  return queryParam('search', { type: 'string' }, 'Kata kunci pencarian (nama / kode / slug).');
}

export function paginationParameters(): ParameterObject[] {
  return [...paginationParams];
}

export function headerParam(
  name: string,
  schema: SchemaLike,
  description?: string,
  required = false,
): ParameterObject {
  const param: ParameterObject = { name, in: 'header', required, schema };
  if (description) param.description = description;
  return param;
}

// --------------------------------------------------------------------------
// Response
// --------------------------------------------------------------------------
/** `{ success: true, data, meta, requestId }` */
export function successResponse(
  dataSchema: SchemaLike,
  description = 'Berhasil diproses.',
  { paginated = false, metaSchema }: { paginated?: boolean; metaSchema?: SchemaLike } = {},
): ResponseLike {
  const content: Record<string, { schema: SchemaLike }> = {
    'application/json': { schema: envelopeSchema(dataSchema, paginated, metaSchema) },
  };
  return { description, content };
}

export function envelopeSchema(
  dataSchema: SchemaLike,
  paginated = false,
  metaSchema?: SchemaLike,
): SchemaLike {
  return {
    type: 'object',
    required: ['success', 'data'],
    properties: {
      success: { type: 'boolean', enum: [true] },
      data: paginated ? { type: 'array', items: dataSchema } : dataSchema,
      ...(paginated
        ? { meta: metaSchema ?? ref('PaginationMeta') }
        : {}),
      requestId: { type: 'string', description: 'Correlation id request ini.' },
    },
  };
}

/** List endpoint: data berupa array + meta pagination. */
export function paginatedResponse(
  itemSchema: SchemaLike,
  description = 'Daftar data berhasil dimuat.',
): ResponseLike {
  return successResponse(itemSchema, description, { paginated: true });
}

/** `{ success: false, error: { code, message, details? }, requestId }` */
export function errorResponse(description: string): ResponseLike {
  return {
    description,
    content: {
      'application/json': { schema: ref('ErrorResponse') },
    },
  };
}

/** Gabungan beberapa status error umum supaya path tidak perlu mengulang. */
export const commonErrors = {
  validation: errorResponse('Validasi gagal. Perhatikan `error.details` untuk tahu field bermasalah.'),
  unauthorized: errorResponse('Token tidak ada, tidak valid, atau sudah kedaluwarsa.'),
  forbidden: errorResponse('Akun tidak berhak mengakses sumber daya ini.'),
  notFound: errorResponse('Data tidak ditemukan.'),
  conflict: errorResponse('Konflik data, misalnya kode atau nomor sudah dipakai.'),
  unprocessable: errorResponse('Valid, tetapi melanggar aturan bisnis.'),
  rateLimited: errorResponse('Terlalu banyak permintaan. Coba lagi beberapa saat lagi.'),
} satisfies Record<string, ResponseLike>;

// --------------------------------------------------------------------------
// Reference & schema builder
// --------------------------------------------------------------------------
export function ref(component: string, section = 'schemas'): { $ref: string } {
  return { $ref: `#/components/${section}/${component}` };
}

export function headerObject(description: string, schema: SchemaLike): HeaderObject {
  return { description, schema };
}

export function responseRef(component: string): ResponseLike {
  return ref(component, 'responses');
}

export function paramRef(component: string): ParameterLike {
  return ref(component, 'parameters');
}

/** Path item dari object method -> operation. */
export type PathSpec = PathItemObject;