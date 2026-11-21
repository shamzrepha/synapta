import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { checkRateLimit } from "@/lib/rateLimit";
import { getWeeklyBoard } from "@/lib/weekly/server";
import { weekEndsAt } from "@/lib/game/leagues";

export const runtime = "nodejs";

/** Weekly board ranked by XP GAINED this week (resets Monday 00:00 WAT), with my rank, the gap to the next person and last week's top 3. */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "leaderboard-weekly", limit: 60, windowMs: 60_000, shared: true });
    if (limited) return limited;
    const board = await getWeeklyBoard(caller.uid);
    return NextResponse.json({ ok: true, data: { ...board, endsAt: weekEndsAt().toISOString(), channel: `leaderboard:week:${board.weekId}` } });
  } catch (error) {
    return handleAuthError(error);
  }
}
