import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb } from "@/lib/firebase/admin";
import { ApiError, parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { generateWithFallback } from "@/lib/ai/router";
import { GeneratedLessonSchema, normalizeLesson } from "@/lib/plans/schema";
import { PLAN_SYSTEM, lessonPrompt } from "@/lib/plans/prompts";

export const runtime = "nodejs";
export const maxDuration = 90;

const Body = z.object({ index: z.number().int().min(0).max(19), note: z.string().trim().max(600).optional() });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "plans-regen", limit: 20, windowMs: 60 * 60 * 1000 });
    if (limited) return limited;
    const { index, note } = await parseJson(req, Body);

    const ref = adminDb().collection("lessonPlans").doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new ApiError(404, "NOT_FOUND", "Plan not found");
    const plan = snap.data()!;
    const access = await assertClassAccess(caller, plan.classId, "mutate");
    const lessons = Array.isArray(plan.lessons) ? plan.lessons : [];
    if (index >= lessons.length) throw new ApiError(400, "VALIDATION", "No such lesson");

    const result = await generateWithFallback({
      task: "lesson_notes",
      systemInstruction: PLAN_SYSTEM,
      userPrompt: lessonPrompt({
        syllabus: String(plan.syllabus || ""),
        lessons: lessons.length,
        index,
        durationMin: plan.durationMin,
        currentTitle: String(lessons[index]?.title || ""),
        note,
        classTitle: String(access.classData.title || "Class"),
      }),
      schema: GeneratedLessonSchema,
      temperature: 0.7,
      userId: caller.uid,
    });
    if (!result.data) throw new ApiError(502, "AI_BAD_OUTPUT", "The AI returned an unusable lesson. Please try again.");

    const next = [...lessons];
    next[index] = normalizeLesson(result.data.lesson, plan.durationMin);
    const updatedAt = new Date().toISOString();
    await ref.update({ lessons: next, updatedAt });
    return NextResponse.json({ ok: true, data: { index, lesson: next[index], updatedAt } });
  } catch (error) {
    return handleAuthError(error);
  }
}
