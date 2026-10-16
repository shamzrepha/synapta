import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb } from "@/lib/firebase/admin";
import { ApiError } from "@/lib/api/errors";
import { assertPublished } from "@/lib/classes/published";
import { quizBankForStudents } from "@/lib/classes/live";
import { ensureQuizBank, pickForLearner, reshuffleOptions } from "@/lib/practice/bank";
import { getSeen, setSeen } from "@/lib/practice/history";
import { z } from "zod";

export const runtime = "nodejs";
// Only the very first request for a topic generates the bank (3 parallel AI batches)
export const maxDuration = 120;

const quizInputSchema = z.object({
  classId: z.string().min(1),
  kcId: z.string().min(1),
  count: z.number().int().min(3).max(20).default(10),
  focus: z.enum(["mixed", "conceptual", "calculation", "application"]).default("mixed"),
});

/**
 * Builds a learner's quiz from the topic's stored question bank (60+ verified questions,
 * generated once). Learners see unseen questions first; no AI call per quiz.
 */
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
    const access = await assertClassAccess(caller, classId, "view");

    // Teachers prepare the bank; students are served from what is published and never trigger generation
    let bank;
    if (access.canMutate) bank = await ensureQuizBank({ classId, kcId, userId: caller.uid });
    else {
      const kcSnap = await adminDb().collection("classes").doc(classId).collection("kcs").doc(kcId).get();
      assertPublished(false, kcSnap.data(), "practice");
      bank = await quizBankForStudents(classId, kcId, kcSnap.data() || {});
      if (!bank.length) throw new ApiError(404, "NOT_READY", "Your teacher hasn't prepared the quiz yet.");
    }
    const seen = await getSeen(caller.uid, kcId, "quiz");
    const { picked, seen: nextSeen } = pickForLearner(bank, seen, count, Math.random, focus === "mixed" ? undefined : (q) => q.focus === focus);
    await setSeen(caller.uid, kcId, "quiz", nextSeen);

    const questions = picked.map((q) => reshuffleOptions(q));
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

    return NextResponse.json({
      ok: true,
      data: {
        sessionId: sessionRef.id,
        questions: questions.map((q, idx) => ({ id: idx, question: q.question, options: q.options, difficulty: q.difficulty })),
        bankSize: bank.length,
        freshCount: Math.max(0, bank.length - seen.length),
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
