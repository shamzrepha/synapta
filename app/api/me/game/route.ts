import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb } from "@/lib/firebase/admin";
import { levelFromXp } from "@/lib/game/levels";
import { BADGES, normalizeStats } from "@/lib/game/badges";
import { getDailyQuests } from "@/lib/game/progress";
import { tierInfo, weekEndsAt, weekIdFor } from "@/lib/game/leagues";
import { readStreakToday, viewStreak } from "@/lib/streak/server";
import { progressMessage } from "@/lib/streak/qualify";

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
    // Read-only: opening the app never creates, extends or heals a streak
    const view = viewStreak(u);
    const streakDays = view.streakDays;
    const today = await readStreakToday(caller.uid);
    return NextResponse.json({
      ok: true,
      data: {
        xp: u.xp || 0,
        streakDays,
        streakFreezes: u.streakFreezes || 0,
        // Has a streak but has not earned today's 30 learning points yet
        streakAtRisk: view.atRisk,
        streakToday: { points: today.points, threshold: today.threshold, remaining: today.remaining, qualified: today.qualified, message: progressMessage(today) },
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
          autoShareAchievements: u.settings?.autoShareAchievements === true,
        },
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
