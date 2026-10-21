import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { applyEvidence } from "@/lib/evidence/apply";
import { parseJson } from "@/lib/api/errors";
import { z } from "zod";

export const runtime = "nodejs";

const ID = /^[A-Za-z0-9_-]+$/;

const evidenceInputSchema = z.object({
  classId: z.string().min(1).max(128).regex(ID, "Invalid classId"),
  kcId: z.string().min(1).max(128).regex(ID, "Invalid kcId"),
  activity: z.literal("flashcard", {
    errorMap: () => ({
      message:
        "Invalid activity. Only 'flashcard' evidence can be submitted directly. Quiz and Lab require server grading, and 'peer_explain' must be credited by a peer in the Study Lounge.",
    }),
  }),
  correct: z.boolean(),
});

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const { classId, kcId, activity, correct } = await parseJson(req, evidenceInputSchema);

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

