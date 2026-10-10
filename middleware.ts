import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const protectedPrefixes = [
  "/dashboard",
  "/explore",
  "/classes",
  "/notebook",
  "/lounge",
  "/profile",
  "/admin",
];

const authPages = ["/login", "/signup"];

export function middleware(req: NextRequest) {
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

  // Special check for /admin: decode session token claims if possible
  if (pathname.startsWith("/admin") && sessionCookie) {
    try {
      const parts = sessionCookie.split(".");
      if (parts.length === 3) {
        const payloadJson = Buffer.from(parts[1], "base64").toString("utf-8");
        const payload = JSON.parse(payloadJson);
        if (payload.role !== "admin") {
          return NextResponse.redirect(new URL("/dashboard?error=unauthorized", req.url));
        }
      }
    } catch {
      // If parsing fails, allow server handler to strictly verify
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
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)).*)",
  ],
};
