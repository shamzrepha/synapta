/**
 * Which OpenRouter model SunRoot asks for, by kind of work. One account on OpenRouter reaches every family, so each job gets the
 * cheapest model that is good at it, with fallbacks that are tried in order. IDs and prices were taken from OpenRouter's public
 * catalogue (https://openrouter.ai/api/v1/models); `npm run check:openrouter` checks that every ID still exists and can do the job
 * (images for vision, structured answers for all). The admin can override any task in the admin screen; these are only the defaults.
 */
export const OR_CLASSES = ["bulk", "vision", "long", "heavy", "grading", "code", "chat"] as const;
export type OrClass = (typeof OR_CLASSES)[number];

export interface OrClassInfo {
  label: string;
  /** models in order: the first is used, the rest only when it fails */
  chain: string[];
  why: string;
  needsImages: boolean;
}

export const OR_CLASS_INFO: Record<OrClass, OrClassInfo> = {
  bulk: {
    label: "Bulk text and quizzes",
    chain: ["deepseek/deepseek-v4-flash", "anthropic/claude-haiku-5.5", "z-ai/glm-5.3-flash"],
    why: "flashcards, quizzes, notes, guides: very cheap, 1M tokens of room, reliable JSON",
    needsImages: false,
  },
  vision: {
    label: "Reading photos and scans",
    chain: ["anthropic/claude-haiku-5.5", "qwen/qwen3.7-plus", "meta-llama/llama-4-scout"],
    why: "handwriting and diagrams: cheap models that can see, with long room for big scans",
    needsImages: true,
  },
  long: {
    label: "Long documents",
    chain: ["anthropic/claude-haiku-5.5", "deepseek/deepseek-v4-flash", "qwen/qwen3.7-plus"],
    why: "a whole textbook chapter at once (1M tokens of room, long answers)",
    needsImages: false,
  },
  heavy: {
    label: "Building classes and worlds",
    chain: ["deepseek/deepseek-v4-pro", "anthropic/claude-sonnet-5.5", "qwen/qwen3.7-plus"],
    why: "the planning and design work where quality matters, at a fraction of a premium model's price",
    needsImages: false,
  },
  grading: {
    label: "Grading and evaluation",
    chain: ["anthropic/claude-sonnet-5.5", "deepseek/deepseek-v4-pro", "qwen/qwen3.8-max-0902"],
    why: "marks students see: the most careful model first",
    needsImages: false,
  },
  code: {
    label: "Labs and simulations (code)",
    chain: ["deepseek/deepseek-v4-pro", "anthropic/claude-sonnet-5.5", "qwen/qwen3-coder"],
    why: "long, correct HTML and JavaScript; a failed lab costs more than the tokens",
    needsImages: false,
  },
  chat: {
    label: "Tutor chat",
    chain: ["deepseek/deepseek-v4-flash", "anthropic/claude-haiku-5.5", "openai/gpt-oss-120b"],
    why: "fast and cheap conversation (Groq stays faster if you use it)",
    needsImages: false,
  },
};

/** The kind of work each main-router task is. Anything not listed is bulk text. */
const TASK_CLASS: Record<string, OrClass> = {
  tutor_chat: "chat",
  notebook_chat: "chat",
  long_document: "long",
  paper_analysis: "long",
  class_build: "heavy",
  assignment_architect: "heavy",
  assignment_reviewer: "heavy",
  research_plan: "heavy",
  research_answer: "heavy",
  grading_high_stakes: "grading",
  student_evaluation: "grading",
  sim_build: "code",
  studio_build: "code",
  quest_build: "code",
};

/** The Worlds gateway's tasks (lib/ai/structured). */
const WORLD_CLASS: Record<string, OrClass> = {
  ingest_vision: "vision",
  outline: "long",
  extract: "bulk",
  audit: "heavy",
  world_design: "heavy",
  activity_gen: "bulk",
  grader: "grading",
  tutor_chat: "chat",
  hook_creative: "bulk",
};

export function orClassFor(task: string): OrClass {
  return TASK_CLASS[task] ?? WORLD_CLASS[task] ?? "bulk";
}
export const worldOrClassFor = (task: string): OrClass => WORLD_CLASS[task] ?? "bulk";

/** The models to try for a task: the admin's pick first (if any), then the recommended chain for that kind of work. */
export function chainWithOverride(task: string, override?: string): string[] {
  const base = OR_CLASS_INFO[orClassFor(task)].chain;
  const pick = (override || "").trim();
  return pick ? [pick, ...base.filter((m) => m !== pick)] : base;
}

/** Text to speech through OpenRouter: very cheap open model first, richer (dearer) ones after. Prices are per million characters. */
export const OR_TTS = {
  models: ["hexgrad/kokoro-82m", "canopylabs/orpheus-3b-0.1-ft", "mistralai/voxtral-mini-tts-2603"],
  /** Kokoro voices for the two podcast hosts and the single-voice reader */
  voices: { female: "af_heart", male: "am_michael" },
  /** the other models' own voices, for the same two roles */
  otherVoices: {
    "canopylabs/orpheus-3b-0.1-ft": { female: "tara", male: "leo" },
    "mistralai/voxtral-mini-tts-2603": { female: "gb_jane_neutral", male: "en_paul_neutral" },
  } as Record<string, { female: string; male: string }>,
};
