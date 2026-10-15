/** Pure helpers for the daily challenge. Days are UTC "YYYY-MM-DD" strings, matching lib/game/quests. */

export const DAILY_QUESTION_COUNT = 5;

export interface DailyStreak {
  streak: number;
  best: number;
  last: string | null;
}

function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

/** Streak shown to the student today: it only counts if they finished yesterday or today. */
export function currentStreak(s: DailyStreak | null, today: string): number {
  if (!s || !s.last) return 0;
  const d = dayDiff(s.last, today);
  return d === 0 || d === 1 ? s.streak : 0;
}

/** Streak after completing today's challenge. Idempotent for the same day. */
export function completeToday(s: DailyStreak | null, today: string): DailyStreak {
  const prev = s ?? { streak: 0, best: 0, last: null };
  if (prev.last === today) return prev;
  const streak = prev.last && dayDiff(prev.last, today) === 1 ? prev.streak + 1 : 1;
  return { streak, best: Math.max(prev.best, streak), last: today };
}

/** XP for finishing: base + per correct answer + a perfect-score bonus. */
export function dailyXp(correct: number, total: number): number {
  const c = Math.max(0, Math.min(correct, total));
  return 10 + c * 4 + (total > 0 && c === total ? 10 : 0);
}

export interface RawQuestion {
  src?: unknown;
  question?: unknown;
  options?: unknown;
  correctIndex?: unknown;
  explanation?: unknown;
}

export interface CleanQuestion {
  src: number;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

/** Keeps only well-formed multiple-choice questions (4 distinct non-empty options, valid answer index). */
export function cleanQuestions(raw: RawQuestion[], sourceCount: number): CleanQuestion[] {
  const out: CleanQuestion[] = [];
  const seen = new Set<string>();
  for (const q of raw) {
    const question = typeof q.question === "string" ? q.question.trim().slice(0, 500) : "";
    const options = Array.isArray(q.options) ? q.options.map((o) => (typeof o === "string" ? o.trim().slice(0, 200) : "")) : [];
    const ci = typeof q.correctIndex === "number" ? q.correctIndex : -1;
    if (!question || options.length !== 4 || options.some((o) => !o)) continue;
    if (new Set(options.map((o) => o.toLowerCase())).size !== 4) continue;
    if (!Number.isInteger(ci) || ci < 0 || ci > 3) continue;
    const key = question.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const srcNum = typeof q.src === "number" && Number.isInteger(q.src) ? q.src : 0;
    out.push({
      src: sourceCount > 0 ? Math.min(Math.max(0, srcNum), sourceCount - 1) : 0,
      question,
      options,
      correctIndex: ci,
      explanation: typeof q.explanation === "string" ? q.explanation.trim().slice(0, 500) : "",
    });
  }
  return out;
}
