import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { assertClassAccess } from "@/lib/auth/classAccess";
import { adminDb } from "@/lib/firebase/admin";
import { getPublicProfiles, type PublicProfile } from "@/lib/social/profile";
import { tierInfo, weekEndsAt, weekIdFor } from "@/lib/game/leagues";

export const runtime = "nodejs";

interface Row {
  rank: number;
  uid: string;
  displayName: string;
  username: string | null;
  photoURL: string | null;
  level: number;
  xp: number;
  weeklyXp: number;
  tier: number;
  streakDays: number;
  isMe: boolean;
}

function toRows(
  items: Array<{ uid: string; score: number; weeklyXp: number }>,
  profiles: Map<string, PublicProfile>,
  me: string
): Row[] {
  return items
    .filter((i) => {
      const p = profiles.get(i.uid);
      // People who opted out are hidden from everyone but themselves
      return p && (p.showOnLeaderboard || i.uid === me);
    })
    .sort((a, b) => b.score - a.score)
    .map((i, idx) => {
      const p = profiles.get(i.uid)!;
      return {
        rank: idx + 1,
        uid: i.uid,
        displayName: p.displayName,
        username: p.username,
        photoURL: p.photoURL,
        level: p.level,
        xp: p.xp,
        weeklyXp: i.weeklyXp,
        tier: p.leagueTier,
        streakDays: p.streakDays,
        isMe: i.uid === me,
      };
    });
}

async function weeklyXpFor(uids: string[], weekId: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (let i = 0; i < uids.length; i += 100) {
    const refs = uids.slice(i, i + 100).map((u) => adminDb().collection("leagueEntries").doc(`${weekId}_${u}`));
    if (refs.length === 0) continue;
    const snaps = await adminDb().getAll(...refs);
    snaps.forEach((s) => {
      if (s.exists) out.set(s.data()!.uid, s.data()!.xp || 0);
    });
  }
  return out;
}

/**
 * Scopes: league (your weekly cohort), weekly (everyone this week), global (all-time XP),
 * class (members of a class) and friends.
 */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const scope = req.nextUrl.searchParams.get("scope") || "league";
    const period = req.nextUrl.searchParams.get("period") === "all" ? "all" : "week";
    const weekId = weekIdFor();
    let rows: Row[] = [];
    let channel = "leaderboard:global";
    let meta: Record<string, unknown> = { weekId, endsAt: weekEndsAt().toISOString() };

    if (scope === "league") {
      const me = await adminDb().collection("leagueEntries").doc(`${weekId}_${caller.uid}`).get();
      const userSnap = await adminDb().collection("users").doc(caller.uid).get();
      const tier = userSnap.data()?.leagueTier || 0;
      meta = { ...meta, tier, ...tierInfo(tier), joined: me.exists };
      if (me.exists) {
        const cohortId = me.data()!.cohortId;
        channel = `league:${cohortId}`;
        const snap = await adminDb().collection("leagueEntries").where("cohortId", "==", cohortId).orderBy("xp", "desc").limit(40).get();
        const items = snap.docs.map((d) => ({ uid: d.data().uid, score: d.data().xp || 0, weeklyXp: d.data().xp || 0 }));
        rows = toRows(items, await getPublicProfiles(items.map((i) => i.uid)), caller.uid);
      }
    } else if (scope === "weekly") {
      channel = `leaderboard:week:${weekId}`;
      const snap = await adminDb().collection("leagueEntries").where("weekId", "==", weekId).orderBy("xp", "desc").limit(60).get();
      const items = snap.docs.map((d) => ({ uid: d.data().uid, score: d.data().xp || 0, weeklyXp: d.data().xp || 0 }));
      rows = toRows(items, await getPublicProfiles(items.map((i) => i.uid)), caller.uid).slice(0, 50);
    } else if (scope === "global") {
      const snap = await adminDb().collection("users").orderBy("xp", "desc").limit(80).get();
      const uids = snap.docs.map((d) => d.id);
      const profiles = new Map<string, PublicProfile>();
      const { toPublicProfile } = await import("@/lib/social/profile");
      snap.docs.forEach((d) => profiles.set(d.id, toPublicProfile(d.id, d.data())));
      const weekly = await weeklyXpFor(uids, weekId);
      rows = toRows(
        uids.map((u) => ({ uid: u, score: profiles.get(u)!.xp, weeklyXp: weekly.get(u) || 0 })),
        profiles,
        caller.uid
      ).slice(0, 50);
    } else if (scope === "class" || scope === "friends") {
      let uids: string[] = [];
      if (scope === "class") {
        const classId = req.nextUrl.searchParams.get("classId") || "";
        await assertClassAccess(caller, classId, "view");
        channel = "leaderboard:global";
        const snap = await adminDb().collection("enrollments").where("classId", "==", classId).where("status", "==", "active").get();
        uids = snap.docs.map((d) => d.data().uid).filter(Boolean);
      } else {
        const snap = await adminDb().collection("users").doc(caller.uid).collection("friends").get();
        uids = [caller.uid, ...snap.docs.map((d) => d.id)];
      }
      const [profiles, weekly] = await Promise.all([getPublicProfiles(uids), weeklyXpFor(uids, weekId)]);
      rows = toRows(
        uids.map((u) => ({
          uid: u,
          score: period === "all" ? profiles.get(u)?.xp || 0 : weekly.get(u) || 0,
          weeklyXp: weekly.get(u) || 0,
        })),
        profiles,
        caller.uid
      );
    }

    return NextResponse.json({ ok: true, data: { scope, rows, me: rows.find((r) => r.isMe) || null, channel, meta } });
  } catch (error) {
    return handleAuthError(error);
  }
}
