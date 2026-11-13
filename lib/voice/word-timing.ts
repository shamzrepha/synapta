/** When each word of a spoken passage is said, in milliseconds from the start of its audio. */
export interface WordTiming {
  /** the word as spoken */
  t: string;
  s: number;
  e: number;
}

/** Edge's neural voices send word boundaries in 100-nanosecond units. */
export function boundariesToTimings(items: Array<{ text?: string; offset?: number; duration?: number }>): WordTiming[] {
  return items
    .filter((b) => typeof b.text === "string" && b.text.trim() && Number.isFinite(b.offset) && Number.isFinite(b.duration))
    .map((b) => ({ t: String(b.text).trim(), s: Math.round((b.offset as number) / 10_000), e: Math.round(((b.offset as number) + (b.duration as number)) / 10_000) }))
    .filter((w) => w.e >= w.s);
}

/** The audio is 48 kbps mono MP3, so its length follows from its size. */
export function mp3DurationMs(bytes: number, kbps = 48): number {
  return Math.round(((bytes * 8) / (kbps * 1000)) * 1000);
}

/**
 * When the service sends no word boundaries, spread the passage's length over its words by how long each is to say (letters, plus a
 * pause after punctuation). Good enough to keep a highlight and a hop moving with the voice.
 */
export function estimateWordTimings(text: string, durationMs: number): WordTiming[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length || durationMs <= 0) return [];
  const weight = (w: string) => Math.max(2, w.replace(/[^\p{L}\p{N}]/gu, "").length) + (/[.!?]$/.test(w) ? 3 : /[,;:]$/.test(w) ? 1.5 : 0);
  const total = words.reduce((n, w) => n + weight(w), 0);
  const out: WordTiming[] = [];
  let at = 0;
  for (const w of words) {
    const len = (weight(w) / total) * durationMs;
    out.push({ t: w, s: Math.round(at), e: Math.round(at + len) });
    at += len;
  }
  return out;
}

/** The index of the word being said at `ms` (the last one that has started), or -1 before the first. */
export function wordAt(timings: WordTiming[], ms: number): number {
  let lo = 0;
  let hi = timings.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (timings[mid].s <= ms) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}
