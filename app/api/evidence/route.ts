import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { applyEvidence } from "@/lib/evidence/apply";
import { z } from "zod";

export const runtime = "nodejs";

const evidenceInputSchema = z.object({
  classId: z.string().min(1),
  kcId: z.string().min(1),
  activity: z.enum(["flashcard", "peer_explain"]),
  correct: z.boolean(),
});

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const body = await req.json();
    const parsed = evidenceInputSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "VALIDATION",
            message:
              parsed.error.issues[0]?.message ||
              "Invalid evidence payload. Note: Quiz and Lab evidence must be submitted via /api/quiz/[sessionId]/answer and /api/labs/verify for server grading.",
          },
        },
        { status: 400 }
      );
    }

    const { classId, kcId, activity, correct } = parsed.data;

    const result = await applyEvidence({
      uid: caller.uid,
      classId,
      kcId,
      activity,
      correct,
    });

    return NextResponse.json({
      ok: true,
      data: result,
    });
  } catch (error: unknown) {
    return handleAuthError(error);
  }
}

