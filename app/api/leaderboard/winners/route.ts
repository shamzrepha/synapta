import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { checkRateLimit } from "@/lib/rateLimit";
import { getPastWinners } from "@/lib/weekly/server";

export const runtime = "nodejs";

/** Hall of fame: the top 10 (by XP gained that week) of each of the last 12 finished weeks. */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "leaderboard-winners", limit: 30, windowMs: 60_000, shared: true });
    if (limited) return limited;
    const weeks = await getPastWinners(caller.uid);
    return NextResponse.json({ ok: true, data: { weeks } });
  } catch (error) {
    return handleAuthError(error);
  }
}
