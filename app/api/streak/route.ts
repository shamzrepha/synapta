import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb } from "@/lib/firebase/admin";
import { dayIdFor } from "@/lib/game/quests";
import { MAX_STREAK_FREEZES } from "@/lib/game/streak";
import { readActivityDays } from "@/lib/activity/server";
import { getShopState } from "@/lib/shop/server";
import { SHOP_ITEMS } from "@/lib/shop/catalog";
import { addDays, buildCalendar, daysToNextFreeze, inferFrozenDays } from "@/lib/streak/logic";
import { readQualifiedDays, readStreakToday, viewStreak } from "@/lib/streak/server";
import { progressMessage, QUALIFY_RULE_START } from "@/lib/streak/qualify";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    const today = dayIdFor();
    const [userSnap, activity, shop] = await Promise.all([
      adminDb().collection("users").doc(caller.uid).get(),
      readActivityDays(caller.uid, 60),
      getShopState(caller.uid),
    ]);
    const u = userSnap.data() || {};
    const view = viewStreak(u, today);
    const streakDays = view.streakDays;
    const lastActiveDate = view.anchor;
    // Calendar: days before the qualified-learning rule keep their old activity data; from then on only qualified days are "studied"
    const recentDays = Array.from({ length: 30 }, (_, i) => addDays(today, -i)).filter((d) => d >= QUALIFY_RULE_START);
    const [qualifiedDays, todayProgress] = await Promise.all([readQualifiedDays(caller.uid, recentDays), readStreakToday(caller.uid)]);
    const active = new Set([
      ...Object.keys(activity.counts).filter((d) => activity.counts[d] > 0 && d < QUALIFY_RULE_START),
      ...qualifiedDays,
      ...(lastActiveDate && streakDays > 0 && lastActiveDate < QUALIFY_RULE_START ? [lastActiveDate] : []),
    ]);
    // Frozen days can only be inferred where we have activity data; use the earliest recorded day
    const since = [...active].sort()[0] || null;
    const frozen = inferFrozenDays({ active, lastActiveDate, streakDays, since });
    const calendar = buildCalendar({ today, active, frozen });

    const freezeItem = SHOP_ITEMS.find((i) => i.kind === "freeze")!;
    const history = [
      ...shop.ledger
        .filter((l) => l.kind === "freeze" || l.kind === "recovery")
        .map((l) => ({ type: l.kind === "freeze" ? "bought" : "recovered", label: l.kind === "freeze" ? "Bought a streak freeze" : "Recovered a broken streak", detail: `-${l.price} XP`, at: l.createdAt })),
      ...[...frozen].sort().reverse().map((d) => ({ type: "used", label: "A freeze protected your streak", detail: d, at: `${d}T12:00:00.000Z` })),
    ].sort((a, b) => String(b.at).localeCompare(String(a.at)));

    return NextResponse.json({
      ok: true,
      data: {
        today,
        streakDays,
        lastActiveDate,
        freezes: u.streakFreezes || 0,
        maxFreezes: MAX_STREAK_FREEZES,
        daysToNextFreeze: daysToNextFreeze(streakDays),
        studiedToday: view.qualifiedToday,
        progress: { points: todayProgress.points, threshold: todayProgress.threshold, remaining: todayProgress.remaining, qualified: todayProgress.qualified, message: progressMessage(todayProgress) },
        freezePrice: freezeItem.price,
        spendable: shop.spendable,
        recovery: shop.recovery,
        calendar,
        history: history.slice(0, 30),
      },
    });
  } catch (error) {
    return handleAuthError(error);
  }
}
