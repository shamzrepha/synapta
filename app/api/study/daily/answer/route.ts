import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb } from "@/lib/firebase/admin";
import { ApiError, parseJson } from "@/lib/api/errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { trackProgress } from "@/lib/game/progress";
import { recordMistake } from "@/lib/mistakes/store";
import { completeToday, dailyXp, type DailyStreak } from "@/lib/daily/logic";
import { dailyRef, streakRef, utcDay, type DailyDoc } from "@/lib/daily/store";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({ index: z.number().int().min(0).max(9), selectedIndex: z.number().int().min(0).max(3) });

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "daily-answer", limit: 60, windowMs: 10 * 60 * 1000 });
    if (limited) return limited;
    const { index, selectedIndex } = await parseJson(req, schema);
    const today = utcDay();
    const ref = dailyRef(caller.uid, today);
    const sRef = streakRef(caller.uid);

    const out = await adminDb().runTransaction(async (t) => {
      const [snap, sSnap] = await Promise.all([t.get(ref), t.get(sRef)]);
      if (!snap.exists) throw new ApiError(404, "NOT_FOUND", "No challenge for today yet.");
      const doc = snap.data() as DailyDoc;
      const q = doc.questions[index];
      if (!q) throw new ApiError(400, "INVALID_QUESTION", "Invalid question");
      const existing = doc.answers[String(index)];
      if (existing) {
        return { q, correct: existing.correct, fresh: false, finished: null as null | { xp: number; correct: number; total: number; streak: number } };
      }
      const correct = selectedIndex === q.correctIndex;
      const answers = { ...doc.answers, [String(index)]: { selectedIndex, correct } };
      const total = doc.questions.length;
      let finished: null | { xp: number; correct: number; total: number; streak: number } = null;
      const update: Record<string, unknown> = { [`answers.${index}`]: { selectedIndex, correct } };
      if (Object.keys(answers).length >= total && !doc.rewarded) {
        const right = Object.values(answers).filter((a) => a.correct).length;
        const xp = dailyXp(right, total);
        const streak: DailyStreak = completeToday(sSnap.exists ? (sSnap.data() as DailyStreak) : null, today);
        update.completed = true;
        update.rewarded = true;
        update.xp = xp;
        t.set(sRef, streak);
        finished = { xp, correct: right, total, streak: streak.streak };
      }
      t.update(ref, update);
      return { q, correct, fresh: true, finished };
    });

    if (out.fresh && !out.correct) {
      await recordMistake({
        uid: caller.uid,
        question: out.q.question,
        options: out.q.options,
        correctIndex: out.q.correctIndex,
        selectedIndex,
        explanation: out.q.explanation,
        classId: out.q.classId,
        kcId: out.q.kcId,
        topic: out.q.topic,
        source: "daily",
      });
    }
    if (out.finished) {
      await trackProgress({
        uid: caller.uid,
        xpToAward: out.finished.xp,
        stats: { quizAnswered: out.finished.total, quizCorrect: out.finished.correct },
        reason: "daily_challenge",
      });
    }

    return NextResponse.json({
      ok: true,
      data: { correct: out.correct, correctIndex: out.q.correctIndex, explanation: out.q.explanation, finished: out.finished },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
