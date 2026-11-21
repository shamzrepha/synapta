/**
 * What makes a streak day. A day counts only when the learner has done enough real, server-recorded learning:
 * each activity is worth a few "learning points", each kind is capped per day, and the day qualifies at
 * QUALIFY_THRESHOLD points. Opening the app, presence pings, notifications and logins are not learning kinds
 * and are worth nothing. Pure: no I/O, so the rules are unit tested.
 */

export const QUALIFY_THRESHOLD = 30;

export const LEARNING_KINDS = ["quiz", "flashcard", "theory", "lab", "past_question", "reader", "peer_explain"] as const;
export type LearningKind = (typeof LEARNING_KINDS)[number];

/** points per credited action, and the most one kind can add to a single day */
export const LEARNING_WEIGHTS: Record<LearningKind, { points: number; cap: number; label: string }> = {
  quiz: { points: 3, cap: 30, label: "quiz answer" },
  flashcard: { points: 2, cap: 20, label: "flashcard review" },
  theory: { points: 8, cap: 24, label: "written answer marked" },
  lab: { points: 15, cap: 30, label: "lab completed" },
  past_question: { points: 4, cap: 24, label: "past-question attempt" },
  reader: { points: 3, cap: 24, label: "lesson page read" },
  peer_explain: { points: 10, cap: 20, label: "peer explanation" },
};

/** A reader signal only counts if this long has passed since the last counted one (stops page-turn scripts) */
export const READER_MIN_GAP_MS = 15_000;

export type LearningCounts = Partial<Record<LearningKind, number>>;

export function isLearningKind(x: unknown): x is LearningKind {
  return typeof x === "string" && (LEARNING_KINDS as readonly string[]).includes(x);
}

/** Points one kind contributes, after its daily cap. Unknown kinds (login, presence...) are worth nothing. */
export function kindPoints(kind: string, count: number): number {
  if (!isLearningKind(kind)) return 0;
  const w = LEARNING_WEIGHTS[kind];
  const n = Math.max(0, Math.floor(Number(count) || 0));
  return Math.min(w.cap, n * w.points);
}

export function dayPoints(counts: LearningCounts | null | undefined): number {
  if (!counts) return 0;
  return Object.entries(counts).reduce((sum, [kind, n]) => sum + kindPoints(kind, n ?? 0), 0);
}

export function qualifies(counts: LearningCounts | null | undefined): boolean {
  return dayPoints(counts) >= QUALIFY_THRESHOLD;
}

/** Adds `n` credited actions of one kind. Anything that is not a learning kind is ignored. */
export function addLearning(counts: LearningCounts | null | undefined, kind: string, n = 1): LearningCounts {
  const next: LearningCounts = { ...(counts || {}) };
  if (!isLearningKind(kind)) return next;
  const w = LEARNING_WEIGHTS[kind];
  const maxCount = Math.ceil(w.cap / w.points);
  next[kind] = Math.min(maxCount, Math.max(0, Math.floor(next[kind] ?? 0)) + Math.max(0, Math.floor(n)));
  return next;
}

export function shouldCountReader(lastCountedAtMs: number | null | undefined, nowMs: number): boolean {
  return !lastCountedAtMs || nowMs - lastCountedAtMs >= READER_MIN_GAP_MS;
}

export interface DayProgress {
  points: number;
  threshold: number;
  remaining: number;
  qualified: boolean;
}

export function dayProgress(counts: LearningCounts | null | undefined, qualifiedAlready = false): DayProgress {
  const points = Math.min(QUALIFY_THRESHOLD, dayPoints(counts));
  const qualified = qualifiedAlready || points >= QUALIFY_THRESHOLD;
  return {
    points: qualified ? QUALIFY_THRESHOLD : points,
    threshold: QUALIFY_THRESHOLD,
    remaining: qualified ? 0 : QUALIFY_THRESHOLD - points,
    qualified,
  };
}

/** The line shown on the dashboard strip and streak page, e.g. "Today's streak: 14/30 points. ...". */
export function progressMessage(p: DayProgress): string {
  if (p.qualified) return `Today's streak: ${p.threshold}/${p.threshold} points. Your streak is safe for today.`;
  const quiz = Math.ceil(p.remaining / LEARNING_WEIGHTS.quiz.points);
  return `Today's streak: ${p.points}/${p.threshold} points. Answer ${quiz} more quiz question${quiz === 1 ? "" : "s"}, or mix flashcards, a lab, past questions or lesson pages, to keep your streak.`;
}

/**
 * The date a streak was last extended. Streaks from before qualified days existed only have lastActiveDate (which
 * then meant "opened the app"); they are honoured as they were. Once lastQualifiedDate exists it wins.
 */
export function streakAnchorDate(u: { lastQualifiedDate?: unknown; lastActiveDate?: unknown }): string | null {
  const q = typeof u.lastQualifiedDate === "string" && u.lastQualifiedDate ? u.lastQualifiedDate : null;
  const a = typeof u.lastActiveDate === "string" && u.lastActiveDate ? u.lastActiveDate : null;
  return (q ?? a)?.slice(0, 10) ?? null;
}

/** First streak day counted by qualified learning; earlier days in the calendar still use old activity data. */
export const QUALIFY_RULE_START = "2026-11-22";
