import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb, FieldValue } from "@/lib/firebase/admin";
import { ApiError, parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { trackProgress } from "@/lib/game/progress";
import { cardsRef } from "@/lib/flashcards/generate";
import { RATINGS, reviewStored, type StoredFsrs } from "@/lib/flashcards/serde";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({ cardId: z.string().min(1).max(80), rating: z.enum(RATINGS) });

/** Rate a card with the FSRS scheduler (Again / Hard / Good / Easy) and store its next due date. */
export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "flashcard-review", limit: 240, windowMs: 10 * 60 * 1000 });
    if (limited) return limited;
    const { cardId, rating } = await parseJson(req, schema);
    const ref = cardsRef().doc(cardId);
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.uid !== caller.uid) throw new ApiError(404, "NOT_FOUND", "Card not found");

    const now = new Date();
    const next = reviewStored(snap.data()!.fsrs as StoredFsrs | undefined, rating, now);
    const day = now.toISOString().slice(0, 10);
    await ref.update({ fsrs: next, updatedAt: now.toISOString() });
    await adminDb()
      .collection("flashcardStats")
      .doc(caller.uid)
      .set({ total: FieldValue.increment(1), byDay: { [day]: FieldValue.increment(1) }, updatedAt: now.toISOString() }, { merge: true });
    await trackProgress({ uid: caller.uid, stats: { flashcards: 1 }, reason: "flashcard_review" });

    return NextResponse.json({ ok: true, data: { due: next.due, reps: next.reps } });
  } catch (error) {
    return handleAuthError(error);
  }
}
