import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { checkRateLimitAndQuota } from "@/lib/quota/guard";
import { adminDb } from "@/lib/firebase/admin";
import { generateWithFallback } from "@/lib/ai/router";
import { resolveTopicSource, topicSourceShape, wrapUserInput } from "@/lib/study/topic-source";
import { aiPaperSchema, sanitizePaper, publicQuestions, totalMarks, MAX_QUESTIONS, MIN_QUESTIONS } from "@/lib/papers/logic";
import { paperGenSystem } from "@/lib/papers/prompts";

export const runtime = "nodejs";
export const maxDuration = 60;

const COLLECTION = "paperAttempts";

const createSchema = z.object({
  ...topicSourceShape,
  count: z.number().int().min(MIN_QUESTIONS).max(MAX_QUESTIONS).optional(),
  minutes: z.number().int().min(5).max(180).optional(),
});

/** Generates a paper and starts the attempt clock. Answers stay on the server. */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "papers-create", limit: 5, windowMs: 60_000 });
    if (limited) return limited;
    const body = await parseJson(req, createSchema);
    if (!(body.classId && body.kcId) && !(body.text && body.text.length >= 3)) {
      throw new ApiError(400, "VALIDATION", "Pick a class topic or type a topic");
    }
    const count = body.count ?? 8;
    const minutes = body.minutes ?? 30;
    const source = await resolveTopicSource(caller, body);

    await checkRateLimitAndQuota(caller.uid, 3000);
    const result = await generateWithFallback({
      task: "quiz_gen",
      systemInstruction: paperGenSystem(count, minutes),
      userPrompt: `Topic and notes:\n${wrapUserInput(source.text)}`,
      schema: aiPaperSchema,
      temperature: 0.6,
      userId: caller.uid,
    });
    const questions = result.data ? sanitizePaper(result.data, count) : [];
    if (questions.length < 2) throw new ApiError(502, "AI_GENERATION_FAILED", "The AI couldn't write a usable paper. Please try again.");

    const now = new Date().toISOString();
    const title = (result.data?.title || "").trim().slice(0, 80) || `${source.title} paper`;
    const ref = await adminDb().collection(COLLECTION).add({
      uid: caller.uid,
      title,
      topic: source.title,
      minutes: minutes,
      questions,
      createdAt: now,
      startedAt: now,
      submittedAt: null,
    });
    return NextResponse.json({
      ok: true,
      data: { id: ref.id, title, minutes: minutes, startedAt: now, total: totalMarks(questions), questions: publicQuestions(questions) },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

/** Attempt history (submitted attempts) with their topic scores. */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const snap = await adminDb().collection(COLLECTION).where("uid", "==", caller.uid).limit(200).get();
    const items = snap.docs
      .map((d) => {
        const x = d.data();
        return {
          id: d.id,
          title: String(x.title || "Paper"),
          topic: String(x.topic || ""),
          minutes: Number(x.minutes) || 0,
          createdAt: String(x.createdAt || ""),
          submittedAt: x.submittedAt ? String(x.submittedAt) : null,
          score: x.result?.score ?? null,
          total: x.result?.total ?? null,
          topics: Array.isArray(x.result?.topics) ? x.result.topics : [],
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 60);
    return NextResponse.json({ ok: true, data: items });
  } catch (error) {
    return handleAuthError(error);
  }
}
