import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError } from "@/lib/api/errors";
import { dayIdFor } from "@/lib/game/quests";
import { readActivityDays } from "@/lib/activity/server";
import { summarize } from "@/lib/activity/heatmap";

export const runtime = "nodejs";

/** Own activity only: `?uid=` must match the signed-in user. */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const uid = req.nextUrl.searchParams.get("uid");
    if (uid && uid !== caller.uid) throw new ApiError(403, "FORBIDDEN", "You can only view your own activity.");
    const { counts } = await readActivityDays(caller.uid);
    const today = dayIdFor();
    return NextResponse.json({ ok: true, data: { today, counts, summary: summarize(counts, today) } });
  } catch (error) {
    return handleAuthError(error);
  }
}
