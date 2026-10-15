import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb } from "@/lib/firebase/admin";
import { executeStructuredAiTask, AiGenerationError } from "@/lib/ai/router";
import { loadKcGroundingContext } from "@/lib/kc/context";
import { buildQuizPrompt, normalizeQuizQuestions, rawQuizResponseSchema } from "@/lib/quiz/normalize";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const quizInputSchema = z.object({
  classId: z.string().min(1),
  kcId: z.string().min(1),
  count: z.number().int().min(3).max(20).default(10),
  focus: z.enum(["mixed", "conceptual", "calculation", "application"]).default("mixed"),
});

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const body = await req.json();
    const parsed = quizInputSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: parsed.error.issues[0]?.message || "Invalid input" } },
        { status: 400 }
      );
    }

    const { classId, kcId, count, focus } = parsed.data;

    await assertClassAccess(caller, classId, "view");

    const ctx = await loadKcGroundingContext(classId, kcId);

    // Ask for a small buffer: questions that fail answer verification are dropped, not shown.
    const requested = Math.min(20, count + Math.max(2, Math.ceil(count * 0.25)));
    const { systemInstruction, userPrompt } = buildQuizPrompt({
      kcTitle: ctx.kcTitle,
      contextText: ctx.contextText,
      count: requested,
      level: ctx.level,
      focus,
    });

    const result = await executeStructuredAiTask({
      task: "structured_spec",
      systemInstruction,
      userPrompt,
      schema: rawQuizResponseSchema,
      userId: caller.uid,
      estimatedTokens: 400 * requested,
    });

    const questions = normalizeQuizQuestions(result.data.questions, { maxQuestions: count });
    if (questions.length < 3) {
      throw new AiGenerationError("The AI's quiz didn't pass our answer checks. Please try generating again.");
    }

    // Server-side session holds the answers; the client only ever sees questions + options.
    const sessionRef = adminDb().collection("quizSessions").doc();
    await sessionRef.set({
      sessionId: sessionRef.id,
      uid: caller.uid,
      classId,
      kcId,
      questions,
      answered: {},
      createdAt: new Date(),
    });

    const clientQuestions = questions.map((q, idx) => ({
      id: idx,
      question: q.question,
      options: q.options,
      difficulty: q.difficulty,
    }));

    return NextResponse.json({
      ok: true,
      data: {
        sessionId: sessionRef.id,
        questions: clientQuestions,
        tokensUsed: result.tokensIn + result.tokensOut,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
