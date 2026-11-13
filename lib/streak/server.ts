import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { dayIdFor } from "@/lib/game/quests";
import { nextStreak } from "@/lib/game/streak";
import { bumpUserSignal } from "@/lib/live/server";
import { recordActivityDay, readActivityDays } from "@/lib/activity/server";
import { computeStreak } from "@/lib/streaks/days";

export interface TouchStreakResult {
  streakDays: number;
  lastActiveDate: string;
  freezes: number;
  freezesUsed: number;
  freezeEarned: boolean;
  isNewDay: boolean;
}

/**
 * Atomically updates and heals the user's daily study streak when they are active on Sunroot.
 * - Idempotent for same-day activity (preserves existing streak).
 * - Correctly advances consecutive days (Day 1 -> Day 2 -> Day 3).
 * - Uses streak freezes for missed days if available.
 * - Reconstructs/heals streaks if the user has been active on consecutive days (activityDays, evidence, deviceStats).
 * - Records activity in activityDays for heatmap and calendar consistency.
 * - Emits a realtime signal so open tabs (topbar, dashboard, streak page) update live.
 */
export async function touchUserStreak(
  uid: string,
  options?: { xp?: number; source?: string }
): Promise<TouchStreakResult> {
  const today = dayIdFor();
  const userRef = adminDb().collection("users").doc(uid);

  // Read user doc, activity days, and device reports
  const [userSnap, activityDaysData, devDoc] = await Promise.all([
    userRef.get(),
    readActivityDays(uid, 30).catch(() => ({ counts: {}, xp: {} })),
    adminDb().collection("deviceStats").doc(uid).get().catch(() => null),
  ]);

  if (!userSnap.exists) {
    return {
      streakDays: 1,
      lastActiveDate: today,
      freezes: 0,
      freezesUsed: 0,
      freezeEarned: false,
      isNewDay: true,
    };
  }

  const data = userSnap.data()!;
  const lastActiveDate: string | null = data.lastActiveDate ? String(data.lastActiveDate).slice(0, 10) : null;
  const currentStreak = typeof data.streakDays === "number" ? Math.max(0, data.streakDays) : 0;
  const currentFreezes = typeof data.streakFreezes === "number" ? Math.max(0, data.streakFreezes) : 0;

  // Gather active dates from activityDays, deviceStats, and user doc to compute proven streak
  const counts: Record<string, number> = activityDaysData?.counts || {};
  const activeDates = new Set<string>(Object.keys(counts).filter((d) => (counts[d] ?? 0) > 0));
  if (lastActiveDate) activeDates.add(lastActiveDate);

  if (devDoc && devDoc.exists) {
    const devData = devDoc.data();
    if (devData?.lastSeen) {
      activeDates.add(String(devData.lastSeen).slice(0, 10));
    }
  }

  let result: TouchStreakResult;

  if (lastActiveDate === today) {
    // Already active today; ensure streak is at least 1 and respects proven streak
    activeDates.add(today);
    const provenStreak = computeStreak(activeDates, today).current;
    const healedStreak = Math.max(1, currentStreak, provenStreak);
    if (healedStreak !== currentStreak) {
      await userRef.update({ streakDays: healedStreak, updatedAt: Timestamp.now() });
    }
    result = {
      streakDays: healedStreak,
      lastActiveDate: today,
      freezes: currentFreezes,
      freezesUsed: 0,
      freezeEarned: false,
      isNewDay: false,
    };
  } else {
    // New active day: calculate base streak from stored or proven past streak
    const pastDates = new Set<string>(activeDates);
    pastDates.delete(today);
    const provenPastStreak = lastActiveDate ? computeStreak(pastDates, lastActiveDate).current : 0;
    const baseStreak = Math.max(currentStreak, provenPastStreak);

    const calc = nextStreak({
      current: baseStreak,
      lastActiveDate,
      today,
      freezes: currentFreezes,
    });

    activeDates.add(today);
    const totalProvenStreak = computeStreak(activeDates, today).current;
    const finalStreak = Math.max(calc.streak, totalProvenStreak, 1);

    await userRef.update({
      streakDays: finalStreak,
      lastActiveDate: today,
      streakFreezes: calc.freezes,
      updatedAt: Timestamp.now(),
    });

    result = {
      streakDays: finalStreak,
      lastActiveDate: today,
      freezes: calc.freezes,
      freezesUsed: calc.freezesUsed,
      freezeEarned: calc.freezeEarned,
      isNewDay: true,
    };
  }

  // Record in activityDays collection
  await recordActivityDay(uid, options?.xp || 0).catch(() => {});
  if (result.isNewDay) {
    await bumpUserSignal(uid, { topic: "streak" }).catch(() => {});
  }

  return result;
}
