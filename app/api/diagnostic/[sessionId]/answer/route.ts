import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { updateMastery, DEFAULT_BKT_PARAMS } from "@/lib/bkt/engine";
import { applyEvidenceIfEnrolled } from "@/lib/evidence/apply";
import { trackMisconception } from "@/lib/teacher/misconceptions";
import {
  propagateDiagnosticAnswer,
  selectNextAdaptiveKc,
  computeDiagnosticSummary,
  KcGraphNode,
} from "@/lib/bkt/propagate";
import { z } from "zod";

export const runtime = "nodejs";

const answerSchema = z.object({
  selectedOptionIndex: z.number().int().min(0).max(3),
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
        { ok: false, error: { code: "VALIDATION", message: parsed.error.issues[0]?.message || "Invalid payload" } },
        { status: 400 }
      );
    }

    const { selectedOptionIndex } = parsed.data;

    const sessionRef = adminDb().collection("diagnosticSessions").doc(sessionId);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "Diagnostic session not found" } },
        { status: 404 }
      );
    }

    const sessionData = sessionDoc.data()!;
    if (sessionData.uid !== caller.uid) {
      return NextResponse.json(
        { ok: false, error: { code: "FORBIDDEN", message: "Unauthorized diagnostic session" } },
        { status: 403 }
      );
    }

    if (sessionData.finished) {
      return NextResponse.json(
        { ok: false, error: { code: "SESSION_FINISHED", message: "This diagnostic session is already completed." } },
        { status: 400 }
      );
    }

    const questions = sessionData.questions || [];
    const activeIndex = sessionData.activeQuestionIndex ?? 0;
    const activeQuestion = questions[activeIndex];

    if (!activeQuestion) {
      return NextResponse.json(
        { ok: false, error: { code: "INVALID_STATE", message: "No active question found in session" } },
        { status: 400 }
      );
    }

    const isCorrect = selectedOptionIndex === activeQuestion.correctIndex;
    const kcId = activeQuestion.kcId;

    // 1. Calculate direct BKT update for target KC
    const currentPLMap: Record<string, number> = { ...(sessionData.currentPLMap || {}) };
    const prevPL = currentPLMap[kcId] ?? 0.20;
    const directUpdatedPL = updateMastery(prevPL, isCorrect, DEFAULT_BKT_PARAMS, "quiz");
    currentPLMap[kcId] = Number(directUpdatedPL.toFixed(4));

    // 2. Propagate Bayesian priors across graph
    const kcs: KcGraphNode[] = sessionData.kcs || [];
    const propagatedPLMap = propagateDiagnosticAnswer({
      currentPLMap,
      answeredKcId: kcId,
      isCorrect,
      kcs,
    });

    // 3. Atomically record diagnostic evidence (diagnostic: true gives 0 XP). Someone who isn't an active member
    // (a teacher trying it out) gets the questions but no stored mastery, so the graph update below is skipped too.
    const credited = await applyEvidenceIfEnrolled({
      uid: caller.uid,
      classId: sessionData.classId,
      kcId,
      activity: "quiz",
      correct: isCorrect,
      metadata: {
        diagnostic: true,
        sessionId,
        selectedOptionIndex,
      },
    });

    // 4. Update propagated priors in mastery collection for affected KCs (members only, as above)
    const batch = adminDb().batch();
    for (const [kId, pLVal] of credited ? Object.entries(propagatedPLMap) : []) {
      if (kId !== kcId) {
        const mRef = adminDb().collection("mastery").doc(`${caller.uid}_${kId}`);
        batch.set(
          mRef,
          {
            uid: caller.uid,
            classId: sessionData.classId,
            kcId: kId,
            pL: pLVal,
            lastPracticedAt: Timestamp.now(),
            lastUpdated: Timestamp.now(),
          },
          { merge: true }
        );
      }
    }
    await batch.commit().catch((err) => console.warn("Failed to batch update propagated priors:", err));

    // 5. Track or resolve misconceptions
    const misconceptionLabel = activeQuestion.distractorMisconceptions?.[selectedOptionIndex];
    if (!isCorrect && misconceptionLabel) {
      await trackMisconception({
        uid: caller.uid,
        classId: sessionData.classId,
        kcId,
        label: misconceptionLabel,
        description: activeQuestion.explanation,
        isCorrect: false,
      }).catch((err) => console.warn("Diagnostic misconception track error:", err));
    } else if (isCorrect) {
      await trackMisconception({
        uid: caller.uid,
        classId: sessionData.classId,
        kcId,
        label: "general_kc_accuracy",
        isCorrect: true,
      }).catch(() => {});
    }

    // 6. Update answered record
    const answered = { ...(sessionData.answered || {}) };
    answered[activeIndex] = {
      selectedOptionIndex,
      isCorrect,
      answeredAt: new Date().toISOString(),
    };

    const answeredKcIds: string[] = Array.from(new Set([...(sessionData.answeredKcIds || []), kcId]));
    const totalAnsweredCount = Object.keys(answered).length;

    // 7. Adaptive next question selection or finish condition
    // Finish after 10 questions or when all KCs are answered
    const nextKcId = selectNextAdaptiveKc({
      kcs,
      answeredKcIds,
      currentPLMap: propagatedPLMap,
    });

    const shouldFinish = totalAnsweredCount >= Math.min(10, questions.length) || !nextKcId;

    if (shouldFinish) {
      // Diagnostic complete: compute summary and store in learnerProfiles
      const summary = computeDiagnosticSummary({
        kcs,
        finalPLMap: propagatedPLMap,
      });

      // Upsert learnerProfile
      const profileRef = adminDb().collection("learnerProfiles").doc(caller.uid);
      await profileRef.set(
        {
          uid: caller.uid,
          diagnosticResults: {
            [sessionData.classId]: {
              completedAt: Timestamp.now(),
              averageStartingPL: summary.averageStartingPL,
              strongCount: summary.strongKcs.length,
              weakCount: summary.weakKcs.length,
              suggestedFirstKc: summary.suggestedFirstKc,
            },
          },
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );

      await sessionRef.update({
        answered,
        answeredKcIds,
        currentPLMap: propagatedPLMap,
        finished: true,
        summary,
        updatedAt: Timestamp.now(),
      });

      return NextResponse.json({
        ok: true,
        data: {
          finished: true,
          correct: isCorrect,
          correctIndex: activeQuestion.correctIndex,
          explanation: activeQuestion.explanation,
          summary,
          finalPLMap: propagatedPLMap,
        },
      });
    }

    // Next question: find first unasked question mapped to nextKcId
    let nextQuestionIndex = questions.findIndex(
      (q: { kcId: string }, idx: number) => q.kcId === nextKcId && !answered[idx]
    );

    if (nextQuestionIndex < 0) {
      // Fallback: pick any remaining unanswered question
      nextQuestionIndex = questions.findIndex((_: unknown, idx: number) => !answered[idx]);
    }

    const nextQ = questions[nextQuestionIndex];

    await sessionRef.update({
      answered,
      answeredKcIds,
      currentPLMap: propagatedPLMap,
      activeQuestionIndex: nextQuestionIndex,
      updatedAt: Timestamp.now(),
    });

    return NextResponse.json({
      ok: true,
      data: {
        finished: false,
        correct: isCorrect,
        correctIndex: activeQuestion.correctIndex,
        explanation: activeQuestion.explanation,
        nextQuestion: {
          id: nextQuestionIndex,
          kcId: nextQ.kcId,
          kcTitle: nextQ.kcTitle,
          question: nextQ.question,
          options: nextQ.options,
          difficulty: nextQ.difficulty,
        },
        currentPLMap: propagatedPLMap,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
