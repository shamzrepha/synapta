import { adminDb, Timestamp } from "@/lib/firebase/admin";
import { ApiError } from "@/lib/api/errors";
import { getClassAccess } from "@/lib/auth/classAccess";
import type { AuthUser } from "@/lib/auth/requireUser";
import { notify } from "@/lib/notifications/server";
import { bumpChannels } from "@/lib/live/server";
import { shareAchievement } from "@/lib/social/feed";
import { trackProgress } from "@/lib/game/progress";
import { eventStatus, rankEntries, type EventStatus } from "./scoring";

export type EventKind = "quiz_sprint" | "hackathon";

export interface EventRewards {
  first: number;
  second: number;
  third: number;
  participation: number;
}

export function toDate(v: unknown): Date {
  if (v && typeof (v as { toDate?: () => Date }).toDate === "function") return (v as { toDate: () => Date }).toDate();
  return new Date(v as string);
}

export function statusOf(ev: FirebaseFirestore.DocumentData, now = new Date()): EventStatus {
  return eventStatus(
    { kind: ev.kind, startAt: toDate(ev.startAt), endAt: toDate(ev.endAt), votingEndsAt: ev.votingEndsAt ? toDate(ev.votingEndsAt) : null },
    now
  );
}

export function serializeEvent(id: string, ev: FirebaseFirestore.DocumentData) {
  return {
    id,
    kind: ev.kind as EventKind,
    title: ev.title,
    description: ev.description || "",
    topic: ev.topic || "",
    hostUid: ev.hostUid,
    hostName: ev.hostName,
    classId: ev.classId || null,
    classTitle: ev.classTitle || null,
    visibility: ev.visibility,
    startAt: toDate(ev.startAt).toISOString(),
    endAt: toDate(ev.endAt).toISOString(),
    votingEndsAt: ev.votingEndsAt ? toDate(ev.votingEndsAt).toISOString() : null,
    secondsPerQuestion: ev.secondsPerQuestion || null,
    questionCount: ev.questionCount || null,
    rewards: ev.rewards as EventRewards,
    participantCount: ev.participantCount || 0,
    submissionCount: ev.submissionCount || 0,
    status: statusOf(ev),
    finalized: !!ev.finalized,
    results: ev.results || null,
  };
}

/** Loads an event and checks the caller may see it (class events need class access). */
export async function loadEvent(caller: AuthUser, eventId: string) {
  const ref = adminDb().collection("events").doc(eventId);
  const snap = await ref.get();
  if (!snap.exists) throw new ApiError(404, "NOT_FOUND", "Challenge not found");
  const ev = snap.data()!;
  let canManage = caller.role === "admin" || ev.hostUid === caller.uid;
  let canParticipate = true;
  if (ev.classId) {
    const access = await getClassAccess(caller, ev.classId);
    if (ev.visibility === "class" && !access.canView) throw new ApiError(403, "FORBIDDEN", "This challenge is only for its class.");
    if (ev.visibility === "class") canParticipate = access.isEnrolled || access.canMutate;
    canManage = canManage || access.canMutate;
  }
  return { ref, ev, canManage, canParticipate };
}

export function eventChannels(eventId: string, ev: FirebaseFirestore.DocumentData): string[] {
  const ch = [`event:${eventId}`];
  if (ev.visibility === "public") ch.push("events:public");
  if (ev.classId) ch.push(`events:class:${ev.classId}`);
  return ch;
}

/**
 * Ranks participants, awards XP once (transaction-guarded), notifies everyone and posts winners
 * to the feed. Called by the host or lazily by the first viewer after the event closes.
 */
export async function finalizeEvent(eventId: string): Promise<void> {
  const ref = adminDb().collection("events").doc(eventId);
  const claimed = await adminDb().runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) return null;
    const ev = snap.data()!;
    if (ev.finalized || ev.finalizing) return null;
    if (statusOf(ev) !== "ended") return null;
    t.update(ref, { finalizing: true });
    return ev;
  });
  if (!claimed) return;
  const ev = claimed;

  const entriesSnap = await ref.collection("entries").get();
  const entries = entriesSnap.docs.map((d) => d.data());
  const eligible =
    ev.kind === "hackathon"
      ? entries.filter((e) => e.submittedAt)
      : entries.filter((e) => (e.answered || 0) > 0);
  const ranked = rankEntries(
    eligible.map((e) => ({
      uid: e.uid as string,
      displayName: (e.displayName as string) || "Learner",
      score: ev.kind === "hackathon" ? e.votes || 0 : e.score || 0,
      tiebreak: toDate(ev.kind === "hackathon" ? e.submittedAt : e.finishedAt || e.lastAnswerAt || e.joinedAt).getTime(),
    }))
  );

  const rewards: EventRewards = ev.rewards || { first: 200, second: 120, third: 80, participation: 20 };
  const results = ranked.slice(0, 10).map((r) => ({ uid: r.uid, displayName: r.displayName, rank: r.rank, score: r.score }));
  await ref.update({ finalized: true, finalizing: false, finalizedAt: Timestamp.now(), results });

  for (const r of ranked) {
    const xp = r.rank === 1 ? rewards.first : r.rank === 2 ? rewards.second : r.rank === 3 ? rewards.third : rewards.participation;
    await trackProgress({
      uid: r.uid,
      xpToAward: xp,
      stats: { eventWins: r.rank === 1 ? 1 : 0, podiums: r.rank <= 3 ? 1 : 0 },
      countsForQuests: false,
      reason: `event:${eventId}`,
    });
    await notify(r.uid, {
      type: "event_result",
      title: r.rank <= 3 ? `You placed #${r.rank} in ${ev.title}! 🏆` : `${ev.title} results are in`,
      body: `You finished #${r.rank} of ${ranked.length}. +${xp} XP`,
      href: `/challenges/${eventId}`,
      icon: r.rank === 1 ? "🏆" : r.rank <= 3 ? "🥇" : "🎯",
    });
    if (r.rank === 1) {
      await shareAchievement(r.uid, `won **${ev.title}** 🏆`, { type: "event", eventId });
    }
  }
  await bumpChannels(eventChannels(eventId, ev));
}
