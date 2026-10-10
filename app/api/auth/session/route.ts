import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { z } from "zod";

export const runtime = "nodejs";

const sessionSchema = z.object({
  idToken: z.string().min(1, "idToken is required"),
});

const FIVE_DAYS_MS = 60 * 60 * 24 * 5 * 1000;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = sessionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: "Missing or invalid idToken" } },
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
    console.error("Session creation error:", err);
    const message = err instanceof Error ? err.message : "Failed to create session";
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message } },
      { status: 500 }
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
