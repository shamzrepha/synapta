/**
 * Quiz-sprint scoring, modelled on the familiar live-quiz format:
 * a correct answer is worth up to 1,000 points, decaying linearly to 500 at the time limit,
 * plus a streak bonus of +100 per consecutive correct answer after the first (capped at +500).
 * Wrong or late answers score 0 and reset the streak.
 */
export const MAX_POINTS = 1000;
export const STREAK_STEP = 100;
export const STREAK_CAP = 500;
/** Network grace so a last-second answer isn't unfairly marked late. */
export const LATE_GRACE_MS = 2000;

/**
 * How long the answer took. The server's clock includes the time the answer spent travelling and being saved, which the
 * player cannot control, so the phone's own stopwatch (started when the question appeared, stopped on the tap) is trusted
 * down to a limit: it can never be less than the server's time minus LATE_GRACE_MS, so it cannot be faked by much.
 */
export function effectiveElapsedMs(serverMs: number, clientMs: number | null | undefined): number {
  const server = Math.max(0, serverMs);
  if (typeof clientMs !== "number" || !Number.isFinite(clientMs) || clientMs < 0) return server;
  return Math.min(server, Math.max(clientMs, server - LATE_GRACE_MS));
}

export function scoreAnswer(params: { correct: boolean; elapsedMs: number; limitMs: number; streakBefore: number }): {
  points: number;
  streak: number;
  late: boolean;
} {
  const late = params.elapsedMs > params.limitMs + LATE_GRACE_MS;
  if (!params.correct || late) return { points: 0, streak: 0, late };
  const ratio = Math.min(1, Math.max(0, params.elapsedMs / params.limitMs));
  const base = Math.round(MAX_POINTS * (1 - ratio / 2));
  const streak = params.streakBefore + 1;
  const bonus = streak >= 2 ? Math.min(STREAK_CAP, STREAK_STEP * (streak - 1)) : 0;
  return { points: base + bonus, streak, late };
}

export type EventStatus = "upcoming" | "live" | "voting" | "ended";

export function eventStatus(
  ev: { kind: string; startAt: Date; endAt: Date; votingEndsAt?: Date | null },
  now: Date = new Date()
): EventStatus {
  if (now < ev.startAt) return "upcoming";
  if (now < ev.endAt) return "live";
  if (ev.kind === "hackathon" && ev.votingEndsAt && now < ev.votingEndsAt) return "voting";
  return "ended";
}

export interface RankableEntry {
  uid: string;
  score: number;
  tiebreak: number; // earlier is better (finish/submit time in ms)
}

/** Sorts by score desc, then earlier tiebreak; returns 1-based ranks (ties share nothing; earliest wins). */
export function rankEntries<T extends RankableEntry>(entries: T[]): Array<T & { rank: number }> {
  return [...entries]
    .sort((a, b) => b.score - a.score || a.tiebreak - b.tiebreak)
    .map((e, i) => ({ ...e, rank: i + 1 }));
}
