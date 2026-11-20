import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { checkRateLimit } from "@/lib/rateLimit";
import { resetMirror } from "@/lib/mirror/store";

export const runtime = "nodejs";

/** Deletes the learner's whole Mirror profile (counters, edits, summary). Personalisation goes back to off. */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "mirror-reset", limit: 5, windowMs: 60_000 });
    if (limited) return limited;
    await resetMirror(caller.uid);
    return NextResponse.json({ ok: true, data: { reset: true } });
  } catch (error) {
    return handleAuthError(error);
  }
}
