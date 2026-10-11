import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { applyEvidence } from "@/lib/evidence/apply";
import { trackMisconception } from "@/lib/teacher/misconceptions";
import { ApiError, parseJson } from "@/lib/api/errors";
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
    const { questionIndex, selectedOptionIndex } = await parseJson(req, answerSchema);

    const sessionRef = adminDb().collection("quizSessions").doc(sessionId);

    // Atomically claim and lock the question answer in a transaction to prevent race conditions
    const claim = await adminDb().runTransaction(async (t) => {
      const sessionDoc = await t.get(sessionRef);

      if (!sessionDoc.exists) {
        throw new ApiError(404, "NOT_FOUND", "Quiz session not found");
      }

      const sessionData = sessionDoc.data()!;

      if (sessionData.uid !== caller.uid) {
        throw new ApiError(403, "FORBIDDEN", "Unauthorized quiz session");
      }

      const questions = sessionData.questions;
      if (!Array.isArray(questions) || !questions[questionIndex]) {
        throw new ApiError(400, "INVALID_QUESTION", "Invalid question index");
      }

      const targetQuestion = questions[questionIndex];
      const existingAnswer = sessionData.answered?.[questionIndex];

      if (existingAnswer) {
        return {
          alreadyAnswered: true as const,
          correct: existingAnswer.isCorrect as boolean,
          correctIndex: targetQuestion.correctIndex as number,
          explanation: targetQuestion.explanation as string,
        };
      }

      const isCorrect = selectedOptionIndex === targetQuestion.correctIndex;

      // Lock answer in transaction
      t.update(sessionRef, {
        [`answered.${questionIndex}`]: {
          selectedOptionIndex,
          isCorrect,
          answeredAt: Timestamp.now(),
        },
      });

      return {
        alreadyAnswered: false as const,
        sessionData,
        targetQuestion,
        isCorrect,
      };
    });

    if (claim.alreadyAnswered) {
      return NextResponse.json({
        ok: true,
        data: {
          alreadyAnswered: true,
          correct: claim.correct,
          correctIndex: claim.correctIndex,
          explanation: claim.explanation,
        },
      });
    }

    const { sessionData, targetQuestion, isCorrect } = claim;

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

    // Misconception detection & resolution tracking
    const misconceptionLabel = targetQuestion.distractorMisconceptions?.[selectedOptionIndex];
    if (!isCorrect && misconceptionLabel) {
      await trackMisconception({
        uid: caller.uid,
        classId: sessionData.classId,
        kcId: sessionData.kcId,
        label: misconceptionLabel,
        description: targetQuestion.explanation,
        isCorrect: false,
      }).catch((err) => console.warn("Failed to record misconception:", err));
    } else if (isCorrect) {
      // Advance resolution for any existing diagnosed misconception for this KC
      await trackMisconception({
        uid: caller.uid,
        classId: sessionData.classId,
        kcId: sessionData.kcId,
        label: "general_kc_accuracy",
        isCorrect: true,
      }).catch(() => {});
    }

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
