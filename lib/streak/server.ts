import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { dayIdFor } from "@/lib/game/quests";
import { nextStreak } from "@/lib/game/streak";
import { bumpUserSignal } from "@/lib/live/server";
import { notify } from "@/lib/notifications/server";
import {
  addLearning,
  dayPoints,
  dayProgress,
  isLearningKind,
  qualifies,
  shouldCountReader,
  streakAnchorDate,
  type DayProgress,
  type LearningCounts,
} from "./qualify";
import { currentStreakDays } from "./logic";

/**
 * Streaks count LEARNING, not logging in. The only writer of streakDays / lastQualifiedDate / lastActiveDate is
 * recordLearning, called from the server paths that credit real learning (quiz answers, flashcard reviews, written
 * practice, labs, lesson reading signals, past-question attempts). Opening the app, presence pings,
 * notifications and logins never call it.
 *
 * Per-day progress lives in streakDays/{uid}_{YYYY-MM-DD}: { uid, day, counts, points, qualified, lastReaderAt }.
 */

export interface LearningResult {
  points: number;
  qualified: boolean;
  newlyQualified: boolean;
  streakDays: number;
}

const dayDocId = (uid: string, day: string) => `${uid}_${day}`;

export async function recordLearning(uid: string, kind: string, opts: { n?: number; now?: Date } = {}): Promise<LearningResult | null> {
  if (!isLearningKind(kind)) return null;
  const now = opts.now ?? new Date();
  const today = dayIdFor(now);
  const userRef = adminDb().collection("users").doc(uid);
  const dayRef = adminDb().collection("streakDays").doc(dayDocId(uid, today));

  const out = await adminDb().runTransaction(async (t) => {
    const [userSnap, daySnap] = await Promise.all([t.get(userRef), t.get(dayRef)]);
    if (!userSnap.exists) return null;
    const user = userSnap.data() || {};
    const day = daySnap.exists ? daySnap.data() || {} : {};
    const before: LearningCounts = (day.counts as LearningCounts) || {};
    const wasQualified = day.qualified === true;
    const storedStreak = typeof user.streakDays === "number" ? Math.max(0, user.streakDays) : 0;

    if (kind === "reader" && !shouldCountReader(typeof day.lastReaderAt === "number" ? day.lastReaderAt : null, now.getTime())) {
      return { points: Math.min(30, dayPoints(before)), qualified: wasQualified, newlyQualified: false, streakDays: storedStreak, calc: null };
    }

    const counts = addLearning(before, kind, opts.n ?? 1);
    const points = dayPoints(counts);
    const qualified = wasQualified || qualifies(counts);
    const newlyQualified = qualified && !wasQualified;

    const dayUpdate: Record<string, unknown> = { uid, day: today, counts, points, qualified, updatedAt: Timestamp.now() };
    if (kind === "reader") dayUpdate.lastReaderAt = now.getTime();
    t.set(dayRef, dayUpdate, { merge: true });

    let streakDays = storedStreak;
    let calc: ReturnType<typeof nextStreak> | null = null;
    if (newlyQualified) {
      calc = nextStreak({
        current: storedStreak,
        lastActiveDate: streakAnchorDate(user),
        today,
        freezes: typeof user.streakFreezes === "number" ? user.streakFreezes : 0,
      });
      streakDays = calc.streak;
      // lastActiveDate mirrors lastQualifiedDate so older readers (shop recovery, admin) keep working
      t.update(userRef, { streakDays, streakFreezes: calc.freezes, lastQualifiedDate: today, lastActiveDate: today, updatedAt: Timestamp.now() });
    }
    return { points: Math.min(30, points), qualified, newlyQualified, streakDays, calc };
  });

  if (!out) return null;
  if (out.newlyQualified) {
    await bumpUserSignal(uid, { topic: "streak" }).catch(() => {});
    if (out.calc?.freezesUsed) {
      await notify(uid, {
        type: "system",
        title: `Streak freeze used: your ${out.streakDays}-day streak is safe`,
        body: `${out.calc.freezes} freeze${out.calc.freezes === 1 ? "" : "s"} left.`,
        href: "/streak",
        icon: "🧊",
      }).catch(() => null);
    } else if (out.calc?.freezeEarned) {
      await notify(uid, {
        type: "system",
        title: `You earned a streak freeze for your ${out.streakDays}-day streak`,
        body: "It saves your streak automatically if you miss a day.",
        href: "/streak",
        icon: "🧊",
      }).catch(() => null);
    }
  }
  return { points: out.points, qualified: out.qualified, newlyQualified: out.newlyQualified, streakDays: out.streakDays };
}

export interface StreakToday extends DayProgress {
  counts: LearningCounts;
}

/** Read-only: today's learning points. Never creates, extends or heals a streak. */
export async function readStreakToday(uid: string, now: Date = new Date()): Promise<StreakToday> {
  try {
    const snap = await adminDb().collection("streakDays").doc(dayDocId(uid, dayIdFor(now))).get();
    const d = snap.exists ? snap.data() || {} : {};
    const counts = (d.counts as LearningCounts) || {};
    return { ...dayProgress(counts, d.qualified === true), counts };
  } catch {
    return { ...dayProgress({}), counts: {} };
  }
}

/** Days (YYYY-MM-DD) in the list that were qualified by learning, for the streak calendar. */
export async function readQualifiedDays(uid: string, days: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (days.length === 0) return out;
  try {
    const refs = days.map((d) => adminDb().collection("streakDays").doc(dayDocId(uid, d)));
    const snaps = await adminDb().getAll(...refs);
    snaps.forEach((s, i) => {
      if (s.exists && s.data()?.qualified === true) out.add(days[i]);
    });
  } catch (err) {
    console.warn("[streak] read qualified days failed", err instanceof Error ? err.message : err);
  }
  return out;
}

export interface StreakView {
  streakDays: number;
  /** last day that extended the streak (qualified day, or legacy lastActiveDate) */
  anchor: string | null;
  qualifiedToday: boolean;
  /** has a streak but has not qualified today */
  atRisk: boolean;
}

/** Pure read of a user doc: the live streak, with freezes covering gaps. Never writes. */
export function viewStreak(u: Record<string, unknown>, today: string = dayIdFor()): StreakView {
  const anchor = streakAnchorDate(u);
  const freezes = typeof u.streakFreezes === "number" ? u.streakFreezes : 0;
  const stored = typeof u.streakDays === "number" ? u.streakDays : 0;
  const streakDays = currentStreakDays({ streakDays: stored, lastActiveDate: anchor, freezes, today });
  const qualifiedToday = anchor === today;
  return { streakDays, anchor, qualifiedToday, atRisk: streakDays > 0 && !qualifiedToday };
}
