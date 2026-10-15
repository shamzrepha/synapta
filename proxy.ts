import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeRedirect } from "@/lib/auth/redirect";

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
];

const authPages = ["/login", "/signup"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const sessionCookie = req.cookies.get("__session")?.value;

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
     * Match all request paths except for:
     * - api routes
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, images, fonts, static assets
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mjs|js|css)).*)",
  ],
};
