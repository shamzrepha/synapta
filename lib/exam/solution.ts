import { z } from "zod";

/**
 * The shape the past-question solver prompt asks the model for. Models drift (a string where a list was asked, a missing
 * field, numbers as strings), so every field has a tolerant default: only a reply with no usable working or answer is rejected.
 */
const text = z.preprocess((v) => (typeof v === "number" ? String(v) : v), z.string());
const list = z.preprocess((v) => (typeof v === "string" ? (v.trim() ? [v] : []) : v), z.array(text).default([]));

const stepSchema = z.object({
  stepNumber: z.coerce.number().optional(),
  title: text.default(""),
  detail: text.default(""),
});

export const pastQuestionSolutionSchema = z
  .object({
    cohortStyle: text.optional(),
    keyPrinciple: text.default(""),
    formulas: list,
    hints: list,
    steps: z.array(stepSchema).default([]),
    finalAnswer: text.default(""),
    examinerTraps: list,
    twinQuestion: z
      .object({ question: text.default(""), solution: text.default("") })
      .nullish()
      .transform((v) => v ?? { question: "", solution: "" }),
    cbtBlock: z
      .object({
        stem: text.default(""),
        options: list,
        correctIndex: z.coerce.number().int().min(0).default(0),
        explanation: text.default(""),
      })
      .nullish()
      .transform((v) => v ?? { stem: "", options: [], correctIndex: 0, explanation: "" }),
  })
  // an empty object is not a solution: without steps or a final answer the learner has nothing to read
  .refine((s) => s.steps.length > 0 || s.finalAnswer.trim().length > 0, { message: "Solution has no steps and no final answer" });

export type PastQuestionSolution = z.infer<typeof pastQuestionSolutionSchema>;
