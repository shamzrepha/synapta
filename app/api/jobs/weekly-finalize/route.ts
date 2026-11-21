import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/security/cron";
import { finalizeRecentWeeks } from "@/lib/weekly/server";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Weekly cron, Monday 00:05 Africa/Lagos (Sunday 23:05 UTC): freezes the finished week's top 10 into
 * weeklyWinners/{weekId} and notifies the top 3. Idempotent: weeks already finalised are returned untouched, and it also
 * back-fills up to 3 earlier weeks if a run was missed. The leaderboard does the same lazily when read.
 * Requires `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Invalid cron secret" } }, { status: 401 });
  }
  const results = await finalizeRecentWeeks();
  return NextResponse.json({
    ok: true,
    data: { weeks: results.map((r) => ({ weekId: r.weekId, created: r.created, winners: r.winners.length })) },
  });
}
