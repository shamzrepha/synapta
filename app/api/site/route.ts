import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { getSiteConfig } from "@/lib/config/site";

export const runtime = "nodejs";

/** What every signed-in person may see of the site switches: the notice banner and whether AI is paused. */
export async function GET(req: NextRequest) {
  try {
    await requireUser(req);
    const cfg = await getSiteConfig();
    return NextResponse.json({ ok: true, data: { notice: cfg.notice, aiPaused: cfg.aiPaused } });
  } catch (error) {
    return handleAuthError(error);
  }
}
