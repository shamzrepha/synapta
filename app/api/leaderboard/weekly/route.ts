import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { getWeeklyBoard } from "@/lib/weekly/server";
import { weekEndsAt } from "@/lib/game/leagues";

export const runtime = "nodejs";

/** Weekly XP board (resets every ISO week) with my rank and last week's winners. */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const board = await getWeeklyBoard(caller.uid);
    return NextResponse.json({ ok: true, data: { ...board, endsAt: weekEndsAt().toISOString(), channel: `leaderboard:week:${board.weekId}` } });
  } catch (error) {
    return handleAuthError(error);
  }
}
