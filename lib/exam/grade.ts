export interface RawHandwrittenGrade {
  scoreAwarded: number;
  transcribedSteps: string[];
  stepFeedback: Array<{ step: string; status: "correct" | "partial" | "error"; comment: string }>;
  missingFormulasOrUnits: string[];
  examinerAdvice: string;
}

/**
 * The marker's numbers are advice, not the grade: the mark is clamped to what the question is worth, and the percent
 * and verdict are worked out here, so a confused or manipulated model can never award 120/100, or a "pass" on 0 marks.
 */
export function normalizeGrade(raw: RawHandwrittenGrade, maxMarks: number) {
  const awarded = Number.isFinite(raw.scoreAwarded) ? raw.scoreAwarded : 0;
  const scoreAwarded = Math.min(maxMarks, Math.max(0, Math.round(awarded * 2) / 2));
  const scorePercent = Math.round((scoreAwarded / maxMarks) * 100);
  const verdict: "excellent" | "partial" | "needs_work" = scorePercent >= 75 ? "excellent" : scorePercent >= 40 ? "partial" : "needs_work";
  return {
    scoreAwarded,
    maxMarks,
    scorePercent,
    verdict,
    transcribedSteps: raw.transcribedSteps.slice(0, 40),
    stepFeedback: raw.stepFeedback.slice(0, 40),
    missingFormulasOrUnits: raw.missingFormulasOrUnits.slice(0, 12),
    examinerAdvice: raw.examinerAdvice,
  };
}
