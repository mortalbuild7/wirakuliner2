import type { Request, Response, NextFunction } from "express";

/**
 * Mitigasi Inefficient Query Attack — batasi limit/offset secara ketat.
 * Tanpa ini, ?limit=9999999 bisa membuat PostgreSQL CPU 100%.
 */

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_OFFSET = 5_000;

declare global {
  namespace Express {
    interface Request {
      pagination?: { limit: number; offset: number; page: number };
    }
  }
}

export function enforcePagination(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const rawLimit = Number(req.query.limit);
  const rawOffset = Number(req.query.offset);
  const rawPage = Number(req.query.page);

  let limit = Number.isFinite(rawLimit) ? Math.floor(rawLimit) : DEFAULT_LIMIT;
  limit = Math.min(Math.max(limit, 1), MAX_LIMIT);

  let offset = 0;
  if (Number.isFinite(rawPage) && rawPage >= 1) {
    offset = Math.floor((rawPage - 1) * limit);
  } else if (Number.isFinite(rawOffset) && rawOffset >= 0) {
    offset = Math.floor(rawOffset);
  }
  offset = Math.min(offset, MAX_OFFSET);

  req.pagination = {
    limit,
    offset,
    page: Math.floor(offset / limit) + 1,
  };

  next();
}
