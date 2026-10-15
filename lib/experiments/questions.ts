import type { Computed, Question, Values } from "./types";

export interface Check {
  correct: boolean;
  message: string;
}

/** Auto-checks a student's answer against the numbers the simulator is showing right now. */
export function checkAnswer(q: Question, raw: string, v: Values, c: Computed): Check {
  if (q.kind === "choice") {
    if (!raw) return { correct: false, message: "Pick an answer first." };
    const exp = q.expected(v, c);
    return raw === exp ? { correct: true, message: "Correct." } : { correct: false, message: q.hint(v, c) };
  }
  const a = Number(String(raw).trim().replace(",", "."));
  if (!String(raw).trim() || !Number.isFinite(a)) return { correct: false, message: "Type a number." };
  const e = q.expected(v, c);
  const allowed = Math.max(Math.abs(e) * q.tol, q.absTol ?? 0);
  return Math.abs(a - e) <= allowed ? { correct: true, message: "Correct." } : { correct: false, message: q.hint(v, c) };
}
