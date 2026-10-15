import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb } from "@/lib/firebase/admin";
import { ApiError, parseJson } from "@/lib/api/errors";
import { buildQuestions, SetInput, type StoredQuestion } from "@/lib/grading/sets";
import { classTitles, isTeacherRole, studentClassIds } from "@/lib/teach/roster";

export const runtime = "nodejs";

/**
 * Teacher: ?classId=X lists all sets of that class (full detail).
 * Student: lists open/closed sets of their classes (optionally ?classId=X) without answers or rubric.
 */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const classId = new URL(req.url).searchParams.get("classId");

    if (isTeacherRole(caller.role)) {
      if (!classId) throw new ApiError(400, "VALIDATION", "classId is required");
      await assertClassAccess(caller, classId, "mutate");
      const snap = await adminDb().collection("gradingSets").where("classId", "==", classId).limit(100).get();
      const sets = snap.docs
        .map((d) => d.data())
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .map((s) => ({ id: s.id, classId: s.classId, title: s.title, status: s.status, released: !!s.released, questionCount: (s.questions || []).length, createdAt: s.createdAt }));
      return NextResponse.json({ ok: true, data: sets });
    }

    let classIds = await studentClassIds(caller.uid);
    if (classId) classIds = classIds.filter((c) => c === classId);
    classIds = classIds.slice(0, 30);
    if (classIds.length === 0) return NextResponse.json({ ok: true, data: [] });

    const chunks: string[][] = [];
    for (let i = 0; i < classIds.length; i += 10) chunks.push(classIds.slice(i, i + 10));
    const [setSnaps, subSnap, titles] = await Promise.all([
      Promise.all(chunks.map((c) => adminDb().collection("gradingSets").where("classId", "in", c).limit(100).get())),
      adminDb().collection("gradingSubmissions").where("uid", "==", caller.uid).limit(300).get(),
      classTitles(classIds),
    ]);
    const mine = new Map(subSnap.docs.map((d) => [d.data().setId as string, d.data()]));
    const sets = setSnaps
      .flatMap((s) => s.docs.map((d) => d.data()))
      .filter((s) => s.status !== "draft")
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map((s) => ({
        id: s.id,
        classId: s.classId,
        classTitle: titles.get(s.classId) || "Class",
        title: s.title,
        status: s.status,
        released: !!s.released,
        questionCount: (s.questions || []).length,
        submitted: mine.has(s.id),
      }));
    return NextResponse.json({ ok: true, data: sets });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req, ["teacher", "admin"]);
    const body = await parseJson(req, SetInput);
    await assertClassAccess(caller, body.classId, "mutate");
    const ref = adminDb().collection("gradingSets").doc();
    const now = new Date().toISOString();
    const questions: StoredQuestion[] = buildQuestions(body.questions);
    const set = {
      id: ref.id,
      classId: body.classId,
      teacherId: caller.uid,
      title: body.title,
      questions,
      status: "draft" as const,
      released: false,
      createdAt: now,
      updatedAt: now,
    };
    await ref.set(set);
    return NextResponse.json({ ok: true, data: { ...set, questions } });
  } catch (error) {
    return handleAuthError(error);
  }
}
