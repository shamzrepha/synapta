import { NextRequest, NextResponse, after } from "next/server";
import { ensureFlashcardBank, ensureQuizBank } from "@/lib/practice/bank";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { parseJson } from "@/lib/api/errors";
import { generateLessonForKc } from "@/lib/lesson/generate";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 300;

const bodySchema = z.object({
  regenerate: z.boolean().optional().default(false),
  instructions: z.string().max(1500).optional(),
});

/**
 * Writes the full lesson for a topic. Only the teacher generates (students never spend AI on it); the lesson stays a draft until published. Teachers can regenerate (optionally with instructions) at any time.
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

    if (!access.canMutate) {
      return NextResponse.json(
        { ok: false, error: { code: "FORBIDDEN", message: "Only the teacher writes lessons. You'll see it here once it's published." } },
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

    // With the lesson written, prepare the topic's practice banks (~60 questions, ~40 flashcards) in the background,
    // so the teacher only reviews them and students can self-test straight away. Existing banks are kept.
    after(async () => {
      await Promise.allSettled([
        ensureQuizBank({ classId, kcId, userId: caller.uid }),
        ensureFlashcardBank({ classId, kcId, userId: caller.uid }),
      ]);
    });
    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    return handleAuthError(error);
  }
}
