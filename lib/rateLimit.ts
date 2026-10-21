import { NextRequest, NextResponse } from "next/server";
import { adminDb, Timestamp } from "@/lib/firebase/admin";

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
  /** count across all serverless instances (one Firestore write per call): use it for costly or abuse-prone endpoints */
  shared?: boolean;
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
 * A limiter shared by every serverless instance. Each (identifier, time window) is one Firestore document whose
 * counter is incremented inside a transaction, so two instances can never both let the last request through.
 * It is a fixed window (a burst of up to 2x the limit can straddle a window boundary), which is fine for abuse
 * protection and cost control. If Firestore itself is unreachable it falls back to the per-instance limiter below and
 * logs it: protection degrades to "per instance" rather than disappearing, and the failure is visible in the logs.
 * Old window documents are removed by a Firestore TTL policy on `purgeAt` (see docs/DEPLOY.md).
 */
export async function evaluateSharedRateLimit(identifier: string, limit: number, windowMs: number, now = Date.now()): Promise<RateLimitResult> {
  const bucket = Math.floor(now / windowMs);
  const ref = adminDb().collection("rateLimits").doc(`${identifier.replace(/[/\\]/g, "_").slice(0, 200)}_${bucket}`);
  try {
    return await adminDb().runTransaction(async (t) => {
      const snap = await t.get(ref);
      const count = snap.exists ? Number(snap.data()?.count) || 0 : 0;
      const resetMs = Math.max(1, (bucket + 1) * windowMs - now);
      if (count >= limit) return { success: false, remaining: 0, resetMs };
      t.set(ref, { count: count + 1, windowStart: bucket * windowMs, purgeAt: Timestamp.fromMillis((bucket + 2) * windowMs + 3_600_000) }, { merge: true });
      return { success: true, remaining: Math.max(0, limit - count - 1), resetMs };
    });
  } catch (err) {
    console.error(`[rateLimit] shared limiter unavailable, using the per-instance limit for ${identifier.split(":").slice(0, 2).join(":")}:`, err instanceof Error ? err.message : err);
    return evaluateRateLimit(identifier, limit, windowMs);
  }
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

  const result = options.shared ? await evaluateSharedRateLimit(id, options.limit, options.windowMs) : await evaluateRateLimit(id, options.limit, options.windowMs);

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
