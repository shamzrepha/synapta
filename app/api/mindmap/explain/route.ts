import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { checkRateLimitAndQuota } from "@/lib/quota/guard";
import { generateWithFallback } from "@/lib/ai/router";
import { wrapUserInput } from "@/lib/study/topic-source";
import { EXPLAIN_LEVELS, levelInstruction } from "@/lib/study/explain-level";
import { MINDMAP_EXPLAIN_SYSTEM } from "@/lib/mindmap/prompts";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  /** titles from the root down to the tapped node */
  path: z.array(z.string().trim().min(1).max(80)).min(1).max(8),
  level: z.enum(EXPLAIN_LEVELS).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "mindmap-explain", limit: 20, windowMs: 60_000 });
    if (limited) return limited;
    const { path, level } = await parseJson(req, schema);
    await checkRateLimitAndQuota(caller.uid, 1200);
    const result = await generateWithFallback({
      task: "explain_selection",
      systemInstruction: MINDMAP_EXPLAIN_SYSTEM + levelInstruction(level),
      userPrompt: `Mind map path (root > ... > tapped node):\n${wrapUserInput(path.join(" > "))}\nExplain the LAST item.`,
      temperature: 0.4,
      userId: caller.uid,
    });
    const text = (result.text || "").trim();
    if (!text) throw new ApiError(502, "AI_GENERATION_FAILED", "No explanation came back. Please try again.");
    return NextResponse.json({ ok: true, data: { text } });
  } catch (error) {
    return handleAuthError(error);
  }
}
