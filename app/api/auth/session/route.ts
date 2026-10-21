import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { z } from "zod";
import { classifyAuthFailure, logAuthFailure } from "@/lib/auth/failures";
import { checkRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

const sessionSchema = z.object({
  idToken: z.string().min(1, "idToken is required"),
});

const FIVE_DAYS_MS = 60 * 60 * 24 * 5 * 1000;

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

    const { idToken } = parsed.data;

    // Verify token first
    await adminAuth().verifyIdToken(idToken);

    // Create session cookie
    const sessionCookie = await adminAuth().createSessionCookie(idToken, {
      expiresIn: FIVE_DAYS_MS,
    });

    const response = NextResponse.json({
      ok: true,
      data: { status: "session_created" },
    });

    // Set __session cookie
    response.cookies.set({
      name: "__session",
      value: sessionCookie,
      maxAge: Math.floor(FIVE_DAYS_MS / 1000),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      sameSite: "lax",
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
