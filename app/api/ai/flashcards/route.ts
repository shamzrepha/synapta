import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { ensureFlashcardBank, pickForLearner } from "@/lib/practice/bank";
import { getSeen, setSeen } from "@/lib/practice/history";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 90;

const flashcardsInputSchema = z.object({
  classId: z.string().min(1),
  kcId: z.string().min(1),
  count: z.number().int().min(1).max(30).default(10),
});

/** Deals a learner a deck from the topic's stored flashcard bank (generated once, ~40 cards). */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const body = await req.json();
    const parsed = flashcardsInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION", message: parsed.error.issues[0]?.message || "Invalid input" } },
        { status: 400 }
      );
    }
    const { classId, kcId, count } = parsed.data;
    await assertClassAccess(caller, classId, "view");

    const bank = await ensureFlashcardBank({ classId, kcId, userId: caller.uid });
    const seen = await getSeen(caller.uid, kcId, "cards");
    const { picked, seen: nextSeen } = pickForLearner(bank, seen, count);
    await setSeen(caller.uid, kcId, "cards", nextSeen);

    return NextResponse.json({
      ok: true,
      data: { cards: picked.map((c) => ({ front: c.front, back: c.back })), bankSize: bank.length },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
