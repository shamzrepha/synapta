import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { cleanSelection, researchProject, selectionSchema } from "@/lib/studio/ai-build";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 90;

/** Optional step 2: web research on how to build it, with the pages it read. */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "studio_research", limit: 6, windowMs: 60_000 });
    if (limited) return limited;
    const body = await parseJson(req, z.object({ prompt: z.string().trim().min(4).max(1500), parts: selectionSchema }));
    const research = await researchProject({ prompt: body.prompt, parts: cleanSelection(body.parts), userId: caller.uid });
    return NextResponse.json({ ok: true, data: { research } });
  } catch (error) {
    return handleAuthError(error);
  }
}
