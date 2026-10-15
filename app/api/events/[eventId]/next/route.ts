import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError } from "@/lib/api/errors";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { loadEvent, statusOf, toDate } from "@/lib/events/store";

export const runtime = "nodejs";

/**
 * Serves the caller's current quiz-sprint question (never the answer). The server stamps when it
 * was first served, so the speed score can't be faked by the client.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const { eventId } = await params;
    const caller = await requireUser(req);
    const { ref, ev } = await loadEvent(caller, eventId);
    if (ev.kind !== "quiz_sprint") throw new ApiError(400, "BAD_KIND", "Not a quiz sprint.");
    if (statusOf(ev) !== "live") throw new ApiError(409, "NOT_LIVE", "This sprint isn't running right now.");

    const qSnap = await ref.collection("private").doc("questions").get();
    const questions = (qSnap.data()?.questions || []) as Array<{ question: string; options: string[]; difficulty?: string }>;
    const entryRef = ref.collection("entries").doc(caller.uid);

    const out = await adminDb().runTransaction(async (t) => {
      const e = await t.get(entryRef);
      if (!e.exists) throw new ApiError(409, "NOT_JOINED", "Join the sprint first.");
      const entry = e.data()!;
      const index = entry.currentIndex || 0;
      if (index >= questions.length || entry.finishedAt) return { done: true as const };
      let servedAt: Date;
      if (entry.servedIndex === index && entry.servedAt) {
        servedAt = toDate(entry.servedAt);
      } else {
        servedAt = new Date();
        t.update(entryRef, { servedIndex: index, servedAt: Timestamp.fromDate(servedAt) });
      }
      return { done: false as const, index, servedAt };
    });

    if (out.done) return NextResponse.json({ ok: true, data: { done: true, total: questions.length } });
    const q = questions[out.index];
    const limitMs = (ev.secondsPerQuestion || 20) * 1000;
    return NextResponse.json({
      ok: true,
      data: {
        done: false,
        index: out.index,
        total: questions.length,
        question: q.question,
        options: q.options,
        difficulty: q.difficulty || "medium",
        limitMs,
        // Remaining time from the server's clock (survives refreshes)
        remainingMs: Math.max(0, limitMs - (Date.now() - out.servedAt.getTime())),
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
