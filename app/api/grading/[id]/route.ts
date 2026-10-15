import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb } from "@/lib/firebase/admin";
import { ApiError, parseJson } from "@/lib/api/errors";
import { buildQuestions, QuestionInput, studentQuestion, type StoredQuestion } from "@/lib/grading/sets";
import { sumResults } from "@/lib/grading/scoring";
import { activeStudentUids, displayNames } from "@/lib/teach/roster";
import { notifyMany } from "@/lib/notifications/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

async function loadSet(id: string) {
  const ref = adminDb().collection("gradingSets").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new ApiError(404, "NOT_FOUND", "Question set not found");
  return { ref, set: snap.data()! };
}

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const caller = await requireUser(req);
    const { set } = await loadSet(id);
    const access = await assertClassAccess(caller, set.classId, "view");
    const questions = (set.questions || []) as StoredQuestion[];

    if (access.canMutate) {
      const subs = await adminDb().collection("gradingSubmissions").where("setId", "==", id).limit(300).get();
      const names = await displayNames(subs.docs.map((d) => d.data().uid as string));
      const submissions = subs.docs.map((d) => {
        const s = d.data();
        return { uid: s.uid, name: names.get(s.uid) || "Student", answers: s.answers, grades: s.grades, total: s.total, maxTotal: s.maxTotal, submittedAt: s.submittedAt };
      });
      return NextResponse.json({ ok: true, data: { ...set, submissions } });
    }

    // Student: never the model answer or rubric; own result only after release.
    if (set.status === "draft") throw new ApiError(404, "NOT_FOUND", "Question set not found");
    const subSnap = await adminDb().collection("gradingSubmissions").doc(`${id}_${caller.uid}`).get();
    const sub = subSnap.exists ? subSnap.data()! : null;
    let result: unknown = null;
    if (sub && set.released) {
      const grades = (sub.grades || {}) as Record<string, { total: number; max: number; explanation?: string; feedback?: string }>;
      const perQuestion = questions.map((q) => {
        const g = grades[q.id];
        return {
          questionId: q.id,
          total: g?.total ?? 0,
          max: q.maxMarks,
          feedback: g?.feedback || "",
          explanation: g?.explanation || "",
          answer: sub.answers?.[q.id] || "",
        };
      });
      result = { perQuestion, ...sumResults(perQuestion.map((p) => ({ total: p.total, max: p.max }))) };
    }
    return NextResponse.json({
      ok: true,
      data: {
        id: set.id,
        classId: set.classId,
        title: set.title,
        status: set.status,
        released: !!set.released,
        questions: questions.map(studentQuestion),
        submitted: !!sub,
        result,
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}

const Patch = z.object({
  title: z.string().trim().min(1).max(140).optional(),
  questions: z.array(QuestionInput).min(1).max(10).optional(),
  status: z.enum(["draft", "open", "closed"]).optional(),
  released: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);
    const body = await parseJson(req, Patch);
    const { ref, set } = await loadSet(id);
    const access = await assertClassAccess(caller, set.classId, "mutate");

    const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (body.title) update.title = body.title;
    if (body.questions) {
      if (set.status !== "draft") throw new ApiError(409, "LOCKED", "Questions can only be edited while the set is a draft.");
      update.questions = buildQuestions(body.questions);
    }
    if (body.status) update.status = body.status;
    if (typeof body.released === "boolean") update.released = body.released;
    await ref.update(update);

    if (body.status === "open" && set.status === "draft") {
      const uids = await activeStudentUids(set.classId, access.classData);
      await notifyMany(uids, {
        type: "system",
        title: "New short-answer set",
        body: String(update.title || set.title),
        href: `/teach/grading/take/${id}`,
        icon: "✅",
      });
    }
    if (body.released === true && !set.released) {
      const subs = await adminDb().collection("gradingSubmissions").where("setId", "==", id).limit(300).get();
      await notifyMany(subs.docs.map((d) => d.data().uid as string), {
        type: "system",
        title: "Your marks are ready",
        body: String(update.title || set.title),
        href: `/teach/grading/take/${id}`,
        icon: "✅",
      });
    }
    return NextResponse.json({ ok: true, data: { ...set, ...update } });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);
    const { ref, set } = await loadSet(id);
    await assertClassAccess(caller, set.classId, "mutate");
    const subs = await adminDb().collection("gradingSubmissions").where("setId", "==", id).limit(400).get();
    const batch = adminDb().batch();
    subs.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(ref);
    await batch.commit();
    return NextResponse.json({ ok: true, data: { id } });
  } catch (error) {
    return handleAuthError(error);
  }
}
