import { NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { applySecurityHeaders } from "@/lib/security/headers";
import { checkRateLimit, type RateLimitConfig } from "@/lib/security/rate-limit";
import { getClientIp } from "@/lib/security/enforce";

/**
 * Anti-harvesting — GET /api/customer/profile
 * Maksimal 10 request per menit per IP (Upstash sliding window).
 * Fallback in-memory jika UPSTASH_* belum dikonfigurasi.
 */

let ratelimit: Ratelimit | null = null;

function getUpstashRatelimit(): Ratelimit | null {
  if (ratelimit) return ratelimit;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  ratelimit = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(10, "1 m"),
    prefix: "wira:customer-profile",
    analytics: true,
  });

  return ratelimit;
}

export type CustomerProfileRateResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
};

export async function checkUpstashCustomerProfileRate(
  ip: string
): Promise<CustomerProfileRateResult | null> {
  const rl = getUpstashRatelimit();
  if (!rl) return null;

  const { success, remaining, reset } = await rl.limit(ip);
  return {
    allowed: success,
    remaining,
    retryAfterSec: Math.max(0, Math.ceil((reset - Date.now()) / 1000)),
  };
}

const FALLBACK_CONFIG: RateLimitConfig = { limit: 10, windowMs: 60_000 };

export async function enforceCustomerProfileRateLimit(
  req: Request
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const upstash = await checkUpstashCustomerProfileRate(ip);

  const blocked = upstash
    ? !upstash.allowed
    : !checkRateLimit(`customer-profile:${ip}`, FALLBACK_CONFIG).allowed;

  if (!blocked) return null;

  const retryAfter = upstash?.retryAfterSec ?? 60;
  const res = NextResponse.json(
    { error: "Terlalu banyak permintaan profil. Coba lagi nanti." },
    { status: 429 }
  );
  res.headers.set("Retry-After", String(retryAfter));
  return applySecurityHeaders(res);
}
