import type { RequestHandler } from 'express';
import { NotFoundError } from '../errors/AppError.js';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`Endpoint ${req.method} ${req.originalUrl}`));
};