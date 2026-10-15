/** Device-level learning preferences (data saver etc.). Pure helpers so they can be unit tested. */

export interface Prefs {
  dataSaver: boolean;
  reduceMotion: boolean;
  noAutoplay: boolean;
}

export const DEFAULT_PREFS: Prefs = { dataSaver: false, reduceMotion: false, noAutoplay: false };
export const PREFS_KEY = "sunroot.prefs";

/** Accepts anything (JSON string, object, null) and returns a complete, valid Prefs. */
export function parsePrefs(raw: unknown): Prefs {
  let v: unknown = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw);
    } catch {
      return { ...DEFAULT_PREFS };
    }
  }
  if (!v || typeof v !== "object") return { ...DEFAULT_PREFS };
  const o = v as Record<string, unknown>;
  return {
    dataSaver: o.dataSaver === true,
    reduceMotion: o.reduceMotion === true,
    noAutoplay: o.noAutoplay === true,
  };
}

/** Data saver implies no autoplay of audio/video. */
export function shouldAutoplay(p: Prefs): boolean {
  return !p.dataSaver && !p.noAutoplay;
}

/** Whether heavy things (3D, audio preload, full-res images) should wait for a tap. */
export function shouldDeferHeavy(p: Prefs): boolean {
  return p.dataSaver;
}
