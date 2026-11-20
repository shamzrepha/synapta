import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { checkFeature, recordFeature } from "@/lib/billing/usage";
import { generateBodySchema } from "@/lib/practice/theory/schemas";
import { getQuestionSet, resolveSource, toPublic } from "@/lib/practice/theory/service";

export const runtime = "nodejs";
export const maxDuration = 90;

/**
 * Written practice: the topic's theory questions for a difficulty. The set is shared (made once from the topic's notes
 * and cached), and the marking guide never leaves the server. Only a learner's own notes count against their plan,
 * because that AI work is theirs alone.
 */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "theory_generate", limit: 12, windowMs: 60_000, shared: true });
    if (limited) return limited;
    const body = await parseJson(req, generateBodySchema);
    const src = await resolveSource(caller, body);
    if (src.isNote) await checkFeature(caller.uid, "practice");
    const { questions, cached } = await getQuestionSet(caller, src, (body.difficulty ?? "medium"));
    if (src.isNote && !cached) await recordFeature(caller.uid, "practice");
    return NextResponse.json({ ok: true, data: { title: src.title, difficulty: (body.difficulty ?? "medium"), questions: questions.map(toPublic) } });
  } catch (error) {
    return handleAuthError(error);
  }
}
