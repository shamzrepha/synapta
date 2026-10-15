import { z } from "zod";
import crypto from "crypto";

export const UNAMBIGUOUS_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function generateSecureJoinCode(prefix = "SYN-"): string {
  const bytes = crypto.randomBytes(8);
  let code = prefix;
  for (let i = 0; i < 6; i++) {
    code += UNAMBIGUOUS_ALPHABET[bytes[i] % UNAMBIGUOUS_ALPHABET.length];
  }
  return code;
}

export const createClassSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(100),
  subject: z.string().min(2, "Subject must be at least 2 characters").max(50),
  description: z.string().min(10, "Description must be at least 10 characters").max(1000),
  level: z.enum(["school", "undergrad", "professional"]).default("undergrad"),
  audienceTags: z.array(z.string()).default([]),
  durationWeeks: z.number().int().min(1).max(52).default(4),
  visibility: z.enum(["public", "private"]).default("public"),
  status: z.enum(["draft", "published", "archived"]).default("published"),
  buildState: z.enum(["empty", "drafting", "ready", "needs_review"]).default("empty"),
  /** Narrated two-voice audio lesson for every topic (free neural voices, generated once per topic) */
  audioLessons: z.boolean().default(true),
  narratorVoice: z.enum(["female", "male"]).default("female"),
  /** AI classroom plan chosen in the wizard (kept for the teacher to revisit) */
  recommendedPlan: z.record(z.unknown()).optional(),
});

export const updateClassSchema = z.object({
  title: z.string().min(3).max(100).optional(),
  subject: z.string().min(2).max(50).optional(),
  description: z.string().min(10).max(1000).optional(),
  level: z.enum(["school", "undergrad", "professional"]).optional(),
  audienceTags: z.array(z.string()).optional(),
  durationWeeks: z.number().int().min(1).max(52).optional(),
  visibility: z.enum(["public", "private"]).optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  buildState: z.enum(["empty", "drafting", "ready", "needs_review"]).optional(),
  audioLessons: z.boolean().optional(),
  narratorVoice: z.enum(["female", "male"]).optional(),
});

export const joinRequestDecisionSchema = z.object({
  decision: z.enum(["approve", "reject"]),
});

export type CreateClassInput = z.infer<typeof createClassSchema>;
export type UpdateClassInput = z.infer<typeof updateClassSchema>;
export type JoinRequestDecisionInput = z.infer<typeof joinRequestDecisionSchema>;
