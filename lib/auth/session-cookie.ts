/** The server-side sign-in ("session cookie"): how long it lasts, and the options it is set with. */

/** Firebase allows a session cookie to last at most 14 days. */
export const SESSION_DAYS = 14;
export const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

/**
 * "Keep me signed in" ticked: the cookie lasts the full 14 days. Unticked: no max-age at all, so the browser drops it when it is
 * closed (a shared computer). It is always HttpOnly so scripts on the page can't read it.
 */
export function sessionCookieOptions(remember: boolean, production: boolean) {
  return {
    httpOnly: true,
    secure: production,
    path: "/",
    sameSite: "lax" as const,
    ...(remember ? { maxAge: Math.floor(SESSION_MS / 1000) } : {}),
  };
}
