import { adminDb, FieldValue, Timestamp } from "@/lib/firebase/admin";
import { notify } from "@/lib/notifications/server";
import { getPublicProfiles } from "@/lib/social/profile";
import { HALL_SIZE, HALL_WEEKS, buildHallOfFame, type Winner } from "./hall";
import { lastWeekId, previousWeekId, rankEntries, weekIdFor, weekStart, xpToPass, type WeeklyEntry } from "./week";

/**
 * Weekly XP GAINED (a per-week delta, never the lifetime total) lives at weeklyBoards/{weekId}/entries/{uid} as
 * { uid, xp, updatedAt }. addWeeklyXp increments it whenever XP is awarded (lib/game/progress.ts trackProgress is
 * the single place). `updatedAt` is when XP last grew, i.e. when the learner reached their current total, which is
 * the tie-break: the earlier to reach the same XP ranks higher.
 *
 * Finished weeks are frozen into weeklyWinners/{weekId} (top 10, opted-out learners excluded) by finalizeWeek.
 */
function entries(weekId: string) {
  return adminDb().collection("weeklyBoards").doc(weekId).collection("entries");
}

/** Called whenever XP is awarded. Never throws. */
export async function addWeeklyXp(uid: string, xp: number): Promise<void> {
  try {
    if (!(xp > 0)) return;
    await entries(weekIdFor()).doc(uid).set({ uid, xp: FieldValue.increment(Math.round(xp)), updatedAt: Timestamp.now() }, { merge: true });
  } catch (err) {
    console.warn("[weekly] addWeeklyXp failed", err instanceof Error ? err.message : err);
  }
}

function millis(v: unknown): number | undefined {
  const t = v as { toMillis?: () => number } | number | undefined;
  if (typeof t === "number") return t;
  return typeof t?.toMillis === "function" ? t.toMillis() : undefined;
}

async function loadTop(weekId: string, limit: number): Promise<WeeklyEntry[]> {
  const snap = await entries(weekId).orderBy("xp", "desc").limit(limit).get();
  return snap.docs.map((d) => ({ uid: String(d.data().uid || d.id), xp: Number(d.data().xp) || 0, reachedAt: millis(d.data().updatedAt) }));
}

export interface WeeklyRow {
  rank: number;
  uid: string;
  displayName: string;
  username: string | null;
  photoURL: string | null;
  level: number;
  xp: number;
  isMe: boolean;
}

export interface WinnerRow {
  rank: number;
  uid: string;
  xp: number;
  displayName: string;
  photoURL: string | null;
  isMe: boolean;
}

export interface FinalizeResult {
  weekId: string;
  winners: Winner[];
  /** true only for the call that actually wrote the hall-of-fame record (and sent the notifications) */
  created: boolean;
}

/**
 * Freezes a completed week into weeklyWinners/{weekId}. Idempotent: an existing record is returned untouched,
 * and `create()` fails if two callers race, so the winners are notified exactly once. Refuses a week that is not over.
 */
export async function finalizeWeek(weekId: string, now: Date = new Date()): Promise<FinalizeResult> {
  if (weekStart(weekId).getTime() >= weekStart(weekIdFor(now)).getTime()) {
    throw new Error(`Week ${weekId} is not finished yet`);
  }
  const ref = adminDb().collection("weeklyWinners").doc(weekId);
  const existing = await ref.get();
  if (existing.exists && Array.isArray(existing.data()?.winners)) {
    return { weekId, winners: existing.data()!.winners as Winner[], created: false };
  }
  const rows = await loadTop(weekId, 60);
  const profiles = await getPublicProfiles(rows.map((r) => r.uid));
  const winners = buildHallOfFame(rows, profiles, HALL_SIZE);
  try {
    await ref.create({ weekId, winners, finalizedAt: Timestamp.now() });
  } catch {
    // someone else finalised it first: they send the notifications
    const again = await ref.get();
    return { weekId, winners: (again.data()?.winners as Winner[]) || winners, created: false };
  }
  const medals = ["🥇", "🥈", "🥉"];
  for (const w of winners.slice(0, 3)) {
    await adminDb()
      .collection("users")
      .doc(w.uid)
      .set({ weeklyWins: FieldValue.increment(w.rank === 1 ? 1 : 0), lastWeeklyPlace: { weekId, rank: w.rank } }, { merge: true })
      .catch(() => null);
    await notify(w.uid, {
      type: "league",
      title: `${medals[w.rank - 1] || "🏆"} Weekly winner! You finished #${w.rank} in ${weekId}`,
      body: `${w.xp} XP gained that week. A new week just started: go again!`,
      href: "/leaderboard?scope=winners",
      icon: "🏆",
    }).catch(() => null);
  }
  return { weekId, winners, created: true };
}

/** Finalises last week plus up to `backfill` earlier weeks that were missed (a cron outage). Safe to repeat. */
export async function finalizeRecentWeeks(now: Date = new Date(), backfill = 3): Promise<FinalizeResult[]> {
  const out: FinalizeResult[] = [];
  let id = lastWeekId(now);
  for (let i = 0; i <= backfill; i++) {
    out.push(await finalizeWeek(id, now));
    id = previousWeekId(id);
  }
  return out;
}

