import { NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { applySecurityHeaders } from "@/lib/security/headers";
import { checkRateLimit, type RateLimitConfig } from "@/lib/security/rate-limit";
import { getClientIp } from "@/lib/security/enforce";

/**
 * RATE LIMITING LOGIN ADMIN (Upstash Redis)
 *
 * Batas: 3 percobaan POST /api/admin/auth/login per 5 menit per IP.
 * Menggunakan sliding window agar serangan brute-force tersebar tidak lolos.
 *
 * Env wajib di Vercel / .env.local (server-only):
 * - UPSTASH_REDIS_REST_URL
 * - UPSTASH_REDIS_REST_TOKEN
 *
 * Jika Upstash belum dikonfigurasi, middleware memakai fallback in-memory
 * (lihat `checkAdminLoginRateLimit` di middleware.ts).
 */

let ratelimit: Ratelimit | null = null;

function getUpstashRatelimit(): Ratelimit | null {
  if (ratelimit) return ratelimit;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  ratelimit = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(3, "5 m"),
    prefix: "wira:admin-login",
    analytics: true,
  });

  return ratelimit;
}

export type AdminLoginRateResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
};

export async function checkUpstashAdminLoginRate(
  ip: string
): Promise<AdminLoginRateResult | null> {
  const rl = getUpstashRatelimit();
  if (!rl) return null;

  const { success, remaining, reset } = await rl.limit(ip);
  const retryAfterSec = Math.max(0, Math.ceil((reset - Date.now()) / 1000));

  return {
    allowed: success,
    remaining,
    retryAfterSec,
  };
}

const FALLBACK_CONFIG: RateLimitConfig = { limit: 3, windowMs: 5 * 60_000 };

/**
 * Dipanggil dari POST /api/admin/auth/login (Node runtime).
 * Middleware memakai fallback in-memory agar tetap ada lapisan awal di Edge.
 */
export async function enforceAdminLoginRateLimit(
  req: Request
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const upstash = await checkUpstashAdminLoginRate(ip);

  const blocked = upstash
    ? !upstash.allowed
    : !checkRateLimit(`admin-login:${ip}`, FALLBACK_CONFIG).allowed;

  if (!blocked) return null;

  const retryAfter = upstash?.retryAfterSec ?? 300;
  const res = NextResponse.json(
    { error: "Terlalu banyak percobaan login admin. Coba lagi nanti." },
    { status: 429 }
  );
  res.headers.set("Retry-After", String(retryAfter));
  return applySecurityHeaders(res);
}
