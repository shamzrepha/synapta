import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { bumpUserSignal } from "@/lib/live/server";

export type NotificationType =
  | "level_up"
  | "badge"
  | "quest"
  | "league"
  | "mastery"
  | "like"
  | "comment"
  | "friend"
  | "session_scheduled"
  | "session_starting"
  | "event_started"
  | "event_result"
  | "system";

export interface NotificationInput {
  type: NotificationType;
  title: string;
  body?: string;
  href?: string;
  icon?: string;
  actorUid?: string;
  actorName?: string;
}

/** Writes an in-app notification and pings the user's live signal (badge count + refresh). */
export async function notify(uid: string, n: NotificationInput): Promise<void> {
  try {
    await adminDb()
      .collection("users")
      .doc(uid)
      .collection("notifications")
      .add({
        ...n,
        body: n.body || "",
        href: n.href || null,
        read: false,
        createdAt: Timestamp.now(),
      });
    await bumpUserSignal(uid, { unreadDelta: 1, topic: n.type });
  } catch (err) {
    console.warn("[notify] failed", err instanceof Error ? err.message : err);
  }
}

/** Fan-out to many users (e.g. a whole class). Batched so a big class doesn't stall the request. */
export async function notifyMany(uids: string[], n: NotificationInput): Promise<void> {
  const unique = Array.from(new Set(uids)).slice(0, 2000);
  for (let i = 0; i < unique.length; i += 50) {
    await Promise.all(unique.slice(i, i + 50).map((uid) => notify(uid, n)));
  }
}
