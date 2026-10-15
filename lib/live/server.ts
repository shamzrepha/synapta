import { adminDb, FieldValue, Timestamp } from "@/lib/firebase/admin";

/**
 * Live updates without exposing data to client-side Firestore reads.
 *
 * Clients listen to tiny "signal" documents (`liveChannels/{channel}` and `userSignals/{uid}`)
 * that only hold a counter and timestamp. When a signal changes, the client refetches through
 * the normal authorised API. Data never leaves the server unchecked; updates still arrive instantly.
 *
 * Channel naming: "feed:global", "feed:class:{classId}", "post:{postId}", "event:{eventId}",
 * "leaderboard:global", "league:{cohortId}", "sessions:class:{classId}", "class:{classId}".
 */
export function channelId(name: string): string {
  // Firestore doc IDs can't contain "/"
  return name.replace(/\//g, "_").slice(0, 300);
}

export async function bumpChannel(name: string): Promise<void> {
  await adminDb()
    .collection("liveChannels")
    .doc(channelId(name))
    .set({ v: FieldValue.increment(1), at: Timestamp.now() }, { merge: true })
    .catch(() => null);
}

export async function bumpChannels(names: string[]): Promise<void> {
  await Promise.all(Array.from(new Set(names)).map(bumpChannel));
}

/** Per-user signal: drives the notification badge and refreshes that user's open pages. */
export async function bumpUserSignal(uid: string, opts: { unreadDelta?: number; topic?: string } = {}): Promise<void> {
  const update: Record<string, unknown> = {
    v: FieldValue.increment(1),
    at: Timestamp.now(),
    lastTopic: opts.topic || "generic",
  };
  if (opts.unreadDelta) update.unreadCount = FieldValue.increment(opts.unreadDelta);
  await adminDb().collection("userSignals").doc(uid).set(update, { merge: true }).catch(() => null);
}

export async function resetUnread(uid: string): Promise<void> {
  await adminDb()
    .collection("userSignals")
    .doc(uid)
    .set({ unreadCount: 0, v: FieldValue.increment(1), at: Timestamp.now(), lastTopic: "notifications" }, { merge: true })
    .catch(() => null);
}
