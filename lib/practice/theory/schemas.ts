import { z } from "zod";

/** Written (theory) practice: shapes shared by the question setter, the marker and the routes. */

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export const STRICTNESS = ["strict", "balanced", "lenient"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export type Strictness = (typeof STRICTNESS)[number];

/** Longest answer we accept and send to the marker (a full exam page is about 2,500 characters). */
export const MAX_ANSWER_CHARS = 4000;
/** An answer shorter than this is scored 0 without an AI call. */
export const MIN_ANSWER_CHARS = 12;
export const MIN_ANSWER_WORDS = 3;
/** Fewer words than this still gets marked, but never counts as mastery evidence. */
export const MIN_EVIDENCE_WORDS = 15;
/** Share of the marks a learner must earn for the attempt to count as "correct" evidence. */
export const PASS_FRACTION = 0.6;

const keyPointRaw = z.object({
  point: z.string().trim().min(3).max(400),
  marks: z.number().min(0.5).max(10),
  /** key terms, units or formulas that a strict marker requires to see (any one of them) */
  mustInclude: z.array(z.string().trim().min(1).max(60)).max(6).default([]),
});

export const rawQuestionSchema = z.object({
  command: z.string().trim().min(2).max(30),
  question: z.string().trim().min(10).max(600),
  marks: z.number().int().min(1).max(15),
  keyPoints: z.array(keyPointRaw).min(1).max(12),
  modelAnswer: z.string().trim().min(10).max(2500),
  tip: z.string().trim().max(300).default(""),
});

export const rawQuestionSetSchema = z.object({ questions: z.array(rawQuestionSchema).min(2).max(6) });
export type RawQuestionSet = z.output<typeof rawQuestionSetSchema>;

export interface KeyPoint {
  point: string;
  marks: number;
  mustInclude: string[];
}

/** A question as stored in the shared set: the marking guide stays on the server until the learner has answered. */
export interface TheoryQuestion {
  id: string;
  command: string;
  question: string;
  marks: number;
  keyPoints: KeyPoint[];
  modelAnswer: string;
  tip: string;
}

/** What the learner is allowed to see before answering. */
export interface PublicQuestion {
  id: string;
  command: string;
  question: string;
  marks: number;
}

export const markedPointSchema = z.object({
  index: z.number().int().min(0).max(40),
  awarded: z.number().min(0).max(15),
  quote: z.string().max(400).default(""),
  note: z.string().max(300).default(""),
});
/** The marker returns judgements per key point only. Totals it might add are ignored: we recompute them. */
export const rawMarkingSchema = z.object({
  points: z.array(markedPointSchema).max(40),
  feedback: z.string().trim().max(900).default(""),
  tip: z.string().trim().max(300).default(""),
});
export type RawMarking = z.output<typeof rawMarkingSchema>;

export interface PointResult {
  point: string;
  marks: number;
  awarded: number;
  status: "hit" | "partial" | "missed";
  /** the learner's own words that earned the marks (verified to be in their answer) */
  quote: string;
  note: string;
}

export interface MarkingResult {
  score: number;
  marks: number;
  points: PointResult[];
  feedback: string;
  tip: string;
  modelAnswer: string;
}

// ------------------------------------------------------------------ request bodies

const id = z.string().trim().min(1).max(128);
/** Where the notes come from: a topic of a class, or the learner's own study notes. */
const sourceFields = { classId: id.optional(), kcId: id.optional(), noteId: id.optional() };
const sourceRule = (v: { classId?: string; kcId?: string; noteId?: string }) => (v.noteId ? !v.classId && !v.kcId : !!v.classId && !!v.kcId);
const SOURCE_MSG = "Choose a class topic or your own notes";

export const generateBodySchema = z
  .object({ ...sourceFields, difficulty: z.enum(DIFFICULTIES).optional() })
  .refine(sourceRule, SOURCE_MSG);
export const markBodySchema = z
  .object({
    ...sourceFields,
    difficulty: z.enum(DIFFICULTIES).optional(),
    strictness: z.enum(STRICTNESS).optional(),
    questionId: z.string().trim().min(1).max(40),
    answer: z.string().max(MAX_ANSWER_CHARS * 2),
  })
  .refine(sourceRule, SOURCE_MSG);
