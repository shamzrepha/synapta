import { NextRequest, NextResponse } from "next/server";
import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { sendDueReminders, REMINDER_LEAD_MS } from "@/lib/sessions/store";

export const runtime = "nodejs";

/**
 * Optional cron (e.g. Vercel Cron every 5 minutes) so reminders go out even if nobody opens the app.
 * Reminders are also sent lazily whenever sessions are viewed. Requires `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED", message: "Invalid cron secret" } }, { status: 401 });
  }
  const now = Date.now();
  const snap = await adminDb()
    .collection("studySessions")
    .where("startAt", ">=", Timestamp.fromMillis(now - 5 * 60 * 1000))
    .where("startAt", "<=", Timestamp.fromMillis(now + REMINDER_LEAD_MS))
    .get();
  const classIds = Array.from(new Set(snap.docs.filter((d) => !d.data().reminderSent).map((d) => d.data().classId as string)));
  const sent = await sendDueReminders(classIds);
  return NextResponse.json({ ok: true, data: { sent } });
}
