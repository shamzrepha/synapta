import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb } from "@/lib/firebase/admin";
import { ApiError, parseJson } from "@/lib/api/errors";
import { applyOverride, totalAwarded } from "@/lib/grading/scoring";
import type { StoredQuestion } from "@/lib/grading/sets";

export const runtime = "nodejs";

const Body = z.object({
  uid: z.string().min(1).max(128),
  questionId: z.string().regex(/^q\d{1,2}$/),
  awarded: z.record(z.number()).default({}),
  feedback: z.string().trim().max(1500).optional(),
});

/** Teacher sets final marks/feedback for one student's answer (also clears it from the review queue). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);
    const body = await parseJson(req, Body);
    const setSnap = await adminDb().collection("gradingSets").doc(id).get();
    if (!setSnap.exists) throw new ApiError(404, "NOT_FOUND", "Question set not found");
    const set = setSnap.data()!;
    await assertClassAccess(caller, set.classId, "mutate");
    const q = ((set.questions || []) as StoredQuestion[]).find((x) => x.id === body.questionId);
    if (!q) throw new ApiError(400, "VALIDATION", "Unknown question");

    const subRef = adminDb().collection("gradingSubmissions").doc(`${id}_${body.uid}`);
    const subSnap = await subRef.get();
    if (!subSnap.exists) throw new ApiError(404, "NOT_FOUND", "Submission not found");
    const sub = subSnap.data()!;
    const prev = sub.grades?.[q.id];
    const o = applyOverride(q.rubric, body.awarded ?? {}, prev?.criteria);
    const next = {
      ...(prev || {}),
      criteria: o.criteria,
      total: o.total,
      max: o.max,
      confidence: prev?.confidence ?? 0,
      explanation: prev?.explanation ?? "",
      status: "final" as const,
      feedback: body.feedback ?? prev?.feedback ?? "",
      reviewedBy: caller.uid,
    };
    const grades = { ...(sub.grades || {}), [q.id]: next };
    const total = totalAwarded(Object.values(grades).map((g) => ({ awarded: (g as { total: number }).total })));
    await subRef.update({ grades, total });
    return NextResponse.json({ ok: true, data: { grade: next, total } });
  } catch (error) {
    return handleAuthError(error);
  }
}
