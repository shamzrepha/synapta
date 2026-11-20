import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { checkFeature, recordFeature } from "@/lib/billing/usage";
import { markBodySchema } from "@/lib/practice/theory/schemas";
import { getQuestionSet, markAnswer, resolveSource } from "@/lib/practice/theory/service";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Marks one typed answer against the question's marking guide. Marking is per learner and uses the cheap model class. */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "theory_mark", limit: 15, windowMs: 60_000, shared: true });
    if (limited) return limited;
    const body = await parseJson(req, markBodySchema);
    const difficulty = body.difficulty ?? "medium";
    const src = await resolveSource(caller, body);
    const { questions } = await getQuestionSet(caller, src, difficulty);
    const question = questions.find((q) => q.id === body.questionId);
    if (!question) throw new ApiError(409, "SET_CHANGED", "These questions were refreshed. Start a new set.");
    const out = await markAnswer({
      caller,
      src: { classId: body.classId, kcId: body.kcId, noteId: body.noteId },
      question,
      answer: body.answer,
      difficulty,
      strictness: body.strictness ?? "balanced",
      beforeAi: () => checkFeature(caller.uid, "practice"),
      afterAi: () => recordFeature(caller.uid, "practice"),
    });
    return NextResponse.json({ ok: true, data: out });
  } catch (error) {
    return handleAuthError(error);
  }
}
