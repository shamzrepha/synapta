import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { parseJson } from "@/lib/api/errors";
import { ensureQuizBank, ensureFlashcardBank, getBankSizes } from "@/lib/practice/bank";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; kcId: string }> }) {
  try {
    const { id: classId, kcId } = await params;
    const caller = await requireUser(req);
    await assertClassAccess(caller, classId, "view");
    return NextResponse.json({ ok: true, data: await getBankSizes(classId, kcId) });
  } catch (error) {
    return handleAuthError(error);
  }
}

const schema = z.object({
  action: z.enum(["prepare", "regenerate_quiz", "extend_quiz", "regenerate_cards"]),
});

/**
 * Teachers: prepare the topic's practice banks ahead of time (so the first student never waits),
 * regenerate them after rewriting the lesson, or add another ~60 questions.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; kcId: string }> }) {
  try {
    const { id: classId, kcId } = await params;
    const caller = await requireUser(req, ["teacher", "admin"]);
    await assertClassAccess(caller, classId, "mutate");
    const { action } = await parseJson(req, schema);
    if (action === "prepare") {
      await Promise.all([
        ensureQuizBank({ classId, kcId, userId: caller.uid }),
        ensureFlashcardBank({ classId, kcId, userId: caller.uid }),
      ]);
    } else if (action === "regenerate_quiz") {
      await ensureQuizBank({ classId, kcId, userId: caller.uid, force: true });
    } else if (action === "extend_quiz") {
      await ensureQuizBank({ classId, kcId, userId: caller.uid, extend: true });
    } else {
      await ensureFlashcardBank({ classId, kcId, userId: caller.uid, force: true });
    }
    return NextResponse.json({ ok: true, data: await getBankSizes(classId, kcId) });
  } catch (error) {
    return handleAuthError(error);
  }
}
