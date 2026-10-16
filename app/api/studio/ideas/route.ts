import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { suggestLabIdeas } from "@/lib/studio/ai-build";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

/** AI build ideas for a class topic, for teachers choosing which labs to add (students never spend AI here). */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req, ["teacher", "admin"]);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "studio_ideas", limit: 8, windowMs: 60_000 });
    if (limited) return limited;
    const body = await parseJson(req, z.object({ topic: z.string().trim().min(2).max(120), description: z.string().max(600).optional(), level: z.string().max(20).optional() }));
    const ideas = await suggestLabIdeas({ ...body, userId: caller.uid });
    return NextResponse.json({ ok: true, data: { ideas } });
  } catch (error) {
    return handleAuthError(error);
  }
}
