import { z } from "zod";

/**
 * "Debug my circuit": what the model must return for a photo of a real breadboard plus a symptom.
 * Model output is untrusted: it is parsed with this schema and then normalised by `normalizeDiagnosis`,
 * which clamps lengths and never lets a poor photo produce a confident answer.
 */

const str = (n: number) => z.string().max(n).default("");

export const causeSchema = z.object({
  title: str(120),
  /** why this would produce the symptom */
  why: str(500),
  /** what supports it: "photo" (visible in the picture), "symptom" (inferred from the description), "datasheet" (a known property of the part) */
  evidence: z.enum(["photo", "symptom", "datasheet"]).default("symptom"),
  likelihood: z.enum(["high", "medium", "low"]).default("medium"),
  test: z
    .object({
      tool: z.enum(["multimeter", "test sketch", "visual check"]).default("visual check"),
      steps: z.array(z.string().max(300)).max(6).default([]),
      /** the reading or behaviour that confirms this cause */
      expect: str(300),
    })
    .default({}),
  fix: str(500),
});

export const diagnosisSchema = z.object({
  /** what the model could actually see in the photo, in plain words */
  seen: z.array(z.string().max(200)).max(12).default([]),
  photoQuality: z.enum(["clear", "usable", "blurry", "unusable"]).default("usable"),
  causes: z.array(causeSchema).max(6).default([]),
  confidence: z.enum(["low", "medium", "high"]).default("low"),
  /** things hidden or unreadable in the photo that matter (wire colours, hidden holes, resistor bands …) */
  cannotSee: z.array(z.string().max(200)).max(10).default([]),
  /** what to photograph or measure next */
  nextSteps: z.array(z.string().max(250)).max(6).default([]),
  /** an optional tiny Arduino test sketch that isolates the problem */
  testSketch: z.string().max(1200).optional(),
});

export type Diagnosis = z.output<typeof diagnosisSchema>;
export type Cause = z.output<typeof causeSchema>;

const LIKELIHOOD_RANK = { high: 0, medium: 1, low: 2 } as const;

/**
 * Enforces the honesty rules the prompt asks for, in case the model ignored them:
 * - a blurry or unusable photo is never "medium"/"high" confidence and nothing is claimed as seen in it;
 * - a clear photo can reach at most "high" only when the top cause is backed by what is visible, otherwise "medium";
 * - causes are ranked most likely first, and "photo" evidence is downgraded when the photo is not good enough;
 * - a diagnosis with no cause asks for a better photo instead of guessing.
 */
export function normalizeDiagnosis(input: Diagnosis): Diagnosis {
  const d: Diagnosis = JSON.parse(JSON.stringify(input));
  const poor = d.photoQuality === "blurry" || d.photoQuality === "unusable";
  d.causes = d.causes
    .filter((c) => c.title.trim())
    .map((c) => ({ ...c, evidence: poor && c.evidence === "photo" ? "symptom" : c.evidence }) as Cause)
    .sort((a, b) => LIKELIHOOD_RANK[a.likelihood] - LIKELIHOOD_RANK[b.likelihood]);
  if (poor) {
    d.confidence = "low";
    d.seen = [];
    d.causes = d.causes.map((c) => ({ ...c, likelihood: c.likelihood === "high" ? "medium" : c.likelihood }) as Cause);
    if (!d.cannotSee.some((x) => /photo/i.test(x))) d.cannotSee.unshift("The photo is too blurry or dark to read wires and legs.");
    if (!d.nextSteps.some((x) => /photo/i.test(x))) d.nextSteps.unshift("Retake the photo in bright light, from straight above, close enough to see each wire end.");
  } else if (d.confidence === "high" && !d.causes.some((c) => c.evidence === "photo" && c.likelihood === "high")) {
    d.confidence = "medium";
  }
  if (d.photoQuality === "usable" && d.confidence === "high") d.confidence = "medium";
  if (!d.causes.length) {
    d.confidence = "low";
    if (!d.nextSteps.length) d.nextSteps.push("Describe what you expected and what happens, and add a clearer photo of the wiring.");
  }
  return d;
}

/** Accepts only a JPEG/PNG/WebP data URL of a sensible size; returns mime + base64 or null. */
export function parseImageDataUrl(dataUrl: string, maxChars = 1_400_000): { mimeType: string; data: string } | null {
  if (dataUrl.length > maxChars) return null;
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return null;
  return { mimeType: m[1], data: m[2] };
}
