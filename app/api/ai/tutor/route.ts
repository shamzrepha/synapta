import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { runTeacherAgent } from "@/lib/teacher/orchestrator";
import { z } from "zod";
import { EXPLAIN_LEVELS } from "@/lib/study/explain-level";

export const runtime = "nodejs";
export const maxDuration = 60;

const tutorInputSchema = z.object({
  /** Both optional: topic tutor (classId + kcId), class tutor (classId) or general study tutor */
  classId: z.string().min(1).nullish(),
  kcId: z.string().min(1).nullish(),
  message: z.string().trim().min(1).max(4000),
  level: z.enum(EXPLAIN_LEVELS).optional(),
  history: z
    .array(z.object({ role: z.enum(["user", "model"]), parts: z.string().max(20_000) }))
    .max(40)
    .optional()
    .default([]),
});

/** AI tutor. Replies as plain text (Markdown). */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const parsed = tutorInputSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: parsed.error.issues[0]?.message || "Invalid input" } },
        { status: 400 }
      );
    }
    const { classId, kcId, message, level, history } = parsed.data;
    if (kcId && !classId) {
      return NextResponse.json({ ok: false, error: { code: "VALIDATION", message: "classId is required with kcId" } }, { status: 400 });
    }
    if (classId) await assertClassAccess(caller, classId, "view");

    const result = await runTeacherAgent({
      uid: caller.uid,
      classId: classId || null,
      kcId: kcId || null,
      userMessage: message,
      level,
      history: history.map((h) => ({ role: h.role, text: h.parts })),
    });

    return new Response(result.reply, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "X-Tutor-Mode": result.mode },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
