import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

/**
 * IDOR / BOLA — Identitas pemilik transaksi HANYA dari JWT.
 * Jangan pernah: const driverId = req.body.driver_id
 */

export type JwtPayload = {
  sub: string;
  role: "customer" | "driver" | "merchant" | "admin";
  /** ID entitas bisnis — driver.id / merchant.id / customer profile id */
  ownerId: string;
  ownerType: "customer" | "driver" | "merchant";
};

declare global {
  namespace Express {
    interface Request {
      auth?: JwtPayload;
    }
  }
}

const FORBIDDEN_BODY_KEYS = [
  "ownerId",
  "owner_id",
  "driverId",
  "driver_id",
  "merchantId",
  "merchant_id",
  "customerId",
  "customer_id",
];

/** Tolak body yang menyisipkan ID pemilik — serangan IDOR klasik. */
export function rejectOwnerIdsInBody(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const body = req.body as Record<string, unknown>;
  for (const key of FORBIDDEN_BODY_KEYS) {
    if (body[key] !== undefined && body[key] !== null && body[key] !== "") {
      res.status(403).json({
        error:
          "ID pemilik tidak boleh dikirim dari client. Gunakan token JWT.",
      });
      return;
    }
  }
  next();
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: "Token JWT wajib" });
    return;
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET tidak dikonfigurasi");

    const payload = jwt.verify(token, secret) as JwtPayload;
    req.auth = payload;
    next();
  } catch {
    res.status(401).json({ error: "Token tidak valid atau kedaluwarsa" });
  }
}

/** Contoh: withdraw driver — validasi role + ownerId dari JWT, BUKAN body. */
export function requireDriver(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.auth || req.auth.role !== "driver") {
    res.status(403).json({ error: "Hanya driver yang boleh mengakses endpoint ini" });
    return;
  }
  next();
}
