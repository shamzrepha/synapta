import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { ApiError } from "@/lib/api/errors";
import { notify } from "@/lib/notifications/server";
import { trackProgress } from "@/lib/game/progress";
import { dayIdFor } from "@/lib/game/quests";
import {
  SEASONS,
  daysLeft,
  seasonComplete,
  seasonStatus,
  taskProgress,
  type SeasonDef,
  type SeasonCounters,
} from "./seasons";

function progressRef(uid: string, seasonId: string) {
  return adminDb().collection("users").doc(uid).collection("seasonProgress").doc(seasonId);
}

export interface SeasonView {
  id: string;
  name: string;
  emoji: string;
  blurb: string;
  start: string;
  end: string;
  status: "upcoming" | "active" | "ended";
  daysLeft: number;
  rewardXp: number;
  badge: SeasonDef["badge"];
  tasks: ReturnType<typeof taskProgress>;
  complete: boolean;
  claimed: boolean;
}

export async function getSeasonViews(uid: string): Promise<SeasonView[]> {
  const today = dayIdFor();
  const visible = SEASONS.filter((s) => seasonStatus(s, today) !== "upcoming");
  const snaps = visible.length ? await adminDb().getAll(...visible.map((s) => progressRef(uid, s.id))) : [];
  return visible
    .map((s, i) => {
      const d = snaps[i]?.exists ? snaps[i].data()! : {};
      const counters = (d.counters || {}) as SeasonCounters;
      return {
        id: s.id,
        name: s.name,
        emoji: s.emoji,
        blurb: s.blurb,
        start: s.start,
        end: s.end,
        status: seasonStatus(s, today),
        daysLeft: daysLeft(s, today),
        rewardXp: s.rewardXp,
        badge: s.badge,
        tasks: taskProgress(s, counters),
        complete: seasonComplete(s, counters),
        claimed: !!d.claimed,
      };
    })
    .sort((a, b) => b.start.localeCompare(a.start));
}

/** Idempotent: the claimed flag flips inside a transaction, so the reward is granted at most once. */
export async function claimSeason(uid: string, seasonId: string): Promise<{ alreadyClaimed: boolean; rewardXp: number }> {
  const season = SEASONS.find((s) => s.id === seasonId);
  if (!season) throw new ApiError(404, "NOT_FOUND", "Unknown season.");
  if (seasonStatus(season, dayIdFor()) === "upcoming") throw new ApiError(409, "NOT_STARTED", "This season hasn't started yet.");
  const ref = progressRef(uid, season.id);
  const userRef = adminDb().collection("users").doc(uid);

  const first = await adminDb().runTransaction(async (t) => {
    const snap = await t.get(ref);
    const d = snap.exists ? snap.data()! : {};
    if (d.claimed) return false;
    if (!seasonComplete(season, (d.counters || {}) as SeasonCounters)) {
      throw new ApiError(409, "INCOMPLETE", "Finish every task first.");
    }
    t.set(ref, { seasonId: season.id, counters: d.counters || {}, claimed: true, claimedAt: Timestamp.now() }, { merge: true });
    t.update(userRef, { [`badges.${season.badge.id}`]: Timestamp.now() });
    return true;
  });
  if (!first) return { alreadyClaimed: true, rewardXp: 0 };

  await trackProgress({ uid, xpToAward: season.rewardXp, countsForQuests: false, reason: `season:${season.id}` });
  await notify(uid, {
    type: "badge",
    title: `Season complete: ${season.badge.emoji} ${season.badge.name}`,
    body: `+${season.rewardXp} XP and a special badge.`,
    href: "/quests",
    icon: season.badge.emoji,
  });
  return { alreadyClaimed: false, rewardXp: season.rewardXp };
}
