import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb } from "@/lib/firebase/admin";
import { ApiError, parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { cardsRef, decksRef, generateCards, resolveSource, type CardSource } from "@/lib/flashcards/generate";
import { isDueStored, newStored, type StoredFsrs } from "@/lib/flashcards/serde";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 90;

const MAX_DECKS = 20;
const MAX_CARDS_PER_DECK = 100;

export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const day = new Date().toISOString().slice(0, 10);
    const [decksSnap, cardsSnap, statsSnap] = await Promise.all([
      decksRef().where("uid", "==", caller.uid).limit(MAX_DECKS + 5).get(),
      cardsRef().where("uid", "==", caller.uid).limit(MAX_DECKS * MAX_CARDS_PER_DECK).get(),
      adminDb().collection("flashcardStats").doc(caller.uid).get(),
    ]);
    const now = new Date();
    const per = new Map<string, { total: number; due: number; fresh: number; learned: number }>();
    for (const c of cardsSnap.docs) {
      const d = c.data();
      const p = per.get(d.deckId) ?? { total: 0, due: 0, fresh: 0, learned: 0 };
      const f = d.fsrs as StoredFsrs | undefined;
      p.total++;
      if (isDueStored(f, now)) p.due++;
      if (!f || !f.reps) p.fresh++;
      else if (f.state === 2) p.learned++;
      per.set(d.deckId, p);
    }
    const decks = decksSnap.docs
      .map((d) => {
        const x = d.data();
        const p = per.get(d.id) ?? { total: 0, due: 0, fresh: 0, learned: 0 };
        return { id: d.id, title: x.title, sourceLabel: x.sourceLabel || "", createdAt: x.createdAt, cardCount: p.total, dueCount: p.due, newCount: p.fresh, learnedCount: p.learned };
      })
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const st = statsSnap.exists ? statsSnap.data()! : {};
    const stats = {
      totalCards: decks.reduce((s, d) => s + d.cardCount, 0),
      dueToday: decks.reduce((s, d) => s + d.dueCount, 0),
      learned: decks.reduce((s, d) => s + d.learnedCount, 0),
      reviewedToday: Number(st.byDay?.[day] || 0),
      totalReviews: Number(st.total || 0),
    };
    return NextResponse.json({ ok: true, data: { decks, stats } });
  } catch (error) {
    return handleAuthError(error);
  }
}

const sourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("class"), classId: z.string().min(1).max(80), kcId: z.string().min(1).max(80) }),
  z.object({ kind: z.literal("notebook"), notebookId: z.string().min(1).max(80), sourceId: z.string().max(80).optional() }),
  z.object({ kind: z.literal("text"), text: z.string().max(40000) }),
]);
const createSchema = z.object({
  title: z.string().trim().max(80).optional(),
  count: z.number().int().min(5).max(30).default(15),
  source: sourceSchema,
});

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "flashcard-gen", limit: 8, windowMs: 60 * 60 * 1000 });
    if (limited) return limited;
    const body = await parseJson(req, createSchema);

    const existing = await decksRef().where("uid", "==", caller.uid).limit(MAX_DECKS + 1).get();
    if (existing.size >= MAX_DECKS) throw new ApiError(409, "LIMIT", `You can keep up to ${MAX_DECKS} decks. Delete one to make room.`);

    const source = await resolveSource(caller, body.source as CardSource);
    const cards = await generateCards(caller.uid, source, body.count ?? 15);

    const now = new Date().toISOString();
    const deckRef = decksRef().doc();
    const batch = adminDb().batch();
    batch.set(deckRef, {
      uid: caller.uid,
      title: body.title || source.title,
      sourceLabel: source.label,
      sourceKind: body.source.kind,
      createdAt: now,
      updatedAt: now,
    });
    for (const c of cards.slice(0, MAX_CARDS_PER_DECK)) {
      batch.set(cardsRef().doc(), { uid: caller.uid, deckId: deckRef.id, front: c.front, back: c.back, fsrs: newStored(), createdAt: now, updatedAt: now });
    }
    await batch.commit();
    return NextResponse.json({ ok: true, data: { id: deckRef.id, cardCount: cards.length } });
  } catch (error) {
    return handleAuthError(error);
  }
}
