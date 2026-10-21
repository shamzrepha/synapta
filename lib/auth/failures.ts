import { ApiError } from "@/lib/api/errors";

/**
 * What a sign-in or token failure means for the client. Provider (Firebase) messages can contain internal detail,
 * so clients only ever get these fixed sentences; the real cause is logged on the server by `logAuthFailure`.
 */
export interface AuthFailure {
  status: 400 | 401 | 429 | 500 | 503;
  code: "UNAUTHENTICATED" | "SESSION_EXPIRED" | "TOO_MANY_ATTEMPTS" | "AUTH_UNAVAILABLE" | "INTERNAL";
  message: string;
}

const EXPIRED = new Set(["auth/id-token-expired", "auth/session-cookie-expired"]);
const INVALID = new Set(["auth/id-token-revoked", "auth/session-cookie-revoked", "auth/invalid-id-token", "auth/argument-error", "auth/invalid-session-cookie", "auth/user-disabled", "auth/user-not-found", "auth/invalid-credential"]);

function codeOf(err: unknown): string {
  const c = (err as { code?: unknown })?.code;
  return typeof c === "string" ? c : "";
}

export function classifyAuthFailure(err: unknown): AuthFailure {
  const code = codeOf(err);
  if (EXPIRED.has(code)) return { status: 401, code: "SESSION_EXPIRED", message: "Your sign-in has expired. Please sign in again." };
  if (INVALID.has(code)) return { status: 401, code: "UNAUTHENTICATED", message: "We couldn't verify your sign-in. Please sign in again." };
  if (code === "auth/too-many-requests") return { status: 429, code: "TOO_MANY_ATTEMPTS", message: "Too many attempts. Please wait a moment and try again." };
  if (code === "auth/network-request-failed" || code === "app/network-error") return { status: 503, code: "AUTH_UNAVAILABLE", message: "Sign-in is temporarily unavailable. Please try again shortly." };
  return { status: 500, code: "INTERNAL", message: "Something went wrong on our side. Please try again." };
}

/** Server-side diagnostics: the error code and a trimmed message, never the token, cookie or the whole request. */
export function logAuthFailure(where: string, err: unknown) {
  const code = codeOf(err) || (err instanceof Error ? err.name : "unknown");
  const raw = err instanceof Error ? err.message : String(err);
  // drop anything that looks like a token or long opaque string
  const msg = raw.replace(/[A-Za-z0-9_\-.]{40,}/g, "[redacted]").slice(0, 200);
  console.warn(`[auth:${where}] ${code}: ${msg}`);
}

export function authFailureToApiError(err: unknown): ApiError {
  const f = classifyAuthFailure(err);
  return new ApiError(f.status, f.code, f.message);
}
