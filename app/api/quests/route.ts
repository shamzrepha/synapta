import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { getSeasonViews } from "@/lib/quests/server";
import { getDailyQuests } from "@/lib/game/progress";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const [seasons, daily] = await Promise.all([getSeasonViews(caller.uid), getDailyQuests(caller.uid).catch(() => [])]);
    return NextResponse.json({ ok: true, data: { seasons, daily } });
  } catch (error) {
    return handleAuthError(error);
  }
}
