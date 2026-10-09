/**
 * Error domain terpusat. Semua error yang dilempar di service/validator harus
 * berupa AppError (operational) supaya bisa dipetakan ke HTTP status yang benar
 * tanpa membocorkan detail internal ke client.
 */

export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  UNPROCESSABLE_ENTITY: 'UNPROCESSABLE_ENTITY',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  DATABASE_ERROR: 'DATABASE_ERROR',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ErrorDetail {
  field?: string;
  message: string;
  [key: string]: unknown;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCodeValue;
  public readonly details?: ErrorDetail[];
  public readonly isOperational: boolean;

  constructor(
    statusCode: number,
    code: ErrorCodeValue,
    message: string,
    details?: ErrorDetail[],
    isOperational = true,
  ) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, new.target);
  }

  toJSON(): { code: ErrorCodeValue; message: string; details?: ErrorDetail[] } {
    return {
      code: this.code,
      message: this.message,
      ...(this.details?.length ? { details: this.details } : {}),
    };
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Permintaan tidak valid', details?: ErrorDetail[]) {
    super(400, ErrorCode.VALIDATION_ERROR, message, details);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Permintaan tidak valid', code: ErrorCodeValue = ErrorCode.BAD_REQUEST) {
    super(400, code, message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Autentikasi diperlukan', code: ErrorCodeValue = ErrorCode.UNAUTHORIZED) {
    super(401, code, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Anda tidak memiliki akses ke sumber daya ini') {
    super(403, ErrorCode.FORBIDDEN, message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Data', identifier?: string | number) {
    super(404, ErrorCode.NOT_FOUND, identifier ? `${resource} '${identifier}' tidak ditemukan` : `${resource} tidak ditemukan`);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Data sudah ada / bentrok dengan data lain') {
    super(409, ErrorCode.CONFLICT, message);
  }
}

export class UnprocessableEntityError extends AppError {
  constructor(message = 'Permintaan valid tetapi tidak memenuhi aturan bisnis', details?: ErrorDetail[]) {
    super(422, ErrorCode.UNPROCESSABLE_ENTITY, message, details);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Terlalu banyak permintaan, coba lagi nanti') {
    super(429, ErrorCode.TOO_MANY_REQUESTS, message);
  }
}

export class InternalServerError extends AppError {
  constructor(message = 'Terjadi kesalahan pada server') {
    super(500, ErrorCode.INTERNAL_SERVER_ERROR, message, undefined, false);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Layanan sedang tidak tersedia') {
    super(503, ErrorCode.SERVICE_UNAVAILABLE, message);
  }
}

// --------------------------------------------------------------------------
// Factory helpers - lebih ergonomic di service
// --------------------------------------------------------------------------
export const badRequest = (message: string) => new BadRequestError(message);

export const unauthorized = (message = 'Autentikasi diperlukan') => new UnauthorizedError(message);

export const forbidden = (message = 'Akses ditolak') => new ForbiddenError(message);

export const notFound = (resource: string, identifier?: string | number) =>
  new NotFoundError(resource, identifier);

export const conflict = (message: string) => new ConflictError(message);

export const unprocessable = (message: string, details?: ErrorDetail[]) =>
  new UnprocessableEntityError(message, details);