/**
 * Tipe OpenAPI 3.1 subset yang dipakai proyek ini.
 *
 * Sengaja ditulis sendiri (bukan dependensi eksternal) supaya spec tetap
 * ketat-terkompilasi: kalau ada salah ketik di path item atau response,
 * TypeScript langsung gagal saat build.
 */

export type JsonObject = Record<string, unknown>;

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface InfoObject {
  title: string;
  version: string;
  description?: string;
  summary?: string;
  termsOfService?: string;
  contact?: { name?: string; url?: string; email?: string };
  license?: { name: string; url?: string };
}

export interface ServerObject {
  url: string;
  description?: string;
  variables?: Record<string, { default: string; enum?: string[]; description?: string }>;
}

export interface TagObject {
  name: string;
  description?: string;
}

export interface ContactObject {
  name?: string;
  url?: string;
  email?: string;
}

/** Reference: `{ $ref: '#/components/schemas/User' }` */
export interface ReferenceObject {
  $ref: string;
}

export type SchemaLike = ReferenceObject | JsonObject;

export interface ParameterObject {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  description?: string;
  required?: boolean;
  deprecated?: boolean;
  allowEmptyValue?: boolean;
  schema: SchemaLike;
  example?: unknown;
  examples?: Record<string, { summary?: string; value: unknown }>;
}

export type ParameterLike = ParameterObject | ReferenceObject;

export interface MediaTypeObject {
  schema: SchemaLike;
  example?: unknown;
  examples?: Record<string, { summary?: string; value: unknown }>;
}

export interface RequestBodyObject {
  description?: string;
  required?: boolean;
  content: Record<string, MediaTypeObject>;
}

export interface HeaderObject {
  description?: string;
  required?: boolean;
  schema: SchemaLike;
}

export interface ResponseObject {
  description: string;
  headers?: Record<string, HeaderObject | ReferenceObject>;
  content?: Record<string, MediaTypeObject>;
}

export type ResponseLike = ResponseObject | ReferenceObject;

export interface OperationObject {
  tags: string[];
  summary: string;
  description?: string;
  operationId: string;
  /** `[]` = tanpa autentikasi, `[{ bearerAuth: [] }]` = wajib login. */
  security?: Array<Record<string, string[]>> | null;
  parameters?: ParameterLike[];
  requestBody?: RequestBodyObject | ReferenceObject;
  responses: Record<string, ResponseLike>;
  deprecated?: boolean;
  externalDocs?: { description: string; url: string };
}

export type PathItemObject = Partial<Record<HttpMethod, OperationObject>>;

export interface ComponentsObject {
  schemas: Record<string, SchemaLike>;
  parameters: Record<string, ParameterLike>;
  responses: Record<string, ResponseLike>;
  headers: Record<string, HeaderObject | ReferenceObject>;
  requestBodies: Record<string, RequestBodyObject | ReferenceObject>;
  securitySchemes: Record<string, JsonObject>;
  examples?: Record<string, JsonObject>;
}

export interface OpenApiDocument {
  openapi: string;
  info: InfoObject;
  servers: ServerObject[];
  tags: TagObject[];
  paths: Record<string, PathItemObject>;
  components: ComponentsObject;
  security: Array<Record<string, string[]>>;
  externalDocs?: { description: string; url: string };
}