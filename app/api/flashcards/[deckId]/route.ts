import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { cardsRef, deleteDeckCards, loadOwnDeck } from "@/lib/flashcards/generate";
import { isDueStored, newStored, type StoredFsrs } from "@/lib/flashcards/serde";
import { z } from "zod";

export const runtime = "nodejs";

/** GET ?mode=review (due cards, max 30, soonest first) or mode=all (every card). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ deckId: string }> }) {
  try {
    const caller = await requireUser(req);
    const { deckId } = await params;
    const { data } = await loadOwnDeck(deckId, caller.uid);
    const mode = new URL(req.url).searchParams.get("mode") || "all";
    const snap = await cardsRef().where("deckId", "==", deckId).where("uid", "==", caller.uid).limit(200).get();
    const now = new Date();
    let cards = snap.docs.map((d) => {
      const x = d.data();
      const f = x.fsrs as StoredFsrs | undefined;
      return { id: d.id, front: String(x.front), back: String(x.back), due: f?.due || null, isDue: isDueStored(f, now), reps: f?.reps || 0, state: f?.state || 0 };
    });
    const dueCount = cards.filter((c) => c.isDue).length;
    if (mode === "review") {
      cards = cards.filter((c) => c.isDue).sort((a, b) => String(a.due).localeCompare(String(b.due))).slice(0, 30);
    } else {
      cards.sort((a, b) => a.front.localeCompare(b.front));
    }
    return NextResponse.json({ ok: true, data: { deck: { id: deckId, title: data.title, sourceLabel: data.sourceLabel || "" }, cards, dueCount } });
  } catch (error) {
    return handleAuthError(error);
  }
}

const addSchema = z.object({ front: z.string().trim().min(1).max(300), back: z.string().trim().min(1).max(600) });

/** Add a card by hand. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ deckId: string }> }) {
  try {
    const caller = await requireUser(req);
    const { deckId } = await params;
    await loadOwnDeck(deckId, caller.uid);
    const { front, back } = await parseJson(req, addSchema);
    const count = await cardsRef().where("deckId", "==", deckId).where("uid", "==", caller.uid).limit(101).get();
    if (count.size >= 100) throw new ApiError(409, "LIMIT", "A deck can hold up to 100 cards.");
    const now = new Date().toISOString();
    const ref = cardsRef().doc();
    await ref.set({ uid: caller.uid, deckId, front, back, fsrs: newStored(), createdAt: now, updatedAt: now });
    return NextResponse.json({ ok: true, data: { id: ref.id, front, back, due: now, isDue: true, reps: 0, state: 0 } });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ deckId: string }> }) {
  try {
    const caller = await requireUser(req);
    const { deckId } = await params;
    const { ref } = await loadOwnDeck(deckId, caller.uid);
    await deleteDeckCards(deckId, caller.uid);
    await ref.delete();
    return NextResponse.json({ ok: true, data: { id: deckId } });
  } catch (error) {
    return handleAuthError(error);
  }
}
