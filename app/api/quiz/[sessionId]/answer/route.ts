import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { applyEvidence } from "@/lib/evidence/apply";
import { z } from "zod";

export const runtime = "nodejs";

const answerSchema = z.object({
  questionIndex: z.number().int().min(0),
  selectedOptionIndex: z.number().int().min(0),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const caller = await requireUser(req);
    const body = await req.json();
    const parsed = answerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "VALIDATION",
            message: parsed.error.issues[0]?.message || "Invalid answer payload",
          },
        },
        { status: 400 }
      );
    }

    const { questionIndex, selectedOptionIndex } = parsed.data;

    const sessionRef = adminDb().collection("quizSessions").doc(sessionId);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Quiz session not found" } },
        { status: 404 }
      );
    }

    const sessionData = sessionDoc.data()!;

    if (sessionData.uid !== caller.uid) {
      return NextResponse.json(
        { ok: false, error: { code: "FORBIDDEN", message: "Unauthorized quiz session" } },
        { status: 403 }
      );
    }

    const questions = sessionData.questions;
    if (!Array.isArray(questions) || !questions[questionIndex]) {
      return NextResponse.json(
        { ok: false, error: { code: "INVALID_QUESTION", message: "Invalid question index" } },
        { status: 400 }
      );
    }

    const targetQuestion = questions[questionIndex];
    const isCorrect = selectedOptionIndex === targetQuestion.correctIndex;

    // Check if this question was already answered to avoid double-scoring
    const existingAnswer = sessionData.answered?.[questionIndex];
    if (existingAnswer) {
      return NextResponse.json({
        ok: true,
        data: {
          alreadyAnswered: true,
          correct: existingAnswer.isCorrect,
          correctIndex: targetQuestion.correctIndex,
          explanation: targetQuestion.explanation,
        },
      });
    }

    // Atomically apply cognitive evidence and XP
    const evidenceResult = await applyEvidence({
      uid: caller.uid,
      classId: sessionData.classId,
      kcId: sessionData.kcId,
      activity: "quiz",
      correct: isCorrect,
      metadata: {
        sessionId,
        questionIndex,
        selectedOptionIndex,
      },
    });

    // Mark as answered in session doc
    await sessionRef.update({
      [`answered.${questionIndex}`]: {
        selectedOptionIndex,
        isCorrect,
        answeredAt: Timestamp.now(),
      },
    });

    return NextResponse.json({
      ok: true,
      data: {
        correct: isCorrect,
        correctIndex: targetQuestion.correctIndex,
        explanation: targetQuestion.explanation,
        ...evidenceResult,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
