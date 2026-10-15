import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { checkRateLimit } from "@/lib/rateLimit";
import { buildDailyQuestions } from "@/lib/daily/build";
import { dailyRef, readStreak, toView, utcDay, type DailyDoc } from "@/lib/daily/store";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Today's challenge. Generated once per day and cached, so reloading never regenerates it. */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const today = utcDay();
    const ref = dailyRef(caller.uid, today);
    const [snap, streak] = await Promise.all([ref.get(), readStreak(caller.uid)]);
    if (snap.exists) return NextResponse.json({ ok: true, data: toView(snap.data() as DailyDoc, streak, today) });

    const limited = await checkRateLimit(req, { uid: caller.uid, keyPrefix: "daily-build", limit: 5, windowMs: 10 * 60 * 1000 });
    if (limited) return limited;

    const { questions, origin } = await buildDailyQuestions(caller.uid);
    const doc: DailyDoc = {
      uid: caller.uid,
      day: today,
      origin,
      questions,
      answers: {},
      completed: false,
      createdAt: new Date().toISOString(),
    };
    try {
      await ref.create(doc); // fails if a parallel request already stored today's set
    } catch {
      const again = await ref.get();
      if (again.exists) return NextResponse.json({ ok: true, data: toView(again.data() as DailyDoc, streak, today) });
      throw new Error("Could not save today's challenge");
    }
    return NextResponse.json({ ok: true, data: toView(doc, streak, today) });
  } catch (error) {
    return handleAuthError(error);
  }
}
