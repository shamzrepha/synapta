import { z } from "zod";
import { ApiError } from "@/lib/api/errors";

/** Upper bounds keep one request from turning into an unbounded (and expensive) model prompt. */
export const SEED_MATERIAL_MAX_CHARS = 60_000;

const text = (max: number) => z.string().trim().min(1).max(max);

export const classBuildRequestSchema = z
  .object({
    title: text(200).optional(),
    subject: text(120).optional(),
    description: z.string().trim().max(4000).optional(),
    level: z.enum(["school", "undergrad", "professional"]).optional(),
    durationWeeks: z.number().int().min(1).max(52).optional(),
    audienceTags: z.array(text(40)).max(12).optional(),
    seedMaterialText: z.string().max(SEED_MATERIAL_MAX_CHARS).optional(),
  })
  .strict();

export type ClassBuildRequest = z.infer<typeof classBuildRequestSchema>;

/** Reads the build request. An empty body is allowed (everything then defaults to the class); a malformed one is refused. */
export async function parseClassBuildRequest(req: Request): Promise<ClassBuildRequest> {
  const raw = await req.text();
  let json: unknown = {};
  if (raw.trim()) {
    try {
      json = JSON.parse(raw);
    } catch {
      throw new ApiError(400, "BAD_JSON", "Malformed JSON request body");
    }
  }
  const parsed = classBuildRequestSchema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join(", ");
    throw new ApiError(400, "VALIDATION", issues);
  }
  return parsed.data;
}
