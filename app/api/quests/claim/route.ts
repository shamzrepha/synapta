import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { claimSeason, getSeasonViews } from "@/lib/quests/server";

export const runtime = "nodejs";

const Body = z.object({ seasonId: z.string().min(1).max(80) });

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "season-claim", limit: 20, windowMs: 60_000 });
    if (limited) return limited;
    const { seasonId } = await parseJson(req, Body);
    const result = await claimSeason(caller.uid, seasonId);
    return NextResponse.json({ ok: true, data: { ...result, seasons: await getSeasonViews(caller.uid) } });
  } catch (error) {
    return handleAuthError(error);
  }
}
