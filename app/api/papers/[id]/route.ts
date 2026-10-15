import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { checkRateLimitAndQuota } from "@/lib/quota/guard";
import { adminDb } from "@/lib/firebase/admin";
import { generateWithFallback } from "@/lib/ai/router";
import {
  aiMarkingSchema,
  buildResult,
  publicQuestions,
  questionsNeedingAi,
  sanitizeMarks,
  totalMarks,
  type StoredQuestion,
} from "@/lib/papers/logic";
import { PAPER_MARK_SYSTEM } from "@/lib/papers/prompts";

export const runtime = "nodejs";
export const maxDuration = 60;

const COLLECTION = "paperAttempts";

async function loadOwn(uid: string, id: string) {
  const ref = adminDb().collection(COLLECTION).doc(id);
  const doc = await ref.get();
  if (!doc.exists || doc.data()?.uid !== uid) throw new ApiError(404, "NOT_FOUND", "Paper not found");
  return { ref, data: doc.data()! };
}

/** One paper: questions without answers, plus the marked result once submitted. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await requireUser(req);
    const { id } = await params;
    const { data } = await loadOwn(caller.uid, id);
    const questions = (data.questions || []) as StoredQuestion[];
    return NextResponse.json({
      ok: true,
      data: {
        id,
        title: data.title,
        minutes: data.minutes,
        startedAt: data.startedAt,
        submittedAt: data.submittedAt || null,
        total: totalMarks(questions),
        questions: publicQuestions(questions),
        result: data.result || null,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

const submitSchema = z.object({
  answers: z.record(z.string().max(20), z.string().max(3000)),
});

/** Submits and marks the attempt (MCQ instantly, short answers by the AI). Idempotent. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const caller = await requireUser(req);
    const { id } = await params;
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "papers-submit", limit: 10, windowMs: 60_000 });
    if (limited) return limited;
    const answers = (await parseJson(req, submitSchema)).answers ?? {};
    const { ref, data } = await loadOwn(caller.uid, id);
    if (data.result) return NextResponse.json({ ok: true, data: { result: data.result, submittedAt: data.submittedAt } });

    const questions = (data.questions || []) as StoredQuestion[];
    const toMark = questionsNeedingAi(questions, answers);
    let aiMarks: ReturnType<typeof sanitizeMarks> = {};
    if (toMark.length > 0) {
      await checkRateLimitAndQuota(caller.uid, 2500);
      const block = toMark
        .map(
          (q) =>
            `<QUESTION id="${q.id}" max_marks="${q.marks}">\n${q.prompt}\nModel answer: ${q.modelAnswer}\nMark scheme: ${q.markScheme}\n<STUDENT_ANSWER>\n${(answers[q.id] || "").replace(/<\/?STUDENT_ANSWER>/gi, "")}\n</STUDENT_ANSWER>\n</QUESTION>`
        )
        .join("\n\n");
      try {
        const res = await generateWithFallback({
          task: "grading_high_stakes",
          systemInstruction: PAPER_MARK_SYSTEM,
          userPrompt: block,
          schema: aiMarkingSchema,
          temperature: 0.1,
          userId: caller.uid,
        });
        aiMarks = sanitizeMarks(res.data, toMark);
      } catch (e) {
        // Quota problems should be retryable, not silently score zero
        if (e instanceof ApiError) throw e;
        throw new ApiError(502, "AI_GENERATION_FAILED", "Marking failed. Please try submitting again.");
      }
    }
    const result = buildResult(questions, answers, aiMarks);
    const submittedAt = new Date().toISOString();
    await ref.update({ answers, result, submittedAt });
    return NextResponse.json({ ok: true, data: { result, submittedAt } });
  } catch (error) {
    return handleAuthError(error);
  }
}
