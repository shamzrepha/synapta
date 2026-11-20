import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { loadKcGroundingContext } from "@/lib/kc/context";
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
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "studio_ideas", limit: 8, windowMs: 60_000, shared: true });
    if (limited) return limited;
    const body = await parseJson(
      req,
      z.object({
        topic: z.string().trim().min(2).max(120),
        description: z.string().max(600).optional(),
        level: z.string().max(20).optional(),
        classId: z.string().min(1).max(120).optional(),
        kcId: z.string().min(1).max(120).optional(),
      })
    );
    let ctx: Awaited<ReturnType<typeof loadKcGroundingContext>> | null = null;
    if (body.classId) {
      await assertClassAccess(caller, body.classId, "view");
      if (body.kcId) ctx = await loadKcGroundingContext(body.classId, body.kcId, { materialBudget: 3500 });
    }
    const ideas = await suggestLabIdeas({
      topic: ctx?.kcTitle || body.topic,
      description: body.description || ctx?.description,
      level: body.level || ctx?.level,
      objectives: ctx?.objectives,
      lessonExcerpt: ctx?.lessonMarkdown,
      otherTopics: ctx?.otherTopics,
      userId: caller.uid,
    });
    return NextResponse.json({ ok: true, data: { ideas } });
  } catch (error) {
    return handleAuthError(error);
  }
}
