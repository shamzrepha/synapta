import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { checkRateLimitAndQuota } from "@/lib/quota/guard";
import { generateWithFallback } from "@/lib/ai/router";
import { resolveTopicSource, topicSourceSchema, wrapUserInput } from "@/lib/study/topic-source";
import { clampTree, rawNodeSchema } from "@/lib/mindmap/tree";
import { MINDMAP_SYSTEM } from "@/lib/mindmap/prompts";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Builds a mind-map tree from pasted notes or a class topic. Not saved until the student saves it. */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "mindmap-gen", limit: 6, windowMs: 60_000 });
    if (limited) return limited;
    const body = await parseJson(req, topicSourceSchema);
    const source = await resolveTopicSource(caller, body);

    await checkRateLimitAndQuota(caller.uid, 2500);
    const result = await generateWithFallback({
      task: "notebook_mindmap",
      systemInstruction: MINDMAP_SYSTEM,
      userPrompt: `Material:\n${wrapUserInput(source.text)}`,
      schema: rawNodeSchema,
      temperature: 0.4,
      userId: caller.uid,
    });
    const tree = result.data ? clampTree(result.data) : null;
    if (!tree || tree.children.length === 0) throw new ApiError(502, "AI_GENERATION_FAILED", "The AI couldn't build a mind map from that. Try more detailed notes.");
    return NextResponse.json({ ok: true, data: { tree } });
  } catch (error) {
    return handleAuthError(error);
  }
}
