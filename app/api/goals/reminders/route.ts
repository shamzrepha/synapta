import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { notify } from "@/lib/notifications/server";
import { dayIdFor } from "@/lib/game/quests";
import { goalProgress, tasksDueOn, type GoalTask } from "@/lib/goals/plan";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Daily cron: nudges students with reminders switched on about today's goal tasks (and overdue ones).
 * Requires `Authorization: Bearer $CRON_SECRET`. Sends at most one reminder per goal per day.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Invalid cron secret" } }, { status: 401 });
  }
  const today = dayIdFor();
  const snap = await adminDb().collection("studyGoals").where("reminders", "==", true).limit(1000).get();
  let sent = 0;
  for (const d of snap.docs) {
    const g = d.data();
    if (g.lastReminderDay === today || !g.uid) continue;
    const tasks = (Array.isArray(g.tasks) ? g.tasks : []) as GoalTask[];
    const due = tasksDueOn(tasks, today).length;
    const p = goalProgress(tasks, today);
    if (due === 0 && p.overdue === 0) continue;
    await notify(g.uid, {
      type: "system",
      title: `🎓 ${due ? `${due} task${due === 1 ? "" : "s"} due today` : "Your goal needs a nudge"}: ${String(g.title).slice(0, 60)}`,
      body: p.behind ? "You're a bit behind. Open the goal and replan to get back on track." : "A small step today keeps you on schedule.",
      href: "/goals",
      icon: "🎓",
    });
    await d.ref.update({ lastReminderDay: today });
    sent++;
  }
  return NextResponse.json({ ok: true, data: { sent } });
}
