/**
 * Where to send someone after signing in or signing up. Only same-site paths are allowed
 * (no "//evil.com" or "https://…"), and auth pages fall back to the dashboard.
 */
export function safeRedirect(raw: string | null | undefined, fallback = "/dashboard"): string {
  if (!raw || typeof raw !== "string") return fallback;
  let value = raw.trim();
  try {
    if (/%2f|%5c/i.test(value)) value = decodeURIComponent(value);
  } catch {
    return fallback;
  }
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\") || /[\u0000-\u001f]/.test(value)) return fallback;
  if (/^\/(login|signup)(\/|\?|$)/.test(value)) return fallback;
  return value;
}

/** Reads `?redirect=` from the current URL (client only). */
export function redirectFromLocation(fallback = "/dashboard"): string {
  if (typeof window === "undefined") return fallback;
  return safeRedirect(new URLSearchParams(window.location.search).get("redirect"), fallback);
}
