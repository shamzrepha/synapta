import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const protectedPrefixes = [
  "/dashboard",
  "/explore",
  "/classes",
  "/notebook",
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

  // If visiting an auth page while already authenticated, redirect to dashboard
  if (isAuthPage && sessionCookie) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // If visiting a protected page without a session cookie, redirect to login
  if (isProtected && !sessionCookie) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("redirect", pathname);
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
