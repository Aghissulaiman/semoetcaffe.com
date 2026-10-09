import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { logger } from '../config/logger.js';

const REQUEST_ID_HEADER = 'x-request-id';

/** Memberi requestId pada setiap request agar log bisa ditelusuri end-to-end. */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const requestId =
    (typeof incoming === 'string' && incoming.trim().length > 0 ? incoming : undefined) ??
    `req_${randomUUID()}`;

  req.requestId = requestId;
  res.locals.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  next();
}

/** Log ringkas untuk request yang selesai (dipakai sebagai request logger). */
export function logRequest(req: Request, res: Response, next: NextFunction): void {
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const meta = {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
      userId: req.user?.id,
      ip: req.ip,
    };

    if (res.statusCode >= 500) logger.error(meta, 'request failed');
    else if (res.statusCode >= 400) logger.warn(meta, 'request error');
    else logger.info(meta, 'request completed');
  });

  next();
}