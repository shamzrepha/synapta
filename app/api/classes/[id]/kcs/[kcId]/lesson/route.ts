import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { parseJson } from "@/lib/api/errors";
import { generateLessonForKc } from "@/lib/lesson/generate";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({
  regenerate: z.boolean().optional().default(false),
  instructions: z.string().max(1500).optional(),
});

/**
 * Writes the full lesson for a topic. Students may trigger this once for a topic that only has a
 * build-time stub; teachers can regenerate (optionally with instructions) at any time.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; kcId: string }> }
) {
  try {
    const { id: classId, kcId } = await params;
    const caller = await requireUser(req);
    const access = await assertClassAccess(caller, classId, "view");
    const body = await parseJson(req, bodySchema);

    if (!access.canMutate && !access.isEnrolled) {
      return NextResponse.json(
        { ok: false, error: { code: "FORBIDDEN", message: "Enroll in this class to generate lessons." } },
        { status: 403 }
      );
    }

    const result = await generateLessonForKc({
      classId,
      kcId,
      userId: caller.uid,
      force: access.canMutate && body.regenerate === true,
      instructions: access.canMutate ? body.instructions : undefined,
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    return handleAuthError(error);
  }
}
