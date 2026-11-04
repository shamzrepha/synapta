import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { z } from "zod";
import { classifyAuthFailure, logAuthFailure } from "@/lib/auth/failures";
import { checkRateLimit } from "@/lib/rateLimit";
import { SESSION_MS, sessionCookieOptions } from "@/lib/auth/session-cookie";

export const runtime = "nodejs";

const sessionSchema = z.object({
  idToken: z.string().min(1, "idToken is required"),
  /** "Keep me signed in": true (the default) keeps the cookie for 14 days, false drops it when the browser closes */
  remember: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const limited = await checkRateLimit(req, { keyPrefix: "auth_session", limit: 20, windowMs: 60_000 });
    if (limited) return limited;
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: { code: "BAD_JSON", message: "Malformed request." } }, { status: 400 });
    }
    const parsed = sessionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: "Missing or invalid sign-in token." } },
        { status: 400 }
      );
    }

    const { idToken, remember = true } = parsed.data;

    // Verify token first
    await adminAuth().verifyIdToken(idToken);

    // Create session cookie
    const sessionCookie = await adminAuth().createSessionCookie(idToken, {
      expiresIn: SESSION_MS,
    });

    const response = NextResponse.json({
      ok: true,
      data: { status: "session_created" },
    });

    // Set __session cookie
    response.cookies.set({
      name: "__session",
      value: sessionCookie,
      ...sessionCookieOptions(remember, process.env.NODE_ENV === "production"),
    });

    return response;
  } catch (err: unknown) {
    logAuthFailure("sessionCreate", err);
    const f = classifyAuthFailure(err);
    return NextResponse.json(
      { ok: false, error: { code: f.code, message: f.message } },
      { status: f.status, ...(f.status === 429 ? { headers: { "Retry-After": "60" } } : {}) }
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({
    ok: true,
    data: { status: "session_cleared" },
  });

  response.cookies.set({
    name: "__session",
    value: "",
    maxAge: 0,
    path: "/",
    httpOnly: true,
  });

  return response;
}
