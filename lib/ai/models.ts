/**
 * Single source of truth for Gemini AI models, tier limits, fallback chains, and sanitization.
 * Rule: Never hardcode model IDs outside this registry + environment variables.
 * Rule: Never silently rewrite configured models.
 */

export type ModelTier = "light" | "heavy" | "overflow";

export interface ModelMeta {
  id: string;
  tier: ModelTier;
  rpd: number; // Requests Per Day (Free-tier cap)
  rpm: number; // Requests Per Minute
  tpm: number; // Tokens Per Minute
  supportsSystemInstruction: boolean;
  supportsJson: boolean;
  notes?: string;
}

export const KNOWN_MODELS: Record<string, ModelMeta> = {
  "gemini-3.1-flash-lite": {
    id: "gemini-3.1-flash-lite",
    tier: "light",
    rpd: 500,
    rpm: 15,
    tpm: 250000,
    supportsSystemInstruction: true,
    supportsJson: true,
    notes: "Primary routine model: highest free quota (500 RPD)",
  },
  "gemini-3.5-flash-lite": {
    id: "gemini-3.5-flash-lite",
    tier: "light",
    rpd: 500,
    rpm: 15,
    tpm: 250000,
    supportsSystemInstruction: true,
    supportsJson: true,
    notes: "Secondary routine model: high free quota (500 RPD)",
  },
  "gemini-3.6-flash": {
    id: "gemini-3.6-flash",
    tier: "heavy",
    rpd: 20,
    rpm: 5,
    tpm: 250000,
    supportsSystemInstruction: true,
    supportsJson: true,
    notes: "Primary heavy reasoning model: reserved for class build and grading",
  },
  "gemini-3.7-flash": {
    id: "gemini-3.7-flash",
    tier: "heavy",
    rpd: 20,
    rpm: 5,
    tpm: 250000,
    supportsSystemInstruction: true,
    supportsJson: true,
    notes: "Secondary heavy reasoning model (20 RPD cap)",
  },
  "gemini-3.5-flash": {
    id: "gemini-3.5-flash",
    tier: "heavy",
    rpd: 20,
    rpm: 5,
    tpm: 250000,
    supportsSystemInstruction: true,
    supportsJson: true,
    notes: "Tertiary heavy fallback (20 RPD cap)",
  },
  "gemini-3.8-flash": {
    id: "gemini-3.8-flash",
    tier: "heavy",
    rpd: 20,
    rpm: 5,
    tpm: 250000,
    supportsSystemInstruction: true,
    supportsJson: true,
    notes: "Last-resort heavy fallback (20 RPD cap)",
  },
  "gemini-3-flash-preview": {
    id: "gemini-3-flash-preview",
    tier: "heavy",
    rpd: 20,
    rpm: 5,
    tpm: 250000,
    supportsSystemInstruction: true,
    supportsJson: true,
  },
  "gemini-flash-latest": {
    id: "gemini-flash-latest",
    tier: "heavy",
    rpd: 20,
    rpm: 5,
    tpm: 250000,
    supportsSystemInstruction: true,
    supportsJson: true,
  },
  "gemini-flash-lite-latest": {
    id: "gemini-flash-lite-latest",
    tier: "light",
    rpd: 500,
    rpm: 15,
    tpm: 250000,
    supportsSystemInstruction: true,
    supportsJson: true,
  },
  "gemini-3.8-live": {
    id: "gemini-3.8-live",
    tier: "heavy",
    rpd: 20,
    rpm: 5,
    tpm: 250000,
    supportsSystemInstruction: true,
    supportsJson: false,
    notes: "Audio/Live session model",
  },
  "gemini-3.8-flash-lite-tts": {
    id: "gemini-3.8-flash-lite-tts",
    tier: "heavy",
    rpd: 100,
    rpm: 10,
    tpm: 250000,
    supportsSystemInstruction: false,
    supportsJson: false,
    notes: "Gemini TTS (fast, low cost); fallback narrator when free Edge voices are unavailable",
  },
  "gemini-3.8-flash-tts": {
    id: "gemini-3.8-flash-tts",
    tier: "heavy",
    rpd: 50,
    rpm: 10,
    tpm: 250000,
    supportsSystemInstruction: false,
    supportsJson: false,
    notes: "Gemini TTS (higher quality)",
  },
  "gemma-4-26b-a4b-it": {
    id: "gemma-4-26b-a4b-it",
    tier: "overflow",
    rpd: 14400,
    rpm: 30,
    tpm: 16000,
    supportsSystemInstruction: false,
    supportsJson: false,
    notes: "Overflow text-only model (low TPM 16K, prompt+output <= 6K)",
  },
  "gemma-4-31b-it": {
    id: "gemma-4-31b-it",
    tier: "overflow",
    rpd: 14400,
    rpm: 30,
    tpm: 16000,
    supportsSystemInstruction: false,
    supportsJson: false,
    notes: "Overflow text-only model (low TPM 16K)",
  },
};

