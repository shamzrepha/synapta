import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { ApiError, parseJson } from "@/lib/api/errors";
import { adminDb, FieldValue, Timestamp } from "@/lib/firebase/admin";
import { loadEvent, statusOf, toDate } from "@/lib/events/store";
import { scoreAnswer } from "@/lib/events/scoring";
import { bumpChannel } from "@/lib/live/server";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({
  index: z.number().int().min(0),
  // -1 = ran out of time without answering
  choice: z.number().int().min(-1).max(5),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const { eventId } = await params;
    const caller = await requireUser(req);
    const { index, choice } = await parseJson(req, schema);
    const { ref, ev } = await loadEvent(caller, eventId);
    if (ev.kind !== "quiz_sprint") throw new ApiError(400, "BAD_KIND", "Not a quiz sprint.");
    if (statusOf(ev) !== "live") throw new ApiError(409, "NOT_LIVE", "This sprint has ended.");

    const qSnap = await ref.collection("private").doc("questions").get();
    const questions = (qSnap.data()?.questions || []) as Array<{ correctIndex: number; explanation: string }>;
    const limitMs = (ev.secondsPerQuestion || 20) * 1000;
    const entryRef = ref.collection("entries").doc(caller.uid);

    const result = await adminDb().runTransaction(async (t) => {
      const e = await t.get(entryRef);
      if (!e.exists) throw new ApiError(409, "NOT_JOINED", "Join the sprint first.");
      const entry = e.data()!;
      const current = entry.currentIndex || 0;
      if (index !== current) throw new ApiError(409, "OUT_OF_ORDER", "That question was already answered.");
      if (entry.servedIndex !== index || !entry.servedAt) throw new ApiError(409, "NOT_SERVED", "Load the question first.");
      const q = questions[index];
      if (!q) throw new ApiError(400, "INVALID_QUESTION", "No such question.");

      const elapsedMs = Date.now() - toDate(entry.servedAt).getTime();
      const correct = choice === q.correctIndex;
      const scored = scoreAnswer({ correct, elapsedMs, limitMs, streakBefore: entry.streak || 0 });
      const nextIndex = index + 1;
      const finished = nextIndex >= questions.length;
      t.update(entryRef, {
        score: FieldValue.increment(scored.points),
        correct: FieldValue.increment(correct && !scored.late ? 1 : 0),
        answered: FieldValue.increment(1),
        streak: scored.streak,
        currentIndex: nextIndex,
        servedAt: null,
        lastAnswerAt: Timestamp.now(),
        ...(finished ? { finishedAt: Timestamp.now() } : {}),
      });
      return {
        correct: correct && !scored.late,
        late: scored.late,
        points: scored.points,
        streak: scored.streak,
        totalScore: (entry.score || 0) + scored.points,
        correctIndex: q.correctIndex,
        explanation: q.explanation,
        finished,
      };
    });

    await bumpChannel(`event:${eventId}`);
    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    return handleAuthError(error);
  }
}
