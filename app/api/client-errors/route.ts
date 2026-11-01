import { NextRequest, NextResponse } from "next/server";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rateLimit";

/** Error reports can carry tokens or codes in URLs and messages: keep the path, drop query strings and long opaque strings. */
function scrub(text: string): string {
  return text.replace(/([?#][^\s"')]*)/g, "").replace(/[A-Za-z0-9_\-.]{40,}/g, "[redacted]");
}

export const runtime = "nodejs";

const clientErrorSchema = z.object({
  message: z.string().min(1).max(2000),
  stack: z.string().max(8000).optional(),
  url: z.string().max(1000).optional(),
  userAgent: z.string().max(500).optional(),
  digest: z.string().max(100).optional(),
});

export async function POST(req: NextRequest) {
  try {
    // anyone can report (errors happen signed out too), so cap it per client to keep the log cheap
    const limited = await checkRateLimit(req, { keyPrefix: "client_errors", limit: 10, windowMs: 60_000 });
    if (limited) return limited;
    const body = await req.json().catch(() => ({}));
    const parsed = clientErrorSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: "Invalid error payload" } },
        { status: 400 }
      );
    }

    const { message, stack, url, userAgent, digest } = parsed.data;

    // 14 days TTL expiration
    const expireAt = Timestamp.fromDate(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000));

    await adminDb().collection("errorLogs").add({
      type: "client_error",
      message: scrub(message).slice(0, 1000),
      stack: stack ? scrub(stack).slice(0, 4000) : null,
      url: url ? scrub(url) : null,
      userAgent: userAgent || null,
      digest: digest || null,
      ip: req.headers.get("x-forwarded-for")?.split(",")[0] || null,
      createdAt: Timestamp.now(),
      expireAt,
    });

    return NextResponse.json({
      ok: true,
      data: { status: "logged" },
    });
  } catch {
    // Fail silently without crashing the client error reporting loop
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL", message: "Failed to record error" } },
      { status: 500 }
    );
  }
}
