import { addDays } from "@/lib/streak/logic";

export const MASTERY_LEVEL = 0.95;

export interface EvidenceRow {
  date: string; // YYYY-MM-DD
  activity: string;
  correct: boolean;
  kcId: string;
  pLBefore: number;
  pLAfter: number;
  xpEarned: number;
}

export interface ReportInput {
  today: string;
  evidence: EvidenceRow[];
  /** per-day activity counters (any source) */
  activityCounts: Record<string, number>;
  activityXp: Record<string, number>;
  posts: number;
  streakDays: number;
}

export interface ReportNumbers {
  from: string;
  to: string;
  xpGained: number;
  quizzesTaken: number;
  quizCorrect: number;
  /** percent 0..100, or null when no quizzes were taken */
  accuracy: number | null;
  /** total mastery gained, in percentage points across topics */
  masteryGain: number;
  topicsPracticed: number;
  topicsMastered: number;
  labsPassed: number;
  flashcards: number;
  studyDays: number;
  streakDays: number;
  posts: number;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Computes the last 7 days (today inclusive). Missing data counts as zero. */
export function computeReport(input: ReportInput): ReportNumbers {
  const to = input.today;
  const from = addDays(to, -6);
  const inRange = (d: string) => d >= from && d <= to;

  const ev = input.evidence.filter((e) => inRange(e.date));
  const quiz = ev.filter((e) => e.activity === "quiz");
  const quizCorrect = quiz.filter((e) => e.correct).length;

  // Mastery gain per topic: first pLBefore to last pLAfter within the week (ordered by date)
  const byKc = new Map<string, EvidenceRow[]>();
  for (const e of ev) byKc.set(e.kcId, [...(byKc.get(e.kcId) || []), e]);
  let gain = 0;
  let mastered = 0;
  for (const rows of byKc.values()) {
    const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    gain += Math.max(0, num(last.pLAfter) - num(first.pLBefore));
    if (num(last.pLAfter) >= MASTERY_LEVEL && num(first.pLBefore) < MASTERY_LEVEL) mastered++;
  }

  const days = new Set<string>();
  for (const e of ev) days.add(e.date);
  for (const [d, c] of Object.entries(input.activityCounts)) if (inRange(d) && num(c) > 0) days.add(d);

  let evXp = 0;
  for (const e of ev) evXp += Math.max(0, num(e.xpEarned));
  let dayXp = 0;
  for (const [d, x] of Object.entries(input.activityXp)) if (inRange(d)) dayXp += Math.max(0, num(x));

  return {
    from,
    to,
    xpGained: Math.round(Math.max(evXp, dayXp)),
    quizzesTaken: quiz.length,
    quizCorrect,
    accuracy: quiz.length ? Math.round((quizCorrect / quiz.length) * 100) : null,
    masteryGain: Math.round(gain * 100),
    topicsPracticed: byKc.size,
    topicsMastered: mastered,
    labsPassed: ev.filter((e) => e.activity === "lab" && e.correct).length,
    flashcards: ev.filter((e) => e.activity === "flashcard").length,
    studyDays: days.size,
    streakDays: Math.max(0, Math.floor(num(input.streakDays))),
    posts: Math.max(0, Math.floor(num(input.posts))),
  };
}

/** Every integer the model is allowed to mention. */
export function allowedNumbers(n: ReportNumbers): Set<number> {
  const s = new Set<number>([7, 1, 2, 3]);
  for (const v of [n.xpGained, n.quizzesTaken, n.quizCorrect, n.accuracy ?? 0, n.masteryGain, n.topicsPracticed, n.topicsMastered, n.labsPassed, n.flashcards, n.studyDays, n.streakDays, n.posts]) s.add(v);
  return s;
}

/** True if the text contains no number the computed report doesn't contain (guards against invented figures). */
export function usesOnlyKnownNumbers(text: string, n: ReportNumbers): boolean {
  const allowed = allowedNumbers(n);
  const found = text.match(/\d[\d,]*/g) || [];
  return found.every((m) => allowed.has(Number(m.replace(/,/g, ""))));
}

export interface ReportNarrative {
  summary: string;
  suggestion: string;
}

/** Deterministic encouraging text used when the AI is unavailable or its output fails validation. */
export function fallbackNarrative(n: ReportNumbers): ReportNarrative {
  if (n.studyDays === 0) {
    return {
      summary: "A quiet week, and that's okay. Every learner has them. A fresh start is just one short session away.",
      suggestion: "Pick one small thing today, like a quick quiz or a few flashcards, to get back into the rhythm.",
    };
  }
  const bits: string[] = [`You studied on ${n.studyDays} day${n.studyDays === 1 ? "" : "s"} this week`];
  if (n.xpGained > 0) bits.push(`earned ${n.xpGained} XP`);
  if (n.accuracy !== null) bits.push(`got ${n.accuracy}% of quiz answers right`);
  return {
    summary: `${bits.join(", ")}. Nice work, keep building on it.`,
    suggestion: n.accuracy !== null && n.accuracy < 70 ? "Review the questions you missed, then try a short quiz again to lock them in." : "Aim to study on one more day next week to grow your streak.",
  };
}
