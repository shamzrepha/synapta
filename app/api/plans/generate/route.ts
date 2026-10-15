import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb } from "@/lib/firebase/admin";
import { ApiError, parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { generateWithFallback } from "@/lib/ai/router";
import { GeneratedPlanSchema, normalizeLesson } from "@/lib/plans/schema";
import { PLAN_SYSTEM, planPrompt } from "@/lib/plans/prompts";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({
  classId: z.string().min(1).max(128),
  syllabus: z.string().trim().min(20, "Paste or upload a longer syllabus").max(40000),
  durationMin: z.number().int().min(10).max(240),
  lessons: z.number().int().min(1).max(12),
  title: z.string().trim().max(140).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req, ["teacher", "admin"]);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "plans-generate", limit: 8, windowMs: 60 * 60 * 1000 });
    if (limited) return limited;
    const body = await parseJson(req, Body);
    const access = await assertClassAccess(caller, body.classId, "mutate");

    const syllabus = body.syllabus.slice(0, 24000);
    const result = await generateWithFallback({
      task: "lesson_notes",
      systemInstruction: PLAN_SYSTEM,
      userPrompt: planPrompt({
        syllabus,
        lessons: body.lessons,
        durationMin: body.durationMin,
        classTitle: String(access.classData.title || "Class"),
        subject: access.classData.subject,
      }),
      schema: GeneratedPlanSchema,
      temperature: 0.5,
      userId: caller.uid,
    });
    if (!result.data) throw new ApiError(502, "AI_BAD_OUTPUT", "The AI returned an unusable plan. Please try again.");

    const lessons = result.data.lessons.slice(0, body.lessons).map((l) => normalizeLesson(l, body.durationMin));
    const now = new Date().toISOString();
    const ref = adminDb().collection("lessonPlans").doc();
    const plan = {
      id: ref.id,
      classId: body.classId,
      teacherId: caller.uid,
      title: body.title || result.data.title,
      durationMin: body.durationMin,
      lessons,
      syllabus,
      createdAt: now,
      updatedAt: now,
    };
    await ref.set(plan);
    return NextResponse.json({ ok: true, data: plan });
  } catch (error) {
    return handleAuthError(error);
  }
}
