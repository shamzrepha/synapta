import { NextRequest, NextResponse } from "next/server";

interface RateLimitRecord {
  timestamps: number[];
}

// In-memory sliding window store
const memoryStore = new Map<string, RateLimitRecord>();

// Clean up stale memory records periodically
const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = Date.now();

function cleanupMemoryStore(now: number, maxAgeMs: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  for (const [key, record] of memoryStore.entries()) {
    record.timestamps = record.timestamps.filter((ts) => now - ts < maxAgeMs);
    if (record.timestamps.length === 0) {
      memoryStore.delete(key);
    }
  }
}

export interface RateLimitOptions {
  keyPrefix: string;
  limit: number;
  windowMs: number;
  uid?: string | null;
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetMs: number;
}

/**
 * Evaluates sliding window rate limits.
 */
export async function evaluateRateLimit(
  identifier: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const now = Date.now();
  cleanupMemoryStore(now, windowMs);

  let record = memoryStore.get(identifier);
  if (!record) {
    record = { timestamps: [] };
    memoryStore.set(identifier, record);
  }

  // Filter timestamps within window
  record.timestamps = record.timestamps.filter((ts) => now - ts < windowMs);

  if (record.timestamps.length >= limit) {
    const oldest = record.timestamps[0];
    const resetMs = Math.max(0, windowMs - (now - oldest));
    return {
      success: false,
      remaining: 0,
      resetMs,
    };
  }

  record.timestamps.push(now);
  const remaining = Math.max(0, limit - record.timestamps.length);

  return {
    success: true,
    remaining,
    resetMs: windowMs,
  };
}

/**
 * Helper to check rate limits in Next.js route handlers.
 * Returns a 429 NextResponse if rate limit is exceeded, or null if allowed.
 */
export async function checkRateLimit(
  req: NextRequest,
  options: RateLimitOptions
): Promise<NextResponse | null> {
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
  const id = options.uid ? `user:${options.uid}:${options.keyPrefix}` : `ip:${clientIp}:${options.keyPrefix}`;

  const result = await evaluateRateLimit(id, options.limit, options.windowMs);

  if (!result.success) {
    const retryAfterSec = Math.ceil(result.resetMs / 1000);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Please slow down and try again shortly.",
        },
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSec),
          "X-RateLimit-Limit": String(options.limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(retryAfterSec),
        },
      }
    );
  }

  return null;
}
