import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { planProject } from "@/lib/studio/ai-build";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 90;

/** Step 1 of building: the AI turns an idea into a bill of materials chosen from the shop. */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "studio_plan", limit: 10, windowMs: 60_000 });
    if (limited) return limited;
    const body = await parseJson(req, z.object({ prompt: z.string().trim().min(4).max(1500), level: z.string().max(20).optional() }));
    const plan = await planProject({ prompt: body.prompt, level: body.level, userId: caller.uid });
    return NextResponse.json({ ok: true, data: { plan } });
  } catch (error) {
    return handleAuthError(error);
  }
}
