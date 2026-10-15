export const EXPLAIN_LEVELS = ["simple", "standard", "lecturer"] as const;
export type ExplainLevel = (typeof EXPLAIN_LEVELS)[number];

export const EXPLAIN_LEVEL_LABELS: Record<ExplainLevel, string> = {
  simple: "Simple",
  standard: "Standard",
  lecturer: "Lecturer",
};

export const EXPLAIN_LEVEL_STORAGE_KEY = "sunroot:explainLevel";

export function parseExplainLevel(v: unknown): ExplainLevel {
  return typeof v === "string" && (EXPLAIN_LEVELS as readonly string[]).includes(v) ? (v as ExplainLevel) : "standard";
}

/** Extra system-prompt text for the chosen level ("" for standard, which keeps the default behaviour). */
export function levelInstruction(level: ExplainLevel | null | undefined): string {
  if (level === "simple") {
    return `\nEXPLANATION LEVEL: SIMPLE. Explain as if to a curious 12-year-old: everyday words, short sentences, a concrete analogy or example from daily life, and define any technical word the first time you use it. Avoid jargon and heavy notation; keep maths gentle and step by step.`;
  }
  if (level === "lecturer") {
    return `\nEXPLANATION LEVEL: LECTURER. Explain as a university lecturer would: precise terminology, full rigour, the underlying principles or derivations, edge cases and links to related concepts. Assume a motivated student who can handle formal notation.`;
  }
  return "";
}
