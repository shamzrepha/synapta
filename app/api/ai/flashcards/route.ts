import { NextRequest, NextResponse } from "next/server";
import { classSourceLanguage, localizeFor } from "@/lib/i18n/serve";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb } from "@/lib/firebase/admin";
import { ApiError } from "@/lib/api/errors";
import { flashcardBankForStudents } from "@/lib/classes/live";
import { classOwner, ensureFlashcardBank, pickForLearner, readFlashcardBank } from "@/lib/practice/bank";
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
    const access = await assertClassAccess(caller, classId, "view");

    // Flashcards are self-study, open to every member without waiting for the teacher to publish: the teacher's
    // published deck when there is one, else the topic's deck, prepared once (on the class's account) if missing.
    let bank;
    if (access.canMutate) bank = await ensureFlashcardBank({ classId, kcId, userId: caller.uid });
    else {
      const kcSnap = await adminDb().collection("classes").doc(classId).collection("kcs").doc(kcId).get();
      bank = await flashcardBankForStudents(classId, kcId, kcSnap.data() || {});
      if (!bank.length) bank = await readFlashcardBank(classId, kcId);
      if (!bank.length) bank = await ensureFlashcardBank({ classId, kcId, userId: classOwner(access.classData, caller.uid) });
      if (!bank.length) throw new ApiError(404, "NOT_READY", "Flashcards for this topic aren't ready yet. Try again in a minute.");
    }
    const seen = await getSeen(caller.uid, kcId, "cards");
    const { picked, seen: nextSeen } = pickForLearner(bank, seen, count);
    await setSeen(caller.uid, kcId, "cards", nextSeen);

    return NextResponse.json({
      ok: true,
      data: { cards: await localizeFor(req, caller, access.canMutate, picked.map((c) => ({ front: c.front, back: c.back })), await classSourceLanguage(access.classData)), bankSize: bank.length },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
