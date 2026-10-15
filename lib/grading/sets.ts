import { z } from "zod";
import { maxMarks, type RubricCriterion } from "./scoring";

export const CriterionInput = z.object({
  criterion: z.string().trim().min(1).max(200),
  marks: z.number().min(0.5).max(20),
});

export const QuestionInput = z.object({
  prompt: z.string().trim().min(1).max(1500),
  modelAnswer: z.string().trim().min(1).max(3000),
  rubric: z.array(CriterionInput).min(1).max(8),
});

export const SetInput = z.object({
  classId: z.string().min(1).max(128),
  title: z.string().trim().min(1).max(140),
  questions: z.array(QuestionInput).min(1).max(10),
});

export interface StoredQuestion {
  id: string;
  prompt: string;
  modelAnswer: string;
  rubric: RubricCriterion[];
  maxMarks: number;
}

/** Assigns stable ids (q1, q1c1 …) and totals. Marks are rounded to half steps. */
export function buildQuestions(input: z.infer<typeof QuestionInput>[]): StoredQuestion[] {
  return input.map((q, i) => {
    const rubric = q.rubric.map((c, j) => ({
      id: `q${i + 1}c${j + 1}`,
      criterion: c.criterion,
      marks: Math.round(c.marks * 2) / 2 || 0.5,
    }));
    return { id: `q${i + 1}`, prompt: q.prompt, modelAnswer: q.modelAnswer, rubric, maxMarks: maxMarks(rubric) };
  });
}

/** What a student may see before results are released: no model answer, no rubric text. */
export function studentQuestion(q: StoredQuestion) {
  return { id: q.id, prompt: q.prompt, maxMarks: q.maxMarks };
}