/**
 * Which model "group" each task runs on. Groups map to the DEFAULT_MODEL_CONFIG slots (and their
 * GEMINI_MODEL_* env overrides); admins can still pin any single task in Admin → System.
 *
 *  tutor      fast, conversational (chat, explanations)            → light model
 *  structured JSON that is verified/normalised afterwards (quizzes,
 *             flashcards, routing, study sets, mind maps)          → light model
 *  longdoc    long context / long-form writing (lesson notes, study
 *             guides, papers, podcast scripts, research answers)   → light model (1M context)
 *  build      long, precise output where mistakes are costly (class
 *             builds, simulations, Maker Studio designs, assignments) → strongest model
 *  grading    high-stakes evaluation                                → strongest model
 *  voice      speech synthesis                                      → TTS model
 */
export type TaskGroup = "tutor" | "structured" | "longdoc" | "build" | "grading" | "voice" | "other";

export const TASK_GROUPS: Record<string, TaskGroup> = {
  tutor_chat: "tutor",
  notebook_chat: "tutor",
  explain_selection: "tutor",
  structured_spec: "structured",
  quiz_gen: "structured",
  flashcard_gen: "structured",
  card_gen: "structured",
  material_route: "structured",
  notebook_artifacts: "structured",
  notebook_mindmap: "structured",
  source_guide: "structured",
  research_plan: "structured",
  long_document: "longdoc",
  lesson_notes: "longdoc",
  study_guide: "longdoc",
  class_study_guide: "longdoc",
  paper_analysis: "longdoc",
  discussion_script: "longdoc",
  research_answer: "longdoc",
  class_build: "build",
  sim_build: "build",
  studio_build: "build",
  assignment_architect: "build",
  assignment_author: "build",
  assignment_reviewer: "build",
  grading_high_stakes: "grading",
  voice: "voice",
  voice_tts: "voice",
};

export function taskGroup(task: string): TaskGroup {
  return TASK_GROUPS[task] || "other";
}

/** Strong-model tasks walk the heavy chain first; everything else stays on light models to protect heavy quota. */
export function isHeavyTask(task: string): boolean {
  const g = taskGroup(task);
  return g === "build" || g === "grading";
}

export const DEFAULT_MODEL_CONFIG = {
  // gemini-3.5-flash-lite is Google's current Flash-Lite; 3.1-flash-lite is scheduled for retirement
  tutor: "gemini-3.5-flash-lite",
  structured: "gemini-3.5-flash-lite",
  longdoc: "gemini-3.5-flash-lite",
  build: "gemini-3.6-flash",
  grading: "gemini-3.6-flash",
  voice: "gemini-3.8-flash-lite-tts",
  legacy: "gemini-3.5-flash-lite",
  chainLight: ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"],
  // gemini-3.5-flash now routes to 3.6-flash and 3.7-flash isn't in Google's current list, so both are dropped
  chainHeavy: ["gemini-3.6-flash", "gemini-3.8-flash", "gemini-flash-latest"],
  overflow: "",
};

/**
 * Sanitizes a model identifier:
 * - Trims whitespace
 * - Rejects empty values (returns fallbackDefault)
 * - Emits a console warning if not in known registry, but NEVER silently rewrites it!
 */
/**
 * Model IDs Google has shut down (or that never existed in the public API). Stale env vars or
 * admin settings that still name them are replaced with the current defaults instead of failing.
 */
export const RETIRED_MODELS = new Set([
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
  "gemini-1.5-pro",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash-exp",
  "gemini-3-pro-preview",
  "gemini-3.1-flash-lite-preview",
  "gemini-2.5-computer-use-preview-10-2025",
]);

export function isRetiredModel(model: string): boolean {
  return RETIRED_MODELS.has(model.trim()) || /^gemini-(1\.|2\.0)/.test(model.trim());
}

export function sanitizeModelId(model?: string | null, fallbackDefault = DEFAULT_MODEL_CONFIG.tutor): string {
  if (!model || typeof model !== "string") return fallbackDefault;
  const trimmed = model.trim();
  if (!trimmed) return fallbackDefault;
  if (isRetiredModel(trimmed)) {
    console.warn(`[lib/ai/models] Model "${trimmed}" has been shut down by Google; using "${fallbackDefault}" instead.`);
    return fallbackDefault;
  }

  if (!KNOWN_MODELS[trimmed]) {
    console.warn(`[lib/ai/models] Warning: Model ID "${trimmed}" is not recognized in standard registry. Passing through without modification.`);
  }

  return trimmed;
}

/**
 * Returns the Pacific date string (YYYY-MM-DD) for midnight Pacific quota resets.
 */
export function getPacificDateString(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Returns configured or default RPD (Requests Per Day) limit for a given model.
 */
export function getRpdLimit(model: string): number {
  try {
    if (process.env.GEMINI_RPD_LIMITS) {
      const parsed = JSON.parse(process.env.GEMINI_RPD_LIMITS);
      if (typeof parsed[model] === "number") return parsed[model];
    }
  } catch {}

  const meta = KNOWN_MODELS[model];
  if (meta) return meta.rpd;
  if (model.includes("lite")) return 500;
  return 20;
}

/**
 * Parses and deduplicates a comma-separated chain of model identifiers.
 */
export function parseModelChain(chainStr?: string, defaultChain: string[] = []): string[] {
  if (!chainStr || typeof chainStr !== "string" || !chainStr.trim()) {
    return Array.from(new Set(defaultChain));
  }
  const parts = chainStr
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => sanitizeModelId(s));

  return Array.from(new Set(parts.length > 0 ? parts : defaultChain));
}
