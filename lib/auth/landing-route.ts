/**
 * Decides what a request for the home page `/` should do. Pure, so it is unit tested; proxy.ts applies it.
 *
 *  - signed in (session cookie present)        -> /dashboard
 *  - signed out but seen us before (sr_seen)    -> /login
 *  - first-time visitor                         -> landing page (null)
 *  - crawlers / link previews, or ?landing=1    -> landing page (null), so SEO and shared links keep working
 *
 * The cookie only proves presence, not validity. A stale one lands on /dashboard, where the auth provider asks the
 * server, clears the dead cookie and sends the person to /login (no loop; see dropStaleCookie in auth-provider).
 * The Android shell opens /dashboard directly and MobileLandingRedirect covers it if it ever lands on `/`.
 */
export const SEEN_COOKIE = "sr_seen";
export const SEEN_MAX_AGE = 60 * 60 * 24 * 365;

const BOT_RE =
  /bot|crawl|spider|slurp|facebookexternalhit|facebot|embedly|whatsapp|telegram|slack|discord|twitter|linkedinbot|pinterest|skypeuripreview|preview|lighthouse|headless|google-inspectiontool|bingpreview|duckduck|yandex|baidu|applebot|ia_archiver|curl|wget/i;

export function isCrawler(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true; // no user agent at all is not a person with a browser
  return BOT_RE.test(userAgent);
}

export interface LandingInput {
  path: string;
  hasSession: boolean;
  hasSeen: boolean;
  userAgent?: string | null;
  query?: URLSearchParams | string | null;
}

export function landingRedirect(i: LandingInput): string | null {
  if (i.path !== "/") return null;
  const q = typeof i.query === "string" ? new URLSearchParams(i.query) : i.query;
  if (q?.get("landing") === "1") return null;
  if (isCrawler(i.userAgent)) return null;
  if (i.hasSession) return "/dashboard";
  if (i.hasSeen) return "/login";
  return null;
}
