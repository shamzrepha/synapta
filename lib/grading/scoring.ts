import { z } from "zod";

export interface RubricCriterion {
  id: string;
  criterion: string;
  marks: number;
}

export interface CriterionScore {
  id: string;
  awarded: number;
  explanation: string;
}

/** Marks are awarded in half-mark steps. */
export const MARK_STEP = 0.5;
export const REVIEW_CONFIDENCE_THRESHOLD = 0.7;

export function roundToStep(n: number, step = MARK_STEP): number {
  return Math.round(n / step) * step;
}

export function clampMark(awarded: unknown, max: number): number {
  const n = typeof awarded === "number" && Number.isFinite(awarded) ? awarded : 0;
  return Math.min(Math.max(0, roundToStep(n)), max);
}

export function maxMarks(rubric: RubricCriterion[]): number {
  return rubric.reduce((sum, c) => sum + c.marks, 0);
}

export function totalAwarded(scores: Pick<CriterionScore, "awarded">[]): number {
  return scores.reduce((sum, s) => sum + s.awarded, 0);
}

/** Strict shape the grader model must return for one answer. */
export const AiGradeSchema = z.object({
  criteria: z.array(
    z.object({
      id: z.string(),
      awarded: z.number(),
      explanation: z.string().max(600).default(""),
    })
  ),
  overallExplanation: z.string().max(1000).default(""),
  confidence: z.number(),
});
export type AiGrade = z.infer<typeof AiGradeSchema>;

export interface NormalizedGrade {
  criteria: CriterionScore[];
  total: number;
  max: number;
  confidence: number;
  explanation: string;
}

/**
 * Treats model output as untrusted: unknown criteria are dropped, missing ones score 0,
 * each mark is clamped to [0, criterion marks], confidence to [0, 1].
 */
export function normalizeAiGrade(rubric: RubricCriterion[], ai: AiGrade): NormalizedGrade {
  const byId = new Map(ai.criteria.map((c) => [c.id, c]));
  const criteria = rubric.map((r) => {
    const got = byId.get(r.id);
    return {
      id: r.id,
      awarded: clampMark(got?.awarded, r.marks),
      explanation: (got?.explanation || "").slice(0, 600),
    };
  });
  const confidence = Number.isFinite(ai.confidence) ? Math.min(1, Math.max(0, ai.confidence)) : 0;
  // A grade that skipped criteria is not trustworthy.
  const complete = rubric.every((r) => byId.has(r.id));
  return {
    criteria,
    total: totalAwarded(criteria),
    max: maxMarks(rubric),
    confidence: complete ? confidence : Math.min(confidence, 0.3),
    explanation: ai.overallExplanation.slice(0, 1000),
  };
}

export function needsReview(confidence: number, threshold = REVIEW_CONFIDENCE_THRESHOLD): boolean {
  return !(confidence >= threshold);
}

/** Teacher override: validates a {criterionId: marks} map against the rubric. */
export function applyOverride(rubric: RubricCriterion[], awarded: Record<string, unknown>, previous: CriterionScore[] = []) {
  const prev = new Map(previous.map((p) => [p.id, p]));
  const criteria = rubric.map((r) => ({
    id: r.id,
    awarded: r.id in awarded ? clampMark(awarded[r.id], r.marks) : prev.get(r.id)?.awarded ?? 0,
    explanation: prev.get(r.id)?.explanation ?? "",
  }));
  return { criteria, total: totalAwarded(criteria), max: maxMarks(rubric) };
}

export function percentage(total: number, max: number): number {
  if (max <= 0) return 0;
  return Math.round((total / max) * 100);
}

export interface QuestionResult {
  total: number;
  max: number;
}

export function sumResults(results: QuestionResult[]) {
  const total = results.reduce((s, r) => s + r.total, 0);
  const max = results.reduce((s, r) => s + r.max, 0);
  return { total, max, percent: percentage(total, max) };
}

/** Removes anything that could close or fake our prompt delimiters. */
export function sanitizeStudentText(text: string, maxLen = 4000): string {
  return text.replace(/<\/?\s*USER_INPUT[^>]*>/gi, "").slice(0, maxLen);
}
