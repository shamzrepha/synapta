import { z } from "zod";

/** The jobs Worlds asks models to do. Each one has its own ordered list of models in the admin config (spec 4.3). */
export const TASKS = ["ingest_vision", "outline", "extract", "audit", "world_design", "activity_gen", "grader", "tutor_chat", "hook_creative"] as const;
export type TaskName = (typeof TASKS)[number];

export const TASK_LABELS: Record<TaskName, { label: string; hint: string; needs: "vision" | "text" }> = {
  ingest_vision: { label: "Read photos and handwriting", hint: "Needs a model that can see images.", needs: "vision" },
  outline: { label: "Find the structure of the notes", hint: "A fast, small model is enough.", needs: "text" },
  extract: { label: "Pull out the key facts", hint: "The most important job: use your most accurate model.", needs: "text" },
  audit: { label: "Check the notes for conflicts", hint: "A careful, reasoning model works best.", needs: "text" },
  world_design: { label: "Plan the world (zones and lessons)", hint: "A strong general model.", needs: "text" },
  activity_gen: { label: "Write the questions and games", hint: "A strong general model; this is the biggest job.", needs: "text" },
  grader: { label: "Grade written answers", hint: "A careful, reasoning model.", needs: "text" },
  tutor_chat: { label: "Answer the student's questions", hint: "A friendly, fast model.", needs: "text" },
  hook_creative: { label: "Hooks and memory tricks", hint: "A fast creative model.", needs: "text" },
};

export const capabilitySchema = z.enum(["json_schema", "json_mode", "vision", "long_context", "streaming", "tool_use"]);
export type Capability = z.infer<typeof capabilitySchema>;

export const tierSchema = z.enum(["tiny", "standard", "strong"]);
export type Tier = z.infer<typeof tierSchema>;

/** One model the admin has registered. `provider` is the id of an entry in the provider list. Nothing here is hardcoded (R10). */
export const modelProfileSchema = z.object({
  id: z.string().min(1).max(200),
  provider: z.string().min(1).max(40),
  capabilities: z.array(capabilitySchema).max(6),
  contextTokens: z.number().int().min(1000).max(4_000_000),
  maxOutputTokens: z.number().int().min(256).max(200_000),
  tier: tierSchema,
});
export type ModelProfile = z.infer<typeof modelProfileSchema>;

const routeList = z.array(z.string().min(1).max(80)).max(8);

export const aiConfigSchema = z.object({
  models: z.record(z.string().min(1).max(80), modelProfileSchema),
  routes: z.object(Object.fromEntries(TASKS.map((t) => [t, routeList])) as Record<TaskName, typeof routeList>),
  limits: z.object({
    maxConcurrentJobs: z.number().int().min(1).max(50),
    maxChunkTokens: z.object({ tiny: z.number().int().min(300).max(50_000), standard: z.number().int().min(300).max(50_000), strong: z.number().int().min(300).max(100_000) }),
  }),
});
export type AiConfig = z.infer<typeof aiConfigSchema>;

export const EMPTY_AI_CONFIG: AiConfig = {
  models: {},
  routes: Object.fromEntries(TASKS.map((t) => [t, []])) as unknown as AiConfig["routes"],
  limits: { maxConcurrentJobs: 3, maxChunkTokens: { tiny: 1500, standard: 4000, strong: 10_000 } },
};

export type ProviderKind = "openai_compatible" | "gemini";
export interface ProviderMeta {
  id: string;
  kind: ProviderKind;
  label: string;
  baseUrl?: string;
}

/** Starting points for the admin screen. Only addresses, never models or limits (those change often and are the admin's to choose). */
export const PROVIDER_PRESETS: ProviderMeta[] = [
  { id: "gemini", kind: "gemini", label: "Google Gemini" },
  { id: "groq", kind: "openai_compatible", label: "Groq", baseUrl: "https://api.groq.com/openai/v1" },
  { id: "cerebras", kind: "openai_compatible", label: "Cerebras", baseUrl: "https://api.cerebras.ai/v1" },
  { id: "openrouter", kind: "openai_compatible", label: "OpenRouter (many models, some free)", baseUrl: "https://openrouter.ai/api/v1" },
  { id: "mistral", kind: "openai_compatible", label: "Mistral", baseUrl: "https://api.mistral.ai/v1" },
  { id: "sambanova", kind: "openai_compatible", label: "SambaNova", baseUrl: "https://api.sambanova.ai/v1" },
  { id: "together", kind: "openai_compatible", label: "Together AI", baseUrl: "https://api.together.xyz/v1" },
];

export interface ProviderCall {
  model: ModelProfile;
  system: string;
  user: string;
  images?: Array<{ mime: string; dataBase64: string }>;
  jsonSchema?: object;
  temperature: number;
  maxTokens: number;
  signal?: AbortSignal;
}
export interface ProviderResult {
  text: string;
  usage?: { in: number; out: number };
}
export interface ProviderAdapter {
  call(req: ProviderCall): Promise<ProviderResult>;
}

/** A provider failure the gateway can reason about (retry later vs. give up on this model). */
export class ProviderError extends Error {
  constructor(message: string, public status: number, public retryable: boolean) {
    super(message);
    this.name = "ProviderError";
  }
}

/** Thrown when the admin has not assigned a model to a task. The message tells the admin exactly what to do (spec 4.3). */
export class AiRouteMissingError extends Error {
  constructor(public task: TaskName) {
    super(`No AI model is assigned to "${TASK_LABELS[task].label}". Open Admin, then Worlds AI models, and pick a model for this task.`);
    this.name = "AiRouteMissingError";
  }
}

/** Every model in the chain failed for this call. The pipeline marks the unit needs_retry; it never crashes the job. */
export class AiChainExhaustedError extends Error {
  constructor(public task: TaskName, public attempts: Array<{ modelId: string; reason: string }>) {
    super(`All models for "${TASK_LABELS[task].label}" failed: ${attempts.map((a) => `${a.modelId}: ${a.reason}`).join("; ")}`);
    this.name = "AiChainExhaustedError";
  }
}
