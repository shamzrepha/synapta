/** Pure helpers for the mistake notebook (no I/O). */

export const MASTER_AFTER = 2;

export interface MistakeState {
  wrongCount: number;
  retestCorrect: number;
  mastered: boolean;
}

/** Stable id for "this question by this student" so repeated misses update one entry. */
export function mistakeKey(uid: string, question: string): string {
  const s = question.toLowerCase().replace(/\s+/g, " ").trim();
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${uid}_${(h >>> 0).toString(36)}_${s.length.toString(36)}`;
}

/** A new wrong answer on an existing entry reopens it. */
export function afterWrongAnswer(prev: MistakeState | null): MistakeState {
  return { wrongCount: (prev?.wrongCount ?? 0) + 1, retestCorrect: 0, mastered: false };
}

/** Retest result: two correct retests in a row master it; a wrong one resets the run. */
export function afterRetest(prev: MistakeState, correct: boolean): MistakeState {
  if (!correct) return { wrongCount: prev.wrongCount + 1, retestCorrect: 0, mastered: false };
  const retestCorrect = prev.retestCorrect + 1;
  return { wrongCount: prev.wrongCount, retestCorrect, mastered: retestCorrect >= MASTER_AFTER };
}

/** Clamp untrusted text (AI output, client input) to a safe length. */
export function clip(s: unknown, max: number): string {
  return typeof s === "string" ? s.trim().slice(0, max) : "";
}