export async function getWeeklyBoard(me: string) {
  const weekId = weekIdFor();
  // Lazy finaliser: the first read after a week ends freezes it (the cron does the same, whichever comes first)
  const lastSettled = await finalizeWeek(lastWeekId()).catch(() => ({ weekId: lastWeekId(), winners: [] as Winner[], created: false }));

  const raw = (await loadTop(weekId, 80)).filter((r) => r.xp > 0);
  const ranked = rankEntries(raw);
  const profiles = await getPublicProfiles([...ranked.map((r) => r.uid), me, ...lastSettled.winners.map((w) => w.uid)]);

  const visible = ranked.filter((r) => {
    const p = profiles.get(r.uid);
    return p && (p.showOnLeaderboard || r.uid === me);
  });
  const rows: WeeklyRow[] = visible.slice(0, 50).map((r, i) => {
    const p = profiles.get(r.uid)!;
    return { rank: i + 1, uid: r.uid, displayName: p.displayName, username: p.username, photoURL: p.photoURL, level: p.level, xp: r.xp, isMe: r.uid === me };
  });

  // "My rank": in the visible list, or counted with range queries (higher XP, plus equal XP reached earlier)
  let mine: WeeklyRow | null = rows.find((r) => r.isMe) || null;
  let aboveXp: number | null = null;
  const idx = rows.findIndex((r) => r.isMe);
  if (idx > 0) aboveXp = rows[idx - 1].xp;
  if (!mine) {
    const meSnap = await entries(weekId).doc(me).get();
    const xp = meSnap.exists ? Number(meSnap.data()?.xp) || 0 : 0;
    const reachedAt = meSnap.exists ? millis(meSnap.data()?.updatedAt) : undefined;
    const p = profiles.get(me);
    if (xp > 0 && p) {
      const higher = await entries(weekId).where("xp", ">", xp).count().get();
      let tiedEarlier = 0;
      if (reachedAt !== undefined) {
        try {
          const tied = await entries(weekId).where("xp", "==", xp).where("updatedAt", "<", Timestamp.fromMillis(reachedAt)).count().get();
          tiedEarlier = tied.data().count;
        } catch {
          // needs the composite index in firestore.indexes.json; without it ties are ranked after the viewer
        }
      }
      mine = { rank: higher.data().count + tiedEarlier + 1, uid: me, displayName: p.displayName, username: p.username, photoURL: p.photoURL, level: p.level, xp, isMe: true };
      try {
        const next = await entries(weekId).where("xp", ">=", xp).orderBy("xp", "asc").limit(2).get();
        const other = next.docs.find((d) => String(d.data().uid || d.id) !== me);
        aboveXp = other ? Number(other.data().xp) || null : null;
      } catch {
        aboveXp = null;
      }
    }
  }

  const winners: WinnerRow[] = lastSettled.winners.slice(0, 3).map((w) => ({
    rank: w.rank,
    uid: w.uid,
    xp: w.xp,
    displayName: profiles.get(w.uid)?.showOnLeaderboard === false && w.uid !== me ? "Hidden learner" : w.displayName,
    photoURL: profiles.get(w.uid)?.showOnLeaderboard === false && w.uid !== me ? null : w.photoURL,
    isMe: w.uid === me,
  }));

  return {
    weekId,
    rows,
    me: mine,
    gap: mine ? { aboveXp, xpToPass: xpToPass(mine.xp, aboveXp) } : null,
    lastWeek: { weekId: lastSettled.weekId, winners },
  };
}

export interface PastWeek {
  weekId: string;
  winners: Array<{ rank: number; xp: number; displayName: string; username: string | null; photoURL: string | null; isMe: boolean }>;
}

/** Hall of fame: the top 10 of each of the last 12 finished weeks. People who have since opted out show as "Hidden learner". */
export async function getPastWinners(me: string, now: Date = new Date()): Promise<PastWeek[]> {
  await finalizeWeek(lastWeekId(now), now).catch(() => null);
  const snap = await adminDb().collection("weeklyWinners").orderBy("weekId", "desc").limit(HALL_WEEKS).get();
  const weeks = snap.docs.map((d) => ({ weekId: String(d.data().weekId || d.id), winners: (d.data().winners || []) as Winner[] }));
  const profiles = await getPublicProfiles([...new Set(weeks.flatMap((w) => w.winners.map((x) => x.uid)))]);
  return weeks.map((w) => ({
    weekId: w.weekId,
    winners: w.winners.map((x) => {
      const hidden = profiles.get(x.uid)?.showOnLeaderboard === false && x.uid !== me;
      return {
        rank: x.rank,
        xp: x.xp,
        displayName: hidden ? "Hidden learner" : x.displayName,
        username: hidden ? null : x.username,
        photoURL: hidden ? null : x.photoURL,
        isMe: x.uid === me,
      };
    }),
  }));
}
