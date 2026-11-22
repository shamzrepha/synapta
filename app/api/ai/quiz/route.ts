import { NextRequest, NextResponse } from "next/server";
import { classSourceLanguage, localizeFor } from "@/lib/i18n/serve";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb } from "@/lib/firebase/admin";
import { ApiError } from "@/lib/api/errors";
import { liveMode, quizBankForStudents } from "@/lib/classes/live";
import { classOwner, ensureQuizBank, pickForLearner, readQuizBank, reshuffleOptions } from "@/lib/practice/bank";
import { getSeen, setSeen } from "@/lib/practice/history";
import { loadLearnerDna, pickAdaptiveQuizFocus } from "@/lib/adaptive/learner-dna";
import { checkRateLimit } from "@/lib/rateLimit";
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
    // each quiz writes a session document, and the first one for a topic builds its question bank with the AI
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "ai_quiz", limit: 20, windowMs: 60_000, shared: true });
    if (limited) return limited;
    const body = await req.json().catch(() => ({}));
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
      const kcData = kcSnap.data() || {};
      // "Take offline" (and a topic still in draft) hides practice from students
      if (liveMode(kcData, "practice") === "off") throw new ApiError(403, "NOT_PUBLISHED", "Practice for this topic isn't published yet.");
      bank = await quizBankForStudents(classId, kcId, kcData);
      if (!bank.length && liveMode(kcData, "practice") === "follow") bank = await readQuizBank(classId, kcId);
      if (!bank.length && liveMode(kcData, "practice") === "follow") bank = await ensureQuizBank({ classId, kcId, userId: classOwner(access.classData, caller.uid) });
      if (!bank.length) throw new ApiError(404, "NOT_READY", "This topic's questions aren't ready yet. Try again in a minute.");
    }
    const seen = await getSeen(caller.uid, kcId, "quiz");
    const dna = focus === "mixed" ? await loadLearnerDna(caller.uid).catch(() => null) : null;
    const adaptiveFocus = dna ? pickAdaptiveQuizFocus(dna) : null;
    const activeFilter =
      focus !== "mixed"
        ? (q: { focus: string }) => q.focus === focus
        : adaptiveFocus
        ? (q: { focus: string }) => q.focus === adaptiveFocus
        : undefined;
    const { picked, seen: nextSeen } = pickForLearner(bank, seen, count, Math.random, activeFilter);
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
        questions: await localizeFor(req, caller, access.canMutate, questions.map((q, idx) => ({ id: idx, question: q.question, options: q.options, difficulty: q.difficulty, correctIndex: q.correctIndex, explanation: q.explanation })), await classSourceLanguage(access.classData)),
        bankSize: bank.length,
        freshCount: Math.max(0, bank.length - seen.length),
        adaptiveFocus: adaptiveFocus || focus,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
