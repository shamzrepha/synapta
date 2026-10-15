import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { checkRateLimit } from "@/lib/rateLimit";
import { buildReportNumbers, getStoredNarrative, saveNarrative, writeNarrative } from "@/lib/report/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const numbers = await buildReportNumbers(caller.uid);
    const narrative = await getStoredNarrative(caller.uid, numbers.to);
    return NextResponse.json({ ok: true, data: { numbers, narrative } });
  } catch (error) {
    return handleAuthError(error);
  }
}

/** (Re)writes the AI summary from freshly computed numbers. */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "report-ai", limit: 5, windowMs: 60 * 60_000 });
    if (limited) return limited;
    const numbers = await buildReportNumbers(caller.uid);
    const narrative = await writeNarrative(caller.uid, numbers);
    await saveNarrative(caller.uid, numbers.to, narrative);
    return NextResponse.json({ ok: true, data: { numbers, narrative } });
  } catch (error) {
    return handleAuthError(error);
  }
}
