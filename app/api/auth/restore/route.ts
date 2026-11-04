import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { classifyAuthFailure, logAuthFailure } from "@/lib/auth/failures";

export const runtime = "nodejs";

/**
 * Brings someone back who is still signed in on the server but whose browser has lost its own saved sign-in (private-mode
 * storage, an in-app browser, a cleared site-data setting). The valid session cookie proves who they are, and we hand back a
 * one-time sign-in token for the same account, so they don't have to type their password again.
 *
 * It gives away nothing the cookie doesn't already: the cookie is already enough to use every API as that person.
 */
export async function POST(req: NextRequest) {
  const limited = await checkRateLimit(req, { keyPrefix: "auth_restore", limit: 20, windowMs: 60_000 });
  if (limited) return limited;
  const cookie = req.cookies.get("__session")?.value;
  if (!cookie) return NextResponse.json({ ok: false, error: { code: "NO_SESSION", message: "Not signed in." } }, { status: 401 });
  try {
    const decoded = await adminAuth().verifySessionCookie(cookie, true);
    const token = await adminAuth().createCustomToken(decoded.uid);
    return NextResponse.json({ ok: true, data: { token } }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    logAuthFailure("restore", err);
    const f = classifyAuthFailure(err);
    // a bad or expired cookie is a clear "no"; anything else (our service, the network) is "can't tell right now": the browser keeps the cookie
    if (f.status === 401) return NextResponse.json({ ok: false, error: { code: f.code, message: f.message } }, { status: 401 });
    return NextResponse.json({ ok: false, error: { code: "AUTH_UNAVAILABLE", message: "Couldn't check your sign-in right now." } }, { status: 503 });
  }
}
