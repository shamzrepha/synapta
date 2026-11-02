import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { ApiError, parseJson } from "@/lib/api/errors";
import { ensureQuizBank, ensureFlashcardBank, getBankSizes, readFlashcardBank, readQuizBank, removeBankItem } from "@/lib/practice/bank";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; kcId: string }> }) {
  try {
    const { id: classId, kcId } = await params;
    const caller = await requireUser(req);
    const access = await assertClassAccess(caller, classId, "view");
    // ?full=1: the teacher reviews every question and card (answers included), so it stays teacher-only
    if (req.nextUrl.searchParams.get("full") === "1" && access.canMutate) {
      const [questions, cards] = await Promise.all([readQuizBank(classId, kcId), readFlashcardBank(classId, kcId)]);
      return NextResponse.json({
        ok: true,
        data: {
          questions: questions.map((q) => ({ id: q.id, question: q.question, options: q.options, correctIndex: q.correctIndex, explanation: q.explanation, focus: q.focus })),
          cards: cards.map((c) => ({ id: c.id, front: c.front, back: c.back })),
        },
      });
    }
    return NextResponse.json({ ok: true, data: await getBankSizes(classId, kcId) });
  } catch (error) {
    return handleAuthError(error);
  }
}

const schema = z.object({
  action: z.enum(["prepare", "regenerate_quiz", "extend_quiz", "regenerate_cards", "remove"]),
  /** for "remove": which item the teacher took out during review */
  kind: z.enum(["question", "card"]).optional(),
  id: z.string().max(100).optional(),
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
    const { action, kind, id } = await parseJson(req, schema);
    if (action === "remove") {
      if (!kind || !id) throw new ApiError(400, "VALIDATION", "Say which item to remove.");
      await removeBankItem(classId, kcId, kind, id);
    } else if (action === "prepare") {
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
