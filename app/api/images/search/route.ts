import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { checkRateLimit } from "@/lib/rateLimit";
import { searchImages } from "@/lib/images/commons";

export const runtime = "nodejs";

/** Pictures from Wikimedia Commons for a search ("Arduino Uno", "plant cell"), with who made them and their licence. */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "img_search", limit: 20, windowMs: 60_000 });
    if (limited) return limited;
    const q = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 120);
    if (q.length < 2) return NextResponse.json({ ok: true, data: { images: [] } });
    return NextResponse.json({ ok: true, data: { images: await searchImages(q, 8) } });
  } catch (error) {
    return handleAuthError(error);
  }
}
