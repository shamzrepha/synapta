import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { notifyMany } from "@/lib/notifications/server";
import { bumpChannel } from "@/lib/live/server";
import { getActiveStudentUids } from "@/lib/classes/members";

export const JOIN_EARLY_MS = 10 * 60 * 1000;
export const REMINDER_LEAD_MS = 15 * 60 * 1000;

export type SessionStatus = "upcoming" | "starting_soon" | "live" | "ended";

function toDate(v: unknown): Date {
  if (v && typeof (v as { toDate?: () => Date }).toDate === "function") return (v as { toDate: () => Date }).toDate();
  return new Date(v as string);
}

export function sessionStatus(startAt: Date, endAt: Date, now = new Date()): SessionStatus {
  if (now >= endAt) return "ended";
  if (now >= startAt) return "live";
  if (startAt.getTime() - now.getTime() <= JOIN_EARLY_MS) return "starting_soon";
  return "upcoming";
}

export function serializeSession(id: string, s: FirebaseFirestore.DocumentData, uid: string) {
  const startAt = toDate(s.startAt);
  const endAt = toDate(s.endAt);
  const rsvp: string[] = Array.isArray(s.rsvpUids) ? s.rsvpUids : [];
  const attendees: string[] = Array.isArray(s.attendeeUids) ? s.attendeeUids : [];
  const maybe: string[] = Array.isArray(s.maybeUids) ? s.maybeUids : [];
  return {
    id,
    classId: s.classId,
    classTitle: s.classTitle || "",
    title: s.title,
    description: s.description || "",
    hostUid: s.hostUid,
    hostName: s.hostName,
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    durationMin: s.durationMin,
    status: sessionStatus(startAt, endAt),
    rsvpCount: rsvp.length,
    attendeeCount: attendees.length,
    maybeCount: maybe.length,
    maybe: maybe.includes(uid),
    going: rsvp.includes(uid),
    attended: attendees.includes(uid),
    isHost: s.hostUid === uid,
  };
}

/**
 * Sends "starting soon" reminders for sessions in a class that begin within 15 minutes.
 * Runs lazily whenever someone views sessions (and from the optional cron job), so reminders work
 * without any scheduler. The `reminderSent` flag is claimed in a transaction to avoid duplicates.
 */
export async function sendDueReminders(classIds: string[]): Promise<number> {
  let sent = 0;
  const now = Date.now();
  for (const classId of classIds) {
    const snap = await adminDb()
      .collection("studySessions")
      .where("classId", "==", classId)
      .where("startAt", ">=", Timestamp.fromMillis(now - 5 * 60 * 1000))
      .where("startAt", "<=", Timestamp.fromMillis(now + REMINDER_LEAD_MS))
      .get();
    for (const d of snap.docs) {
      const claimed = await adminDb().runTransaction(async (t) => {
        const cur = await t.get(d.ref);
        if (!cur.exists || cur.data()!.reminderSent) return false;
        t.update(d.ref, { reminderSent: true });
        return true;
      });
      if (!claimed) continue;
      const s = d.data();
      const members = await getActiveStudentUids(classId);
      const mins = Math.max(0, Math.round((toDate(s.startAt).getTime() - now) / 60000));
      await notifyMany(
        members.filter((u) => u !== s.hostUid),
        {
          type: "session_starting",
          title: mins > 0 ? `“${s.title}” starts in ${mins} min` : `“${s.title}” is starting now`,
          body: `${s.classTitle || "Your class"} study session — tap to join.`,
          href: `/sessions?focus=${d.id}`,
          icon: "📖",
        }
      );
      await bumpChannel(`sessions:class:${classId}`);
      sent++;
    }
  }
  return sent;
}
