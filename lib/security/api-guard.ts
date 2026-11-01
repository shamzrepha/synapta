/**
 * First line of defence for every /api request, run in the proxy before any route code:
 * - cross-site writes are refused (a page on another site cannot post with the user's cookie), and
 * - every write gets a baseline rate limit, on top of the tighter limits the costly routes set themselves.
 * The limiter is per server instance (in memory): it stops floods from one client; routes that spend money use the
 * shared Firestore limiter as well.
 */

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const API_WRITE_LIMIT = { signedIn: 240, anonymous: 60, windowMs: 60_000 };

/** Largest body any route accepts (video explainers, 25 MB); a bigger declared body is refused before parsing. */
export const MAX_API_BODY_BYTES = 26 * 1024 * 1024;

export function bodyTooLarge(contentLength: string | null, max = MAX_API_BODY_BYTES): boolean {
  const n = Number(contentLength);
  return Number.isFinite(n) && n > max;
}

export function isWrite(method: string): boolean {
  return WRITE_METHODS.has(method.toUpperCase());
}

/** A write whose Origin names another site. No Origin header (server-to-server, cron, curl) is allowed through. */
export function isCrossSiteWrite(method: string, origin: string | null, host: string | null): boolean {
  if (!isWrite(method) || !origin) return false;
  if (origin === "null") return true;
  try {
    return !host || new URL(origin).host.toLowerCase() !== host.toLowerCase();
  } catch {
    return true;
  }
}

/** Who to count a request against: the signed-in credential when there is one, else the client IP. */
export function clientKey(headers: { get(name: string): string | null }, sessionCookie: string | undefined): { key: string; signedIn: boolean } {
  const bearer = headers.get("authorization")?.match(/^Bearer\s+(.+)$/)?.[1];
  const cred = sessionCookie || bearer;
  // the tail of the credential is enough to tell people apart, and never the whole token in memory keys
  if (cred) return { key: `c:${cred.slice(-24)}`, signedIn: true };
  const ip = headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
  return { key: `ip:${ip}`, signedIn: false };
}

const hits = new Map<string, number[]>();
let lastSweep = 0;

/** Sliding-window check; returns seconds to wait when the limit is reached, else 0. */
export function writeRetryAfter(key: string, limit: number, windowMs: number, now = Date.now()): number {
  if (now - lastSweep > windowMs) {
    lastSweep = now;
    for (const [k, ts] of hits) if (!ts.length || now - ts[ts.length - 1] >= windowMs) hits.delete(k);
  }
  const ts = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (ts.length >= limit) {
    hits.set(key, ts);
    return Math.max(1, Math.ceil((windowMs - (now - ts[0])) / 1000));
  }
  ts.push(now);
  hits.set(key, ts);
  return 0;
}

export function resetWriteLimiter() {
  hits.clear();
  lastSweep = 0;
}
