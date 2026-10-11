import { z } from "zod";

export const TheoryQuestionSchema = z.object({
  id: z.string(),
  number: z.number(),
  type: z.enum(["short_answer", "long_derivation", "conceptual_analysis", "case_study"]),
  question: z.string(),
  scenarioContext: z.string().optional(),
  marks: z.number().default(10),
  rubric: z.array(
    z.object({
      criterion: z.string(),
      points: z.number(),
      description: z.string(),
    })
  ),
  exemplarAnswer: z.string(),
  distractorMisconceptions: z.array(z.string()).optional(),
});

export const PracticalExperimentSchema = z.object({
  objective: z.string(),
  variables: z.object({
    independent: z.string(),
    dependent: z.string(),
    controlled: z.array(z.string()),
  }),
  apparatus: z.array(
    z.object({
      item: z.string(),
      specification: z.string(),
    })
  ),
  procedure: z.array(
    z.object({
      stepNumber: z.number(),
      instruction: z.string(),
      safetyOrTip: z.string().optional(),
    })
  ),
  dataCollectionTable: z.object({
    columns: z.array(z.string()),
    sampleRowHint: z.string(),
  }),
  analysisQuestions: z.array(
    z.object({
      question: z.string(),
      marks: z.number(),
      guide: z.string(),
    })
  ),
  totalMarks: z.number().default(25),
});

export const AssignmentPayloadSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(3),
  kind: z.enum(["theory", "practical"]),
  targetKcIds: z.array(z.string()),
  difficulty: z.enum(["introductory", "intermediate", "advanced", "olympiad"]),
  estimatedMinutes: z.number(),
  overview: z.string(),
  theoryQuestions: z.array(TheoryQuestionSchema).optional(),
  practicalExperiment: PracticalExperimentSchema.optional(),
  teacherNotes: z.string(),
  status: z.enum(["draft", "published"]).default("draft"),
  createdAt: z.any().optional(),
  updatedAt: z.any().optional(),
});

export type TheoryQuestion = z.infer<typeof TheoryQuestionSchema>;
export type PracticalExperiment = z.infer<typeof PracticalExperimentSchema>;
export type AssignmentPayload = z.infer<typeof AssignmentPayloadSchema>;
