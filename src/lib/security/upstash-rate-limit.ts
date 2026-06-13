import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { RateLimitConfig, RateLimitResult } from "@/lib/security/rate-limit";
import { checkRateLimit } from "@/lib/security/rate-limit";

type WindowToken = `${number} s` | `${number} m` | `${number} h` | `${number} d`;

const limiterCache = new Map<string, Ratelimit>();

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function windowTokenFromMs(ms: number): WindowToken {
  if (ms % 86_400_000 === 0) return `${ms / 86_400_000} d`;
  if (ms % 3_600_000 === 0) return `${ms / 3_600_000} h`;
  if (ms % 60_000 === 0) return `${ms / 60_000} m`;
  return `${Math.max(1, Math.round(ms / 1000))} s`;
}

function getLimiter(prefix: string, limit: number, window: WindowToken): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;

  const cacheKey = `${prefix}:${limit}:${window}`;
  const cached = limiterCache.get(cacheKey);
  if (cached) return cached;

  const rl = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, window),
    prefix: `wira:${prefix}`,
    analytics: true,
  });
  limiterCache.set(cacheKey, rl);
  return rl;
}

export type DistributedRateResult = RateLimitResult & { distributed: boolean };

/**
 * Rate limit terdistribusi (Upstash) dengan fallback in-memory per instance.
 */
export async function checkDistributedRateLimit(
  scope: string,
  identifier: string,
  config: RateLimitConfig
): Promise<DistributedRateResult> {
  const window = windowTokenFromMs(config.windowMs);
  const limiter = getLimiter(scope, config.limit, window);

  if (limiter) {
    const { success, remaining, reset } = await limiter.limit(identifier);
    const retryAfterSec = Math.max(0, Math.ceil((reset - Date.now()) / 1000));
    return {
      allowed: success,
      remaining,
      retryAfterSec: success ? 0 : Math.max(1, retryAfterSec),
      distributed: true,
    };
  }

  const local = checkRateLimit(`${scope}:${identifier}`, config);
  return { ...local, distributed: false };
}
