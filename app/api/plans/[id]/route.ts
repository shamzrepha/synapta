import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb } from "@/lib/firebase/admin";
import { ApiError, parseJson } from "@/lib/api/errors";
import { LessonSchema, normalizeLesson } from "@/lib/plans/schema";

export const runtime = "nodejs";

async function loadPlan(id: string, caller: Awaited<ReturnType<typeof requireUser>>) {
  const ref = adminDb().collection("lessonPlans").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new ApiError(404, "NOT_FOUND", "Plan not found");
  const plan = snap.data()!;
  await assertClassAccess(caller, plan.classId, "mutate");
  return { ref, plan };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);
    const { plan } = await loadPlan(id, caller);
    const { syllabus: _s, ...rest } = plan;
    void _s;
    return NextResponse.json({ ok: true, data: rest });
  } catch (error) {
    return handleAuthError(error);
  }
}

const Patch = z.object({
  title: z.string().trim().min(1).max(140).optional(),
  lessons: z.array(LessonSchema).min(1).max(20).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);
    const body = await parseJson(req, Patch);
    const { ref, plan } = await loadPlan(id, caller);
    const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (body.title) update.title = body.title;
    if (body.lessons) update.lessons = body.lessons.map((l) => normalizeLesson(LessonSchema.parse(l), plan.durationMin));
    await ref.update(update);
    const { syllabus: _s, ...rest } = { ...plan, ...update };
    void _s;
    return NextResponse.json({ ok: true, data: rest });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);
    const { ref } = await loadPlan(id, caller);
    await ref.delete();
    return NextResponse.json({ ok: true, data: { id } });
  } catch (error) {
    return handleAuthError(error);
  }
}
