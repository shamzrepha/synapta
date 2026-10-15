import { adminDb, FieldValue, Timestamp } from "@/lib/firebase/admin";
import { notify } from "@/lib/notifications/server";
import { getPublicProfiles } from "@/lib/social/profile";
import { lastWeekId, pickWinners, weekIdFor } from "./week";

/**
 * Weekly XP lives at weeklyBoards/{weekId}/entries/{uid} ({ uid, xp }) so a board is one simple
 * orderBy("xp") query. weeklyBoards/{weekId} itself holds the settled winners once the week is over.
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

/**
 * Lazily settles last week: the first fetch in a new week records the top 3 and notifies them.
 * `create()` fails if the doc already exists, so concurrent/repeat calls notify exactly once.
 */
export async function settleLastWeek(): Promise<{ weekId: string; winners: Array<{ uid: string; xp: number; rank: number }> }> {
  const weekId = lastWeekId();
  const ref = adminDb().collection("weeklyBoards").doc(weekId);
  const existing = await ref.get();
  if (existing.exists && Array.isArray(existing.data()?.winners)) {
    return { weekId, winners: existing.data()!.winners };
  }
  const snap = await entries(weekId).orderBy("xp", "desc").limit(20).get();
  const rows = snap.docs.map((d) => ({ uid: String(d.data().uid || d.id), xp: Number(d.data().xp) || 0 }));
  const profiles = await getPublicProfiles(rows.map((r) => r.uid));
  const visible = rows.filter((r) => profiles.get(r.uid)?.showOnLeaderboard);
  const winners = pickWinners(visible);
  try {
    await ref.create({ weekId, winners, settledAt: Timestamp.now() });
  } catch {
    // someone else settled it first: they send the notifications
    const again = await ref.get();
    return { weekId, winners: (again.data()?.winners as typeof winners) || winners };
  }
  const medals = ["🥇", "🥈", "🥉"];
  for (const w of winners) {
    await adminDb()
      .collection("users")
      .doc(w.uid)
      .set({ weeklyWins: FieldValue.increment(w.rank === 1 ? 1 : 0), lastWeeklyPlace: { weekId, rank: w.rank } }, { merge: true })
      .catch(() => null);
    await notify(w.uid, {
      type: "league",
      title: `${medals[w.rank - 1] || "🏆"} Weekly winner! You finished #${w.rank} in ${weekId}`,
      body: `${w.xp} XP last week. A new week just started: go again!`,
      href: "/leaderboard?period=week",
      icon: "🏆",
    });
  }
  return { weekId, winners };
}

export async function getWeeklyBoard(me: string) {
  const weekId = weekIdFor();
  const lastSettled = await settleLastWeek().catch(() => ({ weekId: lastWeekId(), winners: [] as Array<{ uid: string; xp: number; rank: number }> }));

  const snap = await entries(weekId).orderBy("xp", "desc").limit(80).get();
  const raw = snap.docs.map((d) => ({ uid: String(d.data().uid || d.id), xp: Number(d.data().xp) || 0 })).filter((r) => r.xp > 0);
  const uids = [...raw.map((r) => r.uid), me, ...lastSettled.winners.map((w) => w.uid)];
  const profiles = await getPublicProfiles(uids);

  const visible = raw.filter((r) => {
    const p = profiles.get(r.uid);
    return p && (p.showOnLeaderboard || r.uid === me);
  });
  const rows: WeeklyRow[] = visible.slice(0, 50).map((r, i) => {
    const p = profiles.get(r.uid)!;
    return { rank: i + 1, uid: r.uid, displayName: p.displayName, username: p.username, photoURL: p.photoURL, level: p.level, xp: r.xp, isMe: r.uid === me };
  });

  // "My rank": in the top list, or counted with a simple range query
  let mine: WeeklyRow | null = rows.find((r) => r.isMe) || null;
  if (!mine) {
    const meSnap = await entries(weekId).doc(me).get();
    const xp = meSnap.exists ? Number(meSnap.data()?.xp) || 0 : 0;
    const p = profiles.get(me);
    if (xp > 0 && p) {
      const higher = await entries(weekId).where("xp", ">", xp).count().get();
      mine = { rank: higher.data().count + 1, uid: me, displayName: p.displayName, username: p.username, photoURL: p.photoURL, level: p.level, xp, isMe: true };
    }
  }

  const winners: WinnerRow[] = lastSettled.winners.map((w) => {
    const p = profiles.get(w.uid);
    return { rank: w.rank, uid: w.uid, xp: w.xp, displayName: p?.displayName || "Learner", photoURL: p?.photoURL || null, isMe: w.uid === me };
  });

  return { weekId, rows, me: mine, lastWeek: { weekId: lastSettled.weekId, winners } };
}
