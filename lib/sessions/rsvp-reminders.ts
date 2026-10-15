import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { notifyMany } from "@/lib/notifications/server";

export const RSVP_REMINDER_LEAD_MS = 10 * 60 * 1000;

/**
 * Personal reminder ~10 minutes before start for people who RSVP'd going/maybe.
 * Piggybacks on the existing mechanism: called lazily from GET /api/sessions (and the optional
 * cron job), exactly like `sendDueReminders`. `rsvpReminderSent` is claimed in a transaction so
 * concurrent viewers never double-send.
 */
export async function sendRsvpReminders(classIds: string[]): Promise<number> {
  let sent = 0;
  const now = Date.now();
  for (const classId of classIds) {
    const snap = await adminDb()
      .collection("studySessions")
      .where("classId", "==", classId)
      .where("startAt", ">=", Timestamp.fromMillis(now - 2 * 60 * 1000))
      .where("startAt", "<=", Timestamp.fromMillis(now + RSVP_REMINDER_LEAD_MS))
      .get();
    for (const d of snap.docs) {
      const claimed = await adminDb().runTransaction(async (t) => {
        const cur = await t.get(d.ref);
        if (!cur.exists || cur.data()!.rsvpReminderSent) return false;
        t.update(d.ref, { rsvpReminderSent: true });
        return true;
      });
      if (!claimed) continue;
      const s = d.data();
      const going: string[] = Array.isArray(s.rsvpUids) ? s.rsvpUids : [];
      const maybe: string[] = Array.isArray(s.maybeUids) ? s.maybeUids : [];
      const start = typeof s.startAt?.toMillis === "function" ? s.startAt.toMillis() : now;
      const mins = Math.max(0, Math.round((start - now) / 60000));
      await notifyMany(going.concat(maybe), {
        type: "session_starting",
        title: mins > 0 ? `“${s.title}” starts in ${mins} min` : `“${s.title}” is starting now`,
        body: "You RSVP'd — tap to join the room.",
        href: `/sessions?focus=${d.id}`,
        icon: "⏰",
      });
      sent++;
    }
  }
  return sent;
}
