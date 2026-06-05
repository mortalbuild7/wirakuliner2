type Bucket = { timestamps: number[] };

const globalStore = globalThis as typeof globalThis & {
  __wiraRateLimit?: Map<string, Bucket>;
};

function store(): Map<string, Bucket> {
  if (!globalStore.__wiraRateLimit) {
    globalStore.__wiraRateLimit = new Map();
  }
  return globalStore.__wiraRateLimit;
}

export type RateLimitConfig = {
  /** Maksimum request dalam jendela */
  limit: number;
  /** Jendela waktu (ms) */
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
};

/**
 * Sliding-window rate limit per key (IP + scope).
 * Mitigasi brute-force & flood per instance (gabung dengan WAF/CDN di production).
 */
export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const map = store();
  const bucket = map.get(key) ?? { timestamps: [] };
  const cutoff = now - config.windowMs;
  bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);

  if (bucket.timestamps.length >= config.limit) {
    const oldest = bucket.timestamps[0] ?? now;
    const retryAfterSec = Math.ceil((oldest + config.windowMs - now) / 1000);
    map.set(key, bucket);
    return { allowed: false, remaining: 0, retryAfterSec: Math.max(1, retryAfterSec) };
  }

  bucket.timestamps.push(now);
  map.set(key, bucket);
  return {
    allowed: true,
    remaining: config.limit - bucket.timestamps.length,
    retryAfterSec: 0,
  };
}

export const RATE_LIMITS = {
  api: { limit: 60, windowMs: 60_000 },
  apiWrite: { limit: 30, windowMs: 60_000 },
  auth: { limit: 10, windowMs: 15 * 60_000 },
  page: { limit: 120, windowMs: 60_000 },
  /** Panel & API admin — lebih ketat */
  admin: { limit: 45, windowMs: 60_000 },
  adminWrite: { limit: 20, windowMs: 60_000 },
} as const;
