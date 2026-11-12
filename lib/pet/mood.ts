/** Sprout's mood and colour come from how the learner is doing: streak, time away and how well they know their topics. */

export type PetMood = "sleepy" | "calm" | "happy" | "fired" | "genius";

export interface PetPalette {
  body: string;
  shade: string;
  arm: string;
}

export interface PetStats {
  streakDays: number;
  /** whole days since the learner last studied (0 = today) */
  daysAway: number;
  /** average mastery 0..1 across the learner's topics, or null when there is no data yet */
  avgMastery: number | null;
}

export const PALETTES: Record<PetMood, PetPalette> = {
  sleepy: { body: "#8b9bb4", shade: "#6b7c97", arm: "#7a8aa5" },
  calm: { body: "#3b6df6", shade: "#1e3a8a", arm: "#2f5fe0" },
  happy: { body: "#14b8a6", shade: "#0f766e", arm: "#0d9488" },
  fired: { body: "#f97316", shade: "#9a3412", arm: "#ea580c" },
  genius: { body: "#8b5cf6", shade: "#4c1d95", arm: "#7c3aed" },
};

export const MOOD_COPY: Record<PetMood, { label: string; how: string }> = {
  sleepy: { label: "Sleepy", how: "You have been away a few days. Study today to wake me up." },
  calm: { label: "Ready", how: "Steady and ready to learn." },
  happy: { label: "Happy", how: "A study streak of 3 days or more turns me teal." },
  fired: { label: "On fire", how: "A 7-day streak sets me on fire." },
  genius: { label: "Genius", how: "Mastering your topics (80% or more) with a streak turns me violet." },
};

/** Picks the mood, strongest first: away -> sleepy; mastery + streak -> genius; long streak -> fired; short streak -> happy. */
export function petMood(s: PetStats): PetMood {
  if (s.daysAway >= 3) return "sleepy";
  if (s.avgMastery !== null && s.avgMastery >= 0.8 && s.streakDays >= 3) return "genius";
  if (s.streakDays >= 7) return "fired";
  if (s.streakDays >= 3) return "happy";
  return "calm";
}

export function paletteFor(mood: PetMood): PetPalette {
  return PALETTES[mood];
}

/** A pet name: short, plain text. */
export function cleanPetName(raw: unknown): string {
  const s = String(raw ?? "").replace(/[<>`{}\[\]\\]/g, "").replace(/\s+/g, " ").trim().slice(0, 16);
  return s.length >= 1 ? s : "Sprout";
}
