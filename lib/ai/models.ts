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

export const DEFAULT_MODEL_CONFIG = {
  tutor: "gemini-3.1-flash-lite",
  structured: "gemini-3.1-flash-lite",
  longdoc: "gemini-3.1-flash-lite",
  build: "gemini-3.6-flash",
  grading: "gemini-3.6-flash",
  voice: "gemini-3.8-live",
  legacy: "gemini-3.1-flash-lite",
  chainLight: ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite"],
  chainHeavy: ["gemini-3.6-flash", "gemini-3.7-flash", "gemini-3.5-flash", "gemini-3.8-flash"],
  overflow: "",
};

/**
 * Sanitizes a model identifier:
 * - Trims whitespace
 * - Rejects empty values (returns fallbackDefault)
 * - Emits a console warning if not in known registry, but NEVER silently rewrites it!
 */
export function sanitizeModelId(model?: string | null, fallbackDefault = DEFAULT_MODEL_CONFIG.tutor): string {
  if (!model || typeof model !== "string") return fallbackDefault;
  const trimmed = model.trim();
  if (!trimmed) return fallbackDefault;

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
