import { NextRequest, NextResponse } from "next/server";
import { requireUser, handleAuthError } from "@/lib/auth/requireUser";
import { adminDb } from "@/lib/firebase/admin";
import { dayIdFor } from "@/lib/game/quests";
import { MAX_STREAK_FREEZES } from "@/lib/game/streak";
import { readActivityDays } from "@/lib/activity/server";
import { getShopState } from "@/lib/shop/server";
import { SHOP_ITEMS } from "@/lib/shop/catalog";
import { buildCalendar, daysToNextFreeze, inferFrozenDays } from "@/lib/streak/logic";

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
    const active = new Set(Object.keys(activity.counts).filter((d) => activity.counts[d] > 0));
    // Frozen days can only be inferred where we have activity data; use the earliest recorded day
    const since = [...active].sort()[0] || null;
    const lastActiveDate: string | null = u.lastActiveDate || null;
    const streakDays: number = u.streakDays || 0;
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
        studiedToday: lastActiveDate === today,
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
