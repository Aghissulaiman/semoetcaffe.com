import type { NextFunction, Request, Response } from 'express';
// jsonwebtoken adalah CommonJS; named export tidak bisa di-import langsung di
// ESM, jadi kelas errornya diambil lewat default import.
import jwt from 'jsonwebtoken';
import { ZodError } from 'zod';
import { env, isProduction } from '../config/env.js';
import { logger } from '../config/logger.js';
import {
  AppError,
  ErrorCode,
  InternalServerError,
  ValidationError,
  type ErrorDetail,
} from '../errors/AppError.js';

const { JsonWebTokenError, TokenExpiredError } = jwt;

interface PgError extends Error {
  code?: string;
  constraint?: string;
  detail?: string;
  column?: string;
  table?: string;
}

function mapPostgresError(error: PgError): AppError | null {
  switch (error.code) {
    case '23505': // unique_violation
      return new AppError(
        409,
        ErrorCode.CONFLICT,
        `Nilai unik sudah digunakan${error.constraint ? ` (constraint: ${error.constraint})` : ''}`,
      );
    case '23503': // foreign_key_violation
      return new AppError(
        400,
        ErrorCode.BAD_REQUEST,
        'Relasi data tidak valid (referensi tidak ditemukan)',
      );
    case '23514': // check_violation
      return new AppError(
        422,
        ErrorCode.UNPROCESSABLE_ENTITY,
        `Data melanggar aturan database${error.constraint ? ` (${error.constraint})` : ''}`,
      );
    case '22P02': // invalid_text_representation
      return new AppError(400, ErrorCode.BAD_REQUEST, 'Format nilai tidak sesuai (uuid/number/date)');
    case '22007': // invalid_datetime_format
      return new AppError(400, ErrorCode.BAD_REQUEST, 'Format tanggal/waktu tidak valid');
    case '22003': // numeric_value_out_of_range
      return new AppError(400, ErrorCode.BAD_REQUEST, 'Nilai numerik di luar jangkauan');
    case '40001': // serialization_failure
      return new AppError(409, ErrorCode.CONFLICT, 'Konflik transaksi, silakan ulangi request');
    case '40P01': // deadlock_detected
      return new AppError(409, ErrorCode.CONFLICT, 'Deadlock database terdeteksi, silakan ulangi');
    case '57014': // query_canceled
      return new AppError(503, ErrorCode.SERVICE_UNAVAILABLE, 'Query dibatalkan karena timeout');
    case '57P01': // admin_shutdown
      return new AppError(503, ErrorCode.SERVICE_UNAVAILABLE, 'Koneksi database terputus');
    default:
      return null;
  }
}

/** Error handler tunggal untuk seluruh aplikasi (4 argumen wajib di Express). */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  if (res.headersSent) {
    logger.error({ err: error }, '[error] headers already sent');
    return;
  }

  const requestId = req.requestId ?? res.locals.requestId;
  let appError: AppError;

  if (error instanceof AppError) {
    appError = error;
  } else if (error instanceof ZodError) {
    const details: ErrorDetail[] = error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    appError = new ValidationError('Validasi gagal', details);
  } else if (error instanceof TokenExpiredError) {
    appError = new AppError(401, ErrorCode.TOKEN_EXPIRED, 'Token sudah kedaluwarsa');
  } else if (error instanceof JsonWebTokenError) {
    appError = new AppError(401, ErrorCode.TOKEN_INVALID, 'Token tidak valid');
  } else if (error instanceof Error) {
    const pgError = error as PgError;
    appError = mapPostgresError(pgError) ?? new InternalServerError();
    if (!appError.isOperational) {
      logger.error(
        { err: error, requestId, path: req.originalUrl, method: req.method, userId: req.user?.id },
        '[error] unhandled error',
      );
    }
  } else {
    appError = new InternalServerError();
    logger.error({ err: error, requestId }, '[error] non-error thrown');
  }

  const logPayload = {
    requestId,
    statusCode: appError.statusCode,
    code: appError.code,
    message: appError.message,
    path: req.originalUrl,
    method: req.method,
    userId: req.user?.id,
  };

  if (appError.statusCode >= 500) logger.error(logPayload, '[error] request failed');
  else logger.warn(logPayload, '[error] request rejected');

  const body = {
    success: false,
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details?.length ? { details: appError.details } : {}),
      ...(!isProduction && appError.statusCode >= 500 && error instanceof Error
        ? { stack: error.stack?.split('\n').slice(0, 5) }
        : {}),
    },
    requestId,
  };

  res.status(appError.statusCode).json(body);
}