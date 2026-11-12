/** Learning accessibility, reading comfort & AI teaching style preferences. Pure & unit-tested. */

export type ReadingFont = "default" | "dyslexic";
export type TtsSpeed = 0.85 | 1 | 1.25;

export interface AccessibilityPrefs {
  readingFont: ReadingFont;
  wideSpacing: boolean;
  warmPaper: boolean;
  readingRuler: boolean;
  adhdFocus: boolean;
  literalMode: boolean;
  kidsMode: boolean;
  ttsSpeed: TtsSpeed;
}

export const ACCESSIBILITY_KEY = "sunroot.a11y";

export const DEFAULT_ACCESSIBILITY: AccessibilityPrefs = {
  readingFont: "default",
  wideSpacing: false,
  warmPaper: false,
  readingRuler: false,
  adhdFocus: false,
  literalMode: false,
  kidsMode: false,
  ttsSpeed: 1,
};

const VALID_SPEEDS: readonly number[] = [0.85, 1, 1.25];

export function parseAccessibility(raw: unknown): AccessibilityPrefs {
  let v: unknown = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw);
    } catch {
      return { ...DEFAULT_ACCESSIBILITY };
    }
  }
  if (!v || typeof v !== "object") return { ...DEFAULT_ACCESSIBILITY };
  const o = v as Record<string, unknown>;
  const speed = typeof o.ttsSpeed === "number" && VALID_SPEEDS.includes(o.ttsSpeed) ? (o.ttsSpeed as TtsSpeed) : 1;
  return {
    readingFont: o.readingFont === "dyslexic" ? "dyslexic" : "default",
    wideSpacing: o.wideSpacing === true,
    warmPaper: o.warmPaper === true,
    readingRuler: o.readingRuler === true,
    adhdFocus: o.adhdFocus === true,
    literalMode: o.literalMode === true,
    kidsMode: o.kidsMode === true,
    ttsSpeed: speed,
  };
}

/** Converts user accessibility preferences into prompt profile tags understood by getAudienceSystemPrompt(). */
export function profileTagsFromAccessibility(a: AccessibilityPrefs): string[] {
  const tags: string[] = [];
  if (a.adhdFocus) tags.push("adhd_friendly", "micro_steps");
  if (a.literalMode) tags.push("literal_mode", "autism_friendly");
  if (a.kidsMode) tags.push("kids", "teach_the_bot");
  return tags;
}
