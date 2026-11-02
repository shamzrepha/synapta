import { NextRequest, NextResponse } from "next/server";
import { classSourceLanguage, localizeFor } from "@/lib/i18n/serve";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb } from "@/lib/firebase/admin";
import { ApiError } from "@/lib/api/errors";
import { quizBankForStudents } from "@/lib/classes/live";
import { classOwner, ensureQuizBank, pickForLearner, readQuizBank, reshuffleOptions } from "@/lib/practice/bank";
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

    // Self-test quizzes are open to every member without waiting for the teacher to publish (graded work goes
    // through assignments): the teacher's published bank when there is one, else the topic's bank, prepared once
    // (on the class's account) if missing.
    let bank;
    if (access.canMutate) bank = await ensureQuizBank({ classId, kcId, userId: caller.uid });
    else {
      const kcSnap = await adminDb().collection("classes").doc(classId).collection("kcs").doc(kcId).get();
      bank = await quizBankForStudents(classId, kcId, kcSnap.data() || {});
      if (!bank.length) bank = await readQuizBank(classId, kcId);
      if (!bank.length) bank = await ensureQuizBank({ classId, kcId, userId: classOwner(access.classData, caller.uid) });
      if (!bank.length) throw new ApiError(404, "NOT_READY", "This topic's questions aren't ready yet. Try again in a minute.");
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
        questions: await localizeFor(req, caller, access.canMutate, questions.map((q, idx) => ({ id: idx, question: q.question, options: q.options, difficulty: q.difficulty })), await classSourceLanguage(access.classData)),
        bankSize: bank.length,
        freshCount: Math.max(0, bank.length - seen.length),
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
