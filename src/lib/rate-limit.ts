/**
 * @file src/lib/rate-limit.ts
 * @description Lightweight in-memory sliding-window rate limiter for public & sensitive
 * endpoints (pairing PINs, password changes, webhooks, and QR scan redirects).
 */

interface BucketEntry {
  timestamps: number[];
}

const buckets = new Map<string, BucketEntry>();
const MAX_BUCKETS = 5000;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  nowMs: number = Date.now()
): RateLimitResult {
  // Periodic memory hygiene
  if (buckets.size > MAX_BUCKETS) {
    const oldestCutoff = nowMs - 15 * 60 * 1000;
    for (const [k, entry] of buckets.entries()) {
      const latest = entry.timestamps[entry.timestamps.length - 1] ?? 0;
      if (latest < oldestCutoff) {
        buckets.delete(k);
      }
    }
  }

  const cutoff = nowMs - windowMs;
  const entry = buckets.get(key) ?? { timestamps: [] };
  entry.timestamps = entry.timestamps.filter((ts) => ts > cutoff);

  if (entry.timestamps.length >= limit) {
    const oldestInWindow = entry.timestamps[0] ?? nowMs;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((oldestInWindow + windowMs - nowMs) / 1000)
    );
    buckets.set(key, entry);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds,
    };
  }

  entry.timestamps.push(nowMs);
  buckets.set(key, entry);
  return {
    allowed: true,
    remaining: Math.max(0, limit - entry.timestamps.length),
    retryAfterSeconds: 0,
  };
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}

export function rateLimitExceededResponse(retryAfterSeconds: number): Response {
  return Response.json(
    {
      error: "Too many requests. Please wait a moment and try again.",
      retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
      },
    }
  );
}
