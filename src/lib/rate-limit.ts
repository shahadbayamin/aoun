import { ApiError } from "./errors";

// In-memory fixed-window limiter (per server instance). Use Redis or the edge/WAF in production.
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  b.count++;
  if (b.count > limit) {
    throw new ApiError(429, "RATE_LIMITED", "Too many requests. Please wait and try again.", {
      retryAfterSec: Math.ceil((b.resetAt - now) / 1000),
    });
  }
}

export function resetRateLimits() {
  buckets.clear();
}
