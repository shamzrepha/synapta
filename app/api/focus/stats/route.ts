import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { loadUserSessions, focusStats } from "@/lib/focus/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const rows = await loadUserSessions(caller.uid);
    return NextResponse.json({
      ok: true,
      data: { ...focusStats(rows), recent: rows.slice(0, 20).map((r) => ({ code: r.code, minutes: r.minutes, doing: r.doing, completedAtMs: r.completedAtMs })) },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
