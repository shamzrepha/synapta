import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { dayIdFor } from "@/lib/game/quests";
import { recordActivityDay } from "@/lib/activity/server";
import { activeSeasons, applySeasonDelta, type SeasonCounters } from "./seasons";

/** Feeds seasonal counters from trackProgress events (only seasons that are active today). */
export async function advanceSeasons(uid: string, delta: Partial<Record<string, number>>): Promise<void> {
  const today = dayIdFor();
  for (const season of activeSeasons(today)) {
    if (!season.tasks.some((t) => (delta[t.metric] || 0) > 0)) continue;
    const ref = adminDb().collection("users").doc(uid).collection("seasonProgress").doc(season.id);
    await adminDb().runTransaction(async (t) => {
      const snap = await t.get(ref);
      const counters = (snap.exists ? snap.data()!.counters : {}) as SeasonCounters;
      const next = applySeasonDelta(season, counters || {}, delta, today);
      if (next) t.set(ref, { seasonId: season.id, counters: next, updatedAt: Timestamp.now() }, { merge: true });
    });
  }
}

/** Single hook called (inside try/catch) from trackProgress: heatmap day counter + seasonal quests. */
export async function onProgressEvent(uid: string, delta: Partial<Record<string, number>>, xp: number): Promise<void> {
  await Promise.allSettled([recordActivityDay(uid, xp), advanceSeasons(uid, delta)]);
}
