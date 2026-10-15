import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb } from "@/lib/firebase/admin";
import { levelFromXp } from "@/lib/game/levels";
import { BADGES, normalizeStats } from "@/lib/game/badges";
import { getDailyQuests } from "@/lib/game/progress";
import { tierInfo, weekEndsAt, weekIdFor } from "@/lib/game/leagues";

export const runtime = "nodejs";

/** Everything the dashboard/profile needs to render the player's game state. */
export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const userSnap = await adminDb().collection("users").doc(caller.uid).get();
    const u = userSnap.data() || {};
    const weekId = weekIdFor();
    const [quests, entrySnap] = await Promise.all([
      getDailyQuests(caller.uid),
      adminDb().collection("leagueEntries").doc(`${weekId}_${caller.uid}`).get(),
    ]);

    let league: { rank: number; cohortSize: number; weeklyXp: number } | null = null;
    if (entrySnap.exists) {
      const e = entrySnap.data()!;
      const cohort = adminDb().collection("leagueEntries").where("cohortId", "==", e.cohortId);
      const [size, above] = await Promise.all([
        cohort.count().get(),
        cohort.where("xp", ">", e.xp || 0).count().get(),
      ]);
      league = { rank: above.data().count + 1, cohortSize: size.data().count, weeklyXp: e.xp || 0 };
    }

    const tier = typeof u.leagueTier === "number" ? u.leagueTier : 0;
    const owned = (u.badges || {}) as Record<string, { toDate?: () => Date }>;
    return NextResponse.json({
      ok: true,
      data: {
        xp: u.xp || 0,
        streakDays: u.streakDays || 0,
        level: levelFromXp(u.xp || 0),
        stats: normalizeStats(u.stats),
        badges: BADGES.map((b) => ({
          id: b.id,
          name: b.name,
          description: b.description,
          emoji: b.emoji,
          rarity: b.rarity,
          earnedAt: owned[b.id]?.toDate?.().toISOString() || null,
        })),
        quests,
        league: {
          tier,
          ...tierInfo(tier),
          weekId,
          endsAt: weekEndsAt().toISOString(),
          standing: league,
        },
        settings: {
          showOnLeaderboard: u.settings?.showOnLeaderboard !== false,
          autoShareAchievements: u.settings?.autoShareAchievements !== false,
        },
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
