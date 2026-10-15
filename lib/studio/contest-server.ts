import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { notify } from "@/lib/notifications/server";
import { isClosed, pickWinner } from "./contest";

export const contestsCol = () => adminDb().collection("studioContests");

export interface ContestView {
  id: string;
  title: string;
  brief: string;
  deadline: string;
  budget: number;
  allowedParts: string[];
  status: "open" | "closed";
  createdBy: string;
  createdByName: string;
  entryCount: number;
  winnerUid: string | null;
  winnerName: string | null;
  winnerDesignId: string | null;
}

export function toContestView(id: string, d: FirebaseFirestore.DocumentData): ContestView {
  return {
    id,
    title: d.title,
    brief: d.brief,
    deadline: d.deadline,
    budget: d.budget || 0,
    allowedParts: d.allowedParts || [],
    status: d.status === "closed" ? "closed" : "open",
    createdBy: d.createdBy,
    createdByName: d.createdByName || "Teacher",
    entryCount: d.entryCount || 0,
    winnerUid: d.winnerUid || null,
    winnerName: d.winnerName || null,
    winnerDesignId: d.winnerDesignId || null,
  };
}

/**
 * Closes a contest whose deadline has passed. Safe to call on every fetch: the transaction only
 * flips `open` to `closed` once, and only the call that flipped it sends the notifications.
 */
export async function closeIfDue(id: string, now = Date.now()): Promise<FirebaseFirestore.DocumentData | null> {
  const ref = contestsCol().doc(id);
  const result = await adminDb().runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) return null;
    const c = snap.data()!;
    if (c.status === "closed" || !isClosed({ status: c.status, deadline: c.deadline }, now)) return { data: c, closedNow: false, entries: [] as FirebaseFirestore.DocumentData[] };
    const entries = (await t.get(ref.collection("entries"))).docs.map((d) => d.data());
    const winner = pickWinner(entries.map((e) => ({ uid: e.uid as string, votes: (e.votes || 0) as number, createdAt: String(e.createdAt || ""), e })));
    const update = {
      status: "closed",
      closedAt: Timestamp.now(),
      winnerUid: winner?.uid || null,
      winnerName: winner?.e.ownerName || null,
      winnerDesignId: winner?.e.designId || null,
    };
    t.update(ref, update);
    return { data: { ...c, ...update }, closedNow: true, entries };
  });
  if (!result) return null;
  if (result.closedNow) {
    const c = result.data;
    const href = `/studio/contests/${id}`;
    const jobs: Promise<void>[] = [];
    if (c.winnerUid) jobs.push(notify(c.winnerUid, { type: "event_result", title: "🏆 You won a build contest!", body: `“${c.title}” — your design got the most votes.`, href, icon: "🏆" }));
    for (const e of result.entries) {
      if (e.uid !== c.winnerUid) jobs.push(notify(e.uid as string, { type: "event_result", title: `Contest closed: ${c.title}`, body: c.winnerName ? `${c.winnerName} won. Thanks for entering!` : "Thanks for entering!", href, icon: "🏁" }));
    }
    await Promise.all(jobs);
  }
  return result.data;
}
