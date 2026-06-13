import { NextResponse } from "next/server";
import { applySecurityHeaders } from "@/lib/security/headers";
import { checkRateLimit, RATE_LIMITS, type RateLimitConfig } from "@/lib/security/rate-limit";
import { checkDistributedRateLimit } from "@/lib/security/upstash-rate-limit";

const MAX_JSON_BYTES = 256 * 1024;

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
  return req.headers.get("x-real-ip") ?? "unknown";
}

function rateLimitResponse(retryAfterSec: number) {
  const res = NextResponse.json(
    { error: "Terlalu banyak permintaan. Coba lagi nanti." },
    { status: 429 }
  );
  res.headers.set("Retry-After", String(retryAfterSec));
  return applySecurityHeaders(res);
}

export function enforceRateLimit(
  req: Request,
  scope: string,
  config: RateLimitConfig = RATE_LIMITS.api
): NextResponse | null {
  const ip = getClientIp(req);
  const key = `${scope}:${ip}`;
  const result = checkRateLimit(key, config);
  if (!result.allowed) {
    return rateLimitResponse(result.retryAfterSec);
  }
  return null;
}

/** Rate limit terdistribusi Upstash + fallback in-memory — untuk endpoint kritikal. */
export async function enforceDistributedRateLimit(
  req: Request,
  scope: string,
  config: RateLimitConfig
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const result = await checkDistributedRateLimit(scope, ip, config);
  if (!result.allowed) {
    return rateLimitResponse(result.retryAfterSec);
  }
  return null;
}

export function enforceMethod(req: Request, allowed: string[]): NextResponse | null {
  if (!allowed.includes(req.method)) {
    const res = NextResponse.json({ error: "Method not allowed" }, { status: 405 });
    return applySecurityHeaders(res);
  }
  return null;
}

/** Batasi ukuran body — mitigasi flood / large payload */
export async function readJsonBody<T>(
  req: Request,
  maxBytes = MAX_JSON_BYTES
): Promise<{ data: T } | { error: NextResponse }> {
  const contentLength = req.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    const res = NextResponse.json({ error: "Payload terlalu besar" }, { status: 413 });
    return { error: applySecurityHeaders(res) };
  }

  const raw = await req.text();
  if (raw.length > maxBytes) {
    const res = NextResponse.json({ error: "Payload terlalu besar" }, { status: 413 });
    return { error: applySecurityHeaders(res) };
  }

  if (!raw.trim()) {
    return { data: {} as T };
  }

  try {
    return { data: JSON.parse(raw) as T };
  } catch {
    const res = NextResponse.json({ error: "JSON tidak valid" }, { status: 400 });
    return { error: applySecurityHeaders(res) };
  }
}

export function secureJsonResponse(
  body: unknown,
  init?: { status?: number }
): NextResponse {
  return applySecurityHeaders(NextResponse.json(body, init));
}
