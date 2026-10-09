import type { NextFunction, Request, RequestHandler, Response } from 'express';

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/**
 * Express 5 sudah otomatis meneruskan rejection ke error handler, tetapi kita
 * tetap membungkus handler agar aman bila dijalankan di Express 4 maupun
 * ketika handler dipakai langsung di unit test.
 */
export function asyncHandler(handler: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}