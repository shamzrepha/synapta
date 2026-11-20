import { MAX_ANSWER_CHARS, MIN_ANSWER_CHARS, MIN_ANSWER_WORDS, PASS_FRACTION, type KeyPoint, type MarkingResult, type PointResult, type RawMarking, type RawQuestionSet, type Strictness, type TheoryQuestion } from "./schemas";
import { stableId } from "@/lib/practice/bank";

/** Pure helpers: no AI, no database. The AI only judges each key point; everything numeric is computed here. */

const half = (n: number) => Math.round(n * 2) / 2;
const floorHalf = (n: number) => Math.floor(n * 2 + 1e-9) / 2;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^\p{L}\p{N}%+\-*/^=.' ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function capAnswer(answer: string): string {
  return answer.replace(/\u0000/g, "").trim().slice(0, MAX_ANSWER_CHARS);
}

/** Too little to mark: scored 0 without spending an AI call. */
export function isMarkable(answer: string): boolean {
  const t = answer.trim();
  return t.length >= MIN_ANSWER_CHARS && t.split(/\s+/).filter(Boolean).length >= MIN_ANSWER_WORDS;
}

/** Makes the key-point marks add up exactly to the question's marks (the lecturer's 2 / 5 / 10), in half marks. */
export function allocateMarks(points: KeyPoint[], marks: number): KeyPoint[] {
  const total = points.reduce((a, p) => a + p.marks, 0);
  if (points.length === 0 || total <= 0) return points;
  const scaled = points.map((p) => ({ ...p, marks: Math.max(0.5, half((p.marks / total) * marks)) }));
  const sum = () => scaled.reduce((a, p) => a + p.marks, 0);
  // too many tiny points for the marks: drop the lightest until it can fit
  while (sum() > marks + 1e-9 && scaled.length > 1) {
    const lightest = scaled.reduce((bi, p, i, arr) => (p.marks < arr[bi].marks ? i : bi), 0);
    scaled.splice(lightest, 1);
  }
  // put the rounding leftover on the heaviest point
  const heaviest = scaled.reduce((bi, p, i, arr) => (p.marks > arr[bi].marks ? i : bi), 0);
  scaled[heaviest].marks = Math.max(0.5, half(scaled[heaviest].marks + (marks - sum())));
  return scaled;
}

export function normalizeQuestions(raw: RawQuestionSet["questions"]): TheoryQuestion[] {
  const seen = new Set<string>();
  const out: TheoryQuestion[] = [];
  for (const q of raw) {
    const id = stableId(q.question);
    if (seen.has(id)) continue;
    seen.add(id);
    const keyPoints = allocateMarks(q.keyPoints.map((k) => ({ point: k.point, marks: k.marks, mustInclude: k.mustInclude })), q.marks);
    out.push({ id, command: q.command, question: q.question, marks: q.marks, keyPoints, modelAnswer: q.modelAnswer, tip: q.tip });
  }
  return out;
}

/** What the marker is told about this strictness. */
export function strictnessGuide(s: Strictness): string {
  if (s === "strict")
    return "STRICT: mark like a tough external examiner. A key point earns full marks only when the idea is correct AND stated in close to textbook wording, with the required key terms, units and formulas. Vague, incomplete or loosely worded ideas earn at most half. Missing units or a wrong formula costs marks. Do not give the benefit of the doubt.";
  if (s === "lenient")
    return "LENIENT: mark generously. If the learner's idea is correct, in their own words or even informal wording, give the marks for that key point. Do not deduct for missing technical terms or for spelling and grammar.";
  return "BALANCED: the key idea must be present and correct; the wording is free. Give full marks for a correct idea in the learner's own words, half marks for a partly correct or incomplete idea, nothing for a missing or wrong one.";
}

export function strictnessLabel(s: Strictness): string {
  return s === "strict" ? "Strict" : s === "lenient" ? "Lenient" : "Balanced";
}

/** Does the learner's answer mention at least one of the required terms? (an empty list means nothing is required) */
export function hasRequiredTerm(answer: string, terms: string[]): boolean {
  if (terms.length === 0) return true;
  const a = normalizeText(answer);
  return terms.some((t) => {
    const n = normalizeText(t);
    return n.length > 0 && a.includes(n);
  });
}

/** The quote counts only if it really is in the learner's answer (the AI may not invent words for them). */
export function verifyQuote(answer: string, quote: string): string {
  const q = quote.trim().replace(/^["'“]+|["'”]+$/g, "");
  if (q.length < 3) return "";
  return normalizeText(answer).includes(normalizeText(q)) ? q.slice(0, 300) : "";
}

/**
 * Turns the AI's per-point judgement into the final result. Never trusts AI totals: each point is clamped to its marks
 * and rounded to half marks, strictness caps are applied here, and the score is the sum, clamped to the question's marks.
 */
export function scoreMarking(question: TheoryQuestion, ai: RawMarking | null, answer: string, strictness: Strictness): MarkingResult {
  const byIndex = new Map<number, RawMarking["points"][number]>();
  for (const p of ai?.points ?? []) if (!byIndex.has(p.index)) byIndex.set(p.index, p);

  const points: PointResult[] = question.keyPoints.map((kp, i) => {
    const j = byIndex.get(i);
    const quote = j ? verifyQuote(answer, j.quote) : "";
    let awarded = clamp(strictness === "strict" ? floorHalf(j?.awarded ?? 0) : half(j?.awarded ?? 0), 0, kp.marks);
    if (awarded > 0 && strictness !== "lenient") {
      // marks need evidence in the learner's own words
      if (!quote) awarded = Math.min(awarded, floorHalf(kp.marks / 2));
      // strict: the required key terms, units or formula must actually appear
      if (strictness === "strict" && !hasRequiredTerm(answer, kp.mustInclude)) awarded = Math.min(awarded, floorHalf(kp.marks / 2));
    }
    const status: PointResult["status"] = awarded >= kp.marks ? "hit" : awarded > 0 ? "partial" : "missed";
    return { point: kp.point, marks: kp.marks, awarded, status, quote: awarded > 0 ? quote : "", note: (j?.note ?? "").slice(0, 300) };
  });

  const score = clamp(half(points.reduce((a, p) => a + p.awarded, 0)), 0, question.marks);
  return { score, marks: question.marks, points, feedback: ai?.feedback ?? "", tip: ai?.tip || question.tip, modelAnswer: question.modelAnswer };
}

/** An answer too short to mark: zero, with the missed points listed so the learner can still study. */
export function zeroResult(question: TheoryQuestion): MarkingResult {
  return {
    score: 0,
    marks: question.marks,
    points: question.keyPoints.map((kp) => ({ point: kp.point, marks: kp.marks, awarded: 0, status: "missed" as const, quote: "", note: "" })),
    feedback: "There was not enough written to mark. In the exam, even a short attempt earns method marks, so always write something.",
    tip: question.tip,
    modelAnswer: question.modelAnswer,
  };
}

export const passed = (r: Pick<MarkingResult, "score" | "marks">) => r.marks > 0 && r.score / r.marks >= PASS_FRACTION;
