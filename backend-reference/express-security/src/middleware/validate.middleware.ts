import type { Request, Response, NextFunction } from "express";
import { body, query, validationResult } from "express-validator";
import xss from "xss";

/**
 * Stored XSS — sanitasi teks publik sebelum masuk PostgreSQL.
 * Setara sanitizePublicText() di production Next.js.
 */

export function stripXss(value: unknown): string {
  if (typeof value !== "string") return "";
  return xss(value.trim(), {
    whiteList: {},
    stripIgnoreTag: true,
    stripIgnoreTagBody: ["script", "style"],
  });
}

export const validateProductCreate = [
  body("name").customSanitizer(stripXss).isLength({ min: 1, max: 120 }),
  body("description").optional().customSanitizer(stripXss).isLength({ max: 2000 }),
  body("price").isFloat({ min: 0, max: 50_000_000 }),
];

export const validateSearchQuery = [
  query("q").optional().customSanitizer(stripXss).isLength({ max: 100 }),
  query("limit").optional().isInt({ min: 1, max: 50 }),
  query("offset").optional().isInt({ min: 0, max: 5000 }),
];

export function handleValidationErrors(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: errors.array()[0]?.msg ?? "Input tidak valid" });
    return;
  }
  next();
}
