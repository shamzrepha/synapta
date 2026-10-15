import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb } from "@/lib/firebase/admin";
import { ApiError, parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { generateWithFallback } from "@/lib/ai/router";
import {
  AiGradeSchema,
  needsReview,
  normalizeAiGrade,
  sanitizeStudentText,
  totalAwarded,
  maxMarks,
} from "@/lib/grading/scoring";
import { GRADER_SYSTEM, gradePrompt } from "@/lib/grading/prompts";
import type { StoredQuestion } from "@/lib/grading/sets";
import { notify } from "@/lib/notifications/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({ answers: z.record(z.string().max(5000)) });

interface QuestionGrade {
  criteria: { id: string; awarded: number; explanation: string }[];
  total: number;
  max: number;
  confidence: number;
  explanation: string;
  status: "auto" | "review" | "final";
  feedback: string;
}

async function gradeOne(q: StoredQuestion, answer: string, uid: string): Promise<QuestionGrade> {
  const max = maxMarks(q.rubric);
  if (!answer.trim()) {
    return {
      criteria: q.rubric.map((r) => ({ id: r.id, awarded: 0, explanation: "No answer given." })),
      total: 0,
      max,
      confidence: 1,
      explanation: "No answer given.",
      status: "auto",
      feedback: "",
    };
  }
  try {
    const res = await generateWithFallback({
      task: "grading_high_stakes",
      systemInstruction: GRADER_SYSTEM,
      userPrompt: gradePrompt({ question: q.prompt, modelAnswer: q.modelAnswer, rubric: q.rubric, answer }),
      schema: AiGradeSchema,
      temperature: 0,
      userId: uid,
    });
    if (!res.data) throw new Error("no structured output");
    const g = normalizeAiGrade(q.rubric, res.data);
    return {
      criteria: g.criteria,
      total: g.total,
      max: g.max,
      confidence: g.confidence,
      explanation: g.explanation,
      status: needsReview(g.confidence) ? "review" : "auto",
      feedback: "",
    };
  } catch (err) {
    console.warn("[grading] AI grading failed", err instanceof Error ? err.message : err);
    return {
      criteria: q.rubric.map((r) => ({ id: r.id, awarded: 0, explanation: "" })),
      total: 0,
      max,
      confidence: 0,
      explanation: "Waiting for teacher review.",
      status: "review",
      feedback: "",
    };
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "grading-submit", limit: 10, windowMs: 60 * 60 * 1000 });
    if (limited) return limited;
    const { answers } = await parseJson(req, Body);

    const setSnap = await adminDb().collection("gradingSets").doc(id).get();
    if (!setSnap.exists) throw new ApiError(404, "NOT_FOUND", "Question set not found");
    const set = setSnap.data()!;
    const access = await assertClassAccess(caller, set.classId, "view");
    if (access.role !== "student") throw new ApiError(403, "FORBIDDEN", "Only enrolled students can submit answers.");
    if (set.status !== "open") throw new ApiError(409, "CLOSED", "This set is not open for answers.");
    const questions = (set.questions || []) as StoredQuestion[];

    // Claim the submission first so double-taps / retries cannot grade twice.
    const subRef = adminDb().collection("gradingSubmissions").doc(`${id}_${caller.uid}`);
    const clean: Record<string, string> = {};
    for (const q of questions) clean[q.id] = sanitizeStudentText(String(answers[q.id] ?? ""), 4000);
    try {
      await subRef.create({
        setId: id,
        classId: set.classId,
        uid: caller.uid,
        answers: clean,
        grades: {},
        total: 0,
        maxTotal: questions.reduce((s, q) => s + q.maxMarks, 0),
        submittedAt: new Date().toISOString(),
        gradingState: "grading",
      });
    } catch {
      throw new ApiError(409, "ALREADY_SUBMITTED", "You have already submitted this set.");
    }

    const graded = await Promise.all(questions.map((q) => gradeOne(q, clean[q.id], caller.uid)));
    const grades: Record<string, QuestionGrade> = {};
    questions.forEach((q, i) => {
      grades[q.id] = graded[i];
    });
    const total = totalAwarded(graded.map((g) => ({ awarded: g.total })));
    await subRef.update({ grades, total, gradingState: "done", gradedAt: new Date().toISOString() });

    const needsTeacher = graded.some((g) => g.status === "review");
    if (needsTeacher && set.teacherId) {
      await notify(set.teacherId, {
        type: "system",
        title: "Answers need your review",
        body: String(set.title),
        href: "/teach/grading",
        icon: "✅",
      });
    }
    // Deliberately no marks in the response: students see results only after release.
    return NextResponse.json({ ok: true, data: { submitted: true } });
  } catch (error) {
    return handleAuthError(error);
  }
}
