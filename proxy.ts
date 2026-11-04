import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeRedirect } from "@/lib/auth/redirect";
import { API_WRITE_LIMIT, bodyTooLarge, clientKey, isCrossSiteWrite, isWrite, writeRetryAfter } from "@/lib/security/api-guard";

const protectedPrefixes = [
  "/dashboard",
  "/explore",
  "/classes",
  "/notebook",
  "/studio",
  "/tutor",
  "/lounge",
  "/profile",
  "/admin",
  "/feed",
  "/challenges",
  "/leaderboard",
  "/sessions",
  "/notifications",
  "/friends",
  "/messages",
  "/saved",
  "/u",
  "/search",
  "/more",
  "/study",
  "/community",
  "/focus",
  "/groups",
  "/ask",
  "/tutors",
  "/shoutouts",
  "/explainers",
  "/communities",
  "/mentors",
  "/polls",
  "/quests",
  "/streak",
  "/shop",
  "/report",
  "/goals",
  "/activity",
  "/teach",
  "/settings",
  "/plans",
  "/experiments",
];

const authPages = ["/login", "/signup"];

function guardApi(req: NextRequest, sessionCookie: string | undefined): NextResponse {
  if (isCrossSiteWrite(req.method, req.headers.get("origin"), req.headers.get("host"))) {
    return NextResponse.json({ ok: false, error: { code: "FORBIDDEN", message: "Cross-site requests are not allowed." } }, { status: 403 });
  }
  if (isWrite(req.method) && bodyTooLarge(req.headers.get("content-length"))) {
    return NextResponse.json({ ok: false, error: { code: "TOO_LARGE", message: "That upload is too large." } }, { status: 413 });
  }
  if (isWrite(req.method)) {
    const { key, signedIn } = clientKey(req.headers, sessionCookie);
    const wait = writeRetryAfter(key, signedIn ? API_WRITE_LIMIT.signedIn : API_WRITE_LIMIT.anonymous, API_WRITE_LIMIT.windowMs);
    if (wait) {
      return NextResponse.json(
        { ok: false, error: { code: "RATE_LIMITED", message: "Too many requests. Please slow down and try again shortly." } },
        { status: 429, headers: { "Retry-After": String(wait) } }
      );
    }
  }
  return NextResponse.next();
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const sessionCookie = req.cookies.get("__session")?.value;

  if (pathname.startsWith("/api/")) return guardApi(req, sessionCookie);

  const isProtected = protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  const isAuthPage = authPages.some(
    (page) => pathname === page || pathname.startsWith(`${page}/`)
  );

  // Already signed in on an auth page: continue to where they were headed (e.g. a shared class link)
  if (isAuthPage && sessionCookie) {
    return NextResponse.redirect(new URL(safeRedirect(req.nextUrl.searchParams.get("redirect")), req.url));
  }

  // Protected page without a session: sign in first, then come back to the exact link (incl. ?code=)
  if (isProtected && !sessionCookie) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("redirect", `${pathname}${req.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  // Special check for /admin: ensure authenticated session cookie exists
  if (pathname.startsWith("/admin")) {
    if (!sessionCookie) {
      return NextResponse.redirect(new URL("/login?redirect=/admin", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths (API routes too, for the write guard) except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, images, fonts, static assets
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mjs|js|css)).*)",
  ],
};
