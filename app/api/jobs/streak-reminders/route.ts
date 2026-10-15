import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { notify } from "@/lib/notifications/server";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Daily cron (e.g. 18:00 UTC): reminds learners who studied yesterday but not yet today that their
 * streak ends at midnight UTC. Requires `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Invalid cron secret" } }, { status: 401 });
  }
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const snap = await adminDb().collection("users").where("lastActiveDate", "==", yesterday).limit(2000).get();
  let sent = 0;
  for (const d of snap.docs) {
    const u = d.data();
    if ((u.streakDays || 0) < 2 || u.settings?.streakReminders === false) continue;
    await notify(d.id, {
      type: "system",
      title: `🔥 Your ${u.streakDays}-day streak ends at midnight UTC`,
      body: u.streakFreezes ? `A streak freeze will cover you, but a 5-minute quiz keeps it going!` : "A quick quiz or flashcard round keeps it alive.",
      href: "/dashboard",
      icon: "🔥",
    });
    sent++;
  }
  return NextResponse.json({ ok: true, data: { sent } });
}
