import { z } from "zod";

export const createClassSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(100),
  subject: z.string().min(2, "Subject must be at least 2 characters").max(50),
  description: z.string().min(10, "Description must be at least 10 characters").max(500),
  visibility: z.enum(["public", "private"]).default("public"),
  status: z.enum(["draft", "published"]).default("published"),
});

export const updateClassSchema = z.object({
  title: z.string().min(3).max(100).optional(),
  subject: z.string().min(2).max(50).optional(),
  description: z.string().min(10).max(500).optional(),
  visibility: z.enum(["public", "private"]).optional(),
  status: z.enum(["draft", "published"]).optional(),
});

export const joinRequestDecisionSchema = z.object({
  decision: z.enum(["approve", "reject"]),
});

export type CreateClassInput = z.infer<typeof createClassSchema>;
export type UpdateClassInput = z.infer<typeof updateClassSchema>;
export type JoinRequestDecisionInput = z.infer<typeof joinRequestDecisionSchema>;
