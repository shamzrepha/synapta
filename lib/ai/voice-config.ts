import { adminDb } from "@/lib/firebase/admin";
import { OR_TTS_CHOICES } from "@/lib/ai/openrouter-models";

/**
 * Which voice speaks the podcast and the tutor. "openrouter-first" uses the chosen OpenRouter voice when a key is set (it falls back to the
 * free Edge voice if that fails); "edge-first" keeps the free voice first and only uses OpenRouter when Edge is down.
 */
export interface VoicePref {
  engine: "openrouter-first" | "edge-first";
  model: string;
  female: string;
  male: string;
}

export const DEFAULT_VOICE_PREF: VoicePref = { engine: "openrouter-first", model: OR_TTS_CHOICES[0].model, female: OR_TTS_CHOICES[0].female, male: OR_TTS_CHOICES[0].male };

let cache: VoicePref | null = null;
let cachedAt = 0;

export function normaliseVoicePref(raw: unknown): VoicePref {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const choice = OR_TTS_CHOICES.find((c) => c.model === r.model) ?? OR_TTS_CHOICES[0];
  const text = (v: unknown, fallback: string) => (typeof v === "string" && /^[A-Za-z0-9_.-]{1,60}$/.test(v.trim()) ? v.trim() : fallback);
  return {
    engine: r.engine === "edge-first" ? "edge-first" : "openrouter-first",
    model: choice.model,
    female: text(r.female, choice.female),
    male: text(r.male, choice.male),
  };
}

export async function getVoicePref(force = false): Promise<VoicePref> {
  if (!force && cache && Date.now() - cachedAt < 30_000) return cache;
  try {
    const doc = await adminDb().collection("systemConfig").doc("voice").get();
    cache = doc.exists ? normaliseVoicePref(doc.data()) : DEFAULT_VOICE_PREF;
  } catch {
    cache = cache || DEFAULT_VOICE_PREF;
  }
  cachedAt = Date.now();
  return cache;
}

export function setCachedVoicePref(p: VoicePref) {
  cache = p;
  cachedAt = Date.now();
}
