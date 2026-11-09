import { TASKS, type Capability, type TaskName, type Tier } from "./types";

/**
 * Sorts a provider's model names into specialties so the admin can assign each job to the model that is good at it.
 * These are SUGGESTIONS from the model's name only. Nothing here picks a model by itself (R10): the admin confirms.
 */
export type Specialty = "vision" | "reasoning" | "strong" | "fast" | "not_chat";

export interface ModelGuess {
  id: string;
  specialty: Specialty;
  tier: Tier;
  capabilities: Capability[];
}

const NOT_CHAT = /whisper|guard|tts|orpheus|playai|embed|moderation|safeguard|transcri|rerank|image-gen|diffusion/i;
const VISION = /vision|scout|maverick|llava|pixtral|-vl|vl-|gemini|gpt-4o|multimodal|omni|paligemma/i;
const REASONING = /reason|r1|gpt-oss|qwen3|qwq|thinking|deepseek|kimi|magistral|o1|o3/i;

export function guessModel(id: string): ModelGuess {
  if (NOT_CHAT.test(id)) return { id, specialty: "not_chat", tier: "tiny", capabilities: [] };
  const size = /(\d+(?:\.\d+)?)\s?b\b/i.exec(id);
  const billions = size ? Number(size[1]) : null;
  const tier: Tier = /instant|lite|mini|small|flash-8|haiku/i.test(id) || (billions !== null && billions <= 9) ? "tiny" : billions !== null && billions >= 60 ? "strong" : /pro|large|versatile|opus|sonnet|120b|405b/i.test(id) ? "strong" : "standard";
  const vision = VISION.test(id);
  const reasoning = REASONING.test(id);
  const specialty: Specialty = vision ? "vision" : reasoning ? "reasoning" : tier === "strong" ? "strong" : tier === "tiny" ? "fast" : "strong";
  const capabilities: Capability[] = ["json_mode"];
  if (vision) capabilities.push("vision");
  if (tier !== "tiny") capabilities.push("long_context");
  return { id, specialty, tier, capabilities };
}

/** Which specialty suits each job. */
export const TASK_SPECIALTY: Record<TaskName, Specialty[]> = {
  ingest_vision: ["vision"],
  outline: ["fast", "strong"],
  extract: ["strong", "reasoning"],
  audit: ["reasoning", "strong"],
  world_design: ["strong", "reasoning"],
  activity_gen: ["strong", "reasoning", "fast"],
  grader: ["reasoning", "strong"],
  tutor_chat: ["fast", "strong"],
  hook_creative: ["fast", "strong"],
};

/** For each task, the registered models that fit it, best fit first. */
export function suggestRoutes(models: Record<string, ModelGuess>): Record<TaskName, string[]> {
  const out = {} as Record<TaskName, string[]>;
  for (const task of TASKS) {
    const prefs = TASK_SPECIALTY[task];
    out[task] = Object.entries(models)
      .map(([key, m]) => ({ key, rank: prefs.indexOf(m.specialty) }))
      .filter((x) => x.rank >= 0)
      .sort((a, b) => a.rank - b.rank)
      .map((x) => x.key)
      .slice(0, 3);
  }
  return out;
}
