import { adminDb, FieldValue } from "@/lib/firebase/admin";
import { dayIdFor } from "@/lib/game/quests";
import { addDays } from "@/lib/streak/logic";
import type { DayCounts } from "./heatmap";

/** Increments today's activity counter: activityDays/{uid}/days/{YYYY-MM-DD}. */
export async function recordActivityDay(uid: string, xp = 0): Promise<void> {
  const day = dayIdFor();
  await adminDb()
    .collection("activityDays")
    .doc(uid)
    .collection("days")
    .doc(day)
    .set({ date: day, count: FieldValue.increment(1), xp: FieldValue.increment(Math.max(0, Math.round(xp))) }, { merge: true });
}

export interface ActivityDayData {
  counts: DayCounts;
  xp: Record<string, number>;
}

/**
 * Reads per-day activity for the last `days` days. Falls back to (and merges with, taking the max)
 * the evidence log so history from before activity tracking existed still shows up.
 */
export async function readActivityDays(uid: string, days = 371): Promise<ActivityDayData> {
  const today = dayIdFor();
  const first = addDays(today, -(days - 1));
  const counts: DayCounts = {};
  const xp: Record<string, number> = {};

  try {
    const snap = await adminDb().collection("activityDays").doc(uid).collection("days").orderBy("date", "desc").limit(days + 5).get();
    for (const d of snap.docs) {
      const x = d.data();
      const date = String(x.date || d.id);
      if (date < first || date > today) continue;
      counts[date] = Math.max(0, Number(x.count) || 0);
      xp[date] = Math.max(0, Number(x.xp) || 0);
    }
  } catch (err) {
    console.warn("[activity] read days failed", err instanceof Error ? err.message : err);
  }

  try {
    const ev = await adminDb().collection("evidence").where("uid", "==", uid).limit(1500).get();
    const evCounts: DayCounts = {};
    const evXp: Record<string, number> = {};
    for (const d of ev.docs) {
      const x = d.data();
      const date = (x.createdAt as { toDate?: () => Date } | undefined)?.toDate?.().toISOString().slice(0, 10);
      if (!date || date < first || date > today) continue;
      evCounts[date] = (evCounts[date] || 0) + 1;
      evXp[date] = (evXp[date] || 0) + (Number(x.xpEarned) || 0);
    }
    for (const [date, c] of Object.entries(evCounts)) {
      counts[date] = Math.max(counts[date] || 0, c);
      xp[date] = Math.max(xp[date] || 0, evXp[date] || 0);
    }
  } catch (err) {
    console.warn("[activity] evidence backfill failed", err instanceof Error ? err.message : err);
  }

  return { counts, xp };
}
