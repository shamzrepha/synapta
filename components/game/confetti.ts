"use client";

import confetti from "canvas-confetti";

export interface CelebrationOptions {
  reduceMotion?: boolean;
  intensity?: "small" | "medium" | "grand";
}

/**
 * Fires a brief tactile confetti celebration using Sunroot's natural earthy-teal & gold palette.
 * Respects Reduced Motion by no-oping immediately.
 */
export function fireCelebration({ reduceMotion, intensity = "small" }: CelebrationOptions = {}) {
  if (reduceMotion || typeof window === "undefined") return;
  try {
    const particleCount = intensity === "grand" ? 85 : intensity === "medium" ? 45 : 22;
    const spread = intensity === "grand" ? 85 : intensity === "medium" ? 64 : 46;
    confetti({
      particleCount,
      spread,
      origin: { y: 0.72 },
      colors: ["#0d9488", "#d97706", "#059669", "#0284c7", "#f59e0b"],
      disableForReducedMotion: true,
    });
  } catch {
    /* ignore canvas issues on headless environments */
  }
}
