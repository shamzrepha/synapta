import { z } from "zod";

export const bktParamsSchema = z
  .object({
    pL0: z.number().gt(0).lt(1).default(0.2),
    pT: z.number().gt(0).lt(1).default(0.15),
    pG: z.number().gt(0).lt(1).default(0.2),
    pS: z.number().gt(0).lt(1).default(0.1),
  })
  .refine((data) => data.pG + data.pS < 1, {
    message: "Model identifiability violation: pG + pS must be strictly less than 1.0",
  });

export const kcSchema = z.object({
  title: z.string().trim().min(2, "Title must be at least 2 characters").max(120),
  description: z.string().trim().min(5, "Description must be at least 5 characters").max(2000),
  week: z.number().int().min(1).max(52).optional(),
  objectives: z.array(z.string().trim().min(2)).min(1, "At least one learning objective is required"),
  prerequisiteIds: z.array(z.string()).default([]),
  bkt: bktParamsSchema.default({
    pL0: 0.2,
    pT: 0.15,
    pG: 0.2,
    pS: 0.1,
  }),
  difficulty: z.enum(["introductory", "intermediate", "advanced"]).default("intermediate"),
  status: z.enum(["draft", "published"]).default("draft"),
  sourceMaterialIds: z.array(z.string()).default([]),
});

export const lessonCitationSchema = z.object({
  sourceId: z.string().min(1),
  title: z.string().min(1),
  page: z.number().int().min(1).optional(),
  textSnippet: z.string().max(1000).optional(),
});

export const lessonSchema = z.object({
  title: z.string().trim().min(2).max(150),
  markdown: z.string().min(10, "Lesson content must be at least 10 characters"),
  status: z.enum(["draft", "approved", "rejected"]).default("draft"),
  citations: z.array(lessonCitationSchema).default([]),
  readingTimeMinutes: z.number().int().min(1).max(120).optional(),
});

export const assignmentSchema = z.object({
  title: z.string().trim().min(2).max(150),
  type: z.enum(["quiz", "lab", "peer_explain", "transfer_test"]),
  kcId: z.string().optional(),
  status: z.enum(["draft", "published"]).default("draft"),
  description: z.string().max(2000).optional(),
  maxScore: z.number().int().min(1).max(1000).default(100),
  dueDate: z.string().optional(),
});
