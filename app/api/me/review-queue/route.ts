import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb } from "@/lib/firebase/admin";
import { cardsRef, decksRef } from "@/lib/flashcards/generate";
import { isDueStored, type StoredFsrs } from "@/lib/flashcards/serde";
import { listMistakes } from "@/lib/mistakes/store";
import { summarizeReview } from "@/lib/review/queue";

export const runtime = "nodejs";

const toIso = (v: unknown): string | null => {
  if (!v) return null;
  const d = typeof v === "object" && v !== null && "toDate" in v ? (v as { toDate: () => Date }).toDate() : new Date(v as string);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/**
 * One place for "what is due": flashcards from their spaced-review schedule, mistakes still open, and topics whose saved
 * review date has arrived. Read only; every number comes from the student's own saved data.
 */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const now = new Date();
    const [decksSnap, cardsSnap, mistakes, masterySnap] = await Promise.all([
      decksRef().where("uid", "==", caller.uid).limit(25).get(),
      cardsRef().where("uid", "==", caller.uid).limit(2000).get(),
      listMistakes(caller.uid),
      adminDb().collection("mastery").where("uid", "==", caller.uid).limit(100).get(),
    ]);

    const perDeck = new Map<string, number>();
    let due = 0;
    for (const c of cardsSnap.docs) {
      const d = c.data();
      if (isDueStored(d.fsrs as StoredFsrs | undefined, now)) {
        due++;
        perDeck.set(d.deckId, (perDeck.get(d.deckId) || 0) + 1);
      }
    }
    const decks = decksSnap.docs.map((d) => ({ id: d.id, title: String(d.data().title || "Deck"), dueCount: perDeck.get(d.id) || 0 }));

    const dueTopics = masterySnap.docs
      .map((m) => ({ classId: String(m.data().classId || ""), kcId: String(m.data().kcId || ""), at: toIso(m.data().nextReviewAt) }))
      .filter((m) => m.classId && m.kcId && m.at && new Date(m.at) <= now)
      .sort((a, b) => String(a.at).localeCompare(String(b.at)))
      .slice(0, 5);
    const titles = dueTopics.length
      ? await adminDb().getAll(...dueTopics.map((m) => adminDb().collection("classes").doc(m.classId).collection("kcs").doc(m.kcId)))
      : [];
    const topics = dueTopics.map((m, i) => ({ classId: m.classId, kcId: m.kcId, title: String(titles[i]?.data()?.title || "Topic"), dueAt: m.at as string }));

    const summary = summarizeReview({ dueCards: due, totalCards: cardsSnap.size, decks, openMistakes: mistakes.filter((m) => !m.mastered).length, topics });
    return NextResponse.json({ ok: true, data: summary });
  } catch (error) {
    return handleAuthError(error);
  }
}
