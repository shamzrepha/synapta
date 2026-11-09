import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { checkRateLimit } from "@/lib/rateLimit";
import { getAiConfig } from "@/lib/ai/structured/config";
import { AiChainExhaustedError, AiRouteMissingError } from "@/lib/ai/structured/types";
import { runExtractConformance } from "@/lib/worlds/conformance";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Model Conformance Test (spec 19.4): runs a known note through the "key facts" job and scores the result. */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireUser(req, ["admin"]);
    const limited = await checkRateLimit(req, { uid: admin.uid, keyPrefix: "worlds-conformance", limit: 5, windowMs: 300_000 });
    if (limited) return limited;
    try {
      return NextResponse.json({ ok: true, data: { report: await runExtractConformance(await getAiConfig(true)) } });
    } catch (e) {
      if (e instanceof AiRouteMissingError || e instanceof AiChainExhaustedError) return NextResponse.json({ ok: true, data: { error: e.message } });
      throw e;
    }
  } catch (error) {
    return handleAuthError(error);
  }
}
