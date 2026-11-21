import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/security/cron";
import { adminDb } from "@/lib/firebase/admin";
import { notify } from "@/lib/notifications/server";
import { dayIdFor } from "@/lib/game/quests";
import { addDays } from "@/lib/streak/logic";
import { streakAnchorDate } from "@/lib/streak/qualify";
import { reminderCopy, shouldRemind } from "@/lib/streak/reminder";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Daily cron (e.g. 18:00 UTC): reminds learners whose streak is at risk because they have NOT earned today's
 * learning points (a streak is extended only by qualified learning, never by opening the app). Candidates are
 * learners whose streak was extended yesterday; their progress today comes from streakDays/{uid}_{today}.
 * Requires `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Invalid cron secret" } }, { status: 401 });
  }
  const today = dayIdFor();
  const yesterday = addDays(today, -1);
  // lastActiveDate mirrors the last qualified day (and is the legacy value for older streaks)
  const snap = await adminDb().collection("users").where("lastActiveDate", "==", yesterday).limit(2000).get();
  const docs = snap.docs;
  const points = new Map<string, number>();
  for (let i = 0; i < docs.length; i += 200) {
    const batch = docs.slice(i, i + 200);
    const snaps = await adminDb().getAll(...batch.map((d) => adminDb().collection("streakDays").doc(`${d.id}_${today}`)));
    snaps.forEach((s, j) => points.set(batch[j].id, s.exists ? Number(s.data()?.points) || 0 : 0));
  }
  let sent = 0;
  for (const d of docs) {
    const u = d.data();
    const input = {
      streakDays: Number(u.streakDays) || 0,
      freezes: Number(u.streakFreezes) || 0,
      points: points.get(d.id) ?? 0,
      remindersOn: u.settings?.streakReminders !== false,
      anchor: streakAnchorDate(u),
      today,
      yesterday,
    };
    if (!shouldRemind(input)) continue;
    const copy = reminderCopy(input);
    await notify(d.id, { type: "system", title: copy.title, body: copy.body, href: "/streak", icon: "🔥" });
    sent++;
  }
  return NextResponse.json({ ok: true, data: { sent } });
}
