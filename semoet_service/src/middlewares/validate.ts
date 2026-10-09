import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { ValidationError, type ErrorDetail } from '../errors/AppError.js';

export interface ValidationSchemas {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
  headers?: ZodTypeAny;
}

function toDetails(error: ZodError, source: 'body' | 'params' | 'query' | 'headers'): ErrorDetail[] {
  return error.issues.map((issue) => ({
    field: [source, ...issue.path].join('.'),
    message: issue.message,
    code: issue.code,
  }));
}

/**
 * Validasi request dengan Zod. Hasil parse replaces nilai mentah sehingga
 * controller selalu bekerja dengan data yang sudah bersih dan ter-typing.
 * Unknown key dibuang lewat .strip() default schema zod object.
 */
export function validate(schemas: ValidationSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const details: ErrorDetail[] = [];

    try {
      if (schemas.params) {
        const parsed = schemas.params.safeParse(req.params);
        if (!parsed.success) details.push(...toDetails(parsed.error, 'params'));
        else Object.assign(req.params, parsed.data);
      }

      if (schemas.query) {
        const parsed = schemas.query.safeParse(req.query);
        if (!parsed.success) details.push(...toDetails(parsed.error, 'query'));
        else req.validatedQuery = parsed.data;
      }

      if (schemas.body) {
        const parsed = schemas.body.safeParse(req.body ?? {});
        if (!parsed.success) details.push(...toDetails(parsed.error, 'body'));
        else {
          req.body = parsed.data;
          req.validatedBody = parsed.data;
        }
      }

      if (schemas.headers) {
        const parsed = schemas.headers.safeParse(req.headers);
        if (!parsed.success) details.push(...toDetails(parsed.error, 'headers'));
      }
    } catch (error) {
      if (error instanceof ZodError) return next(error);
      return next(error);
    }

    if (details.length > 0) return next(new ValidationError('Validasi gagal', details));
    return next();
  };
}