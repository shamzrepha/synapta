import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { SignalBatchSchema } from "@/lib/mirror/schema";
import { recordSignals } from "@/lib/mirror/store";

export const runtime = "nodejs";

/** Batched study signals (started, finished, skipped, too hard...). Dropped, not stored, when personalisation is off. */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "feed-signal", limit: 30, windowMs: 60_000, shared: true });
    if (limited) return limited;
    const { signals } = await parseJson(req, SignalBatchSchema);
    const { accepted } = await recordSignals(caller.uid, signals);
    return NextResponse.json({ ok: true, data: { accepted } });
  } catch (error) {
    return handleAuthError(error);
  }
}
