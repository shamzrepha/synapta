import { SPROUT_H, SPROUT_W, type Pt } from "./swing";

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Where Sprout's box goes to stand on top of a word: centred over it, feet on the word's top edge. Kept on screen. */
export function perchOnWord(word: Box, viewport: { width: number; height: number }): Pt {
  const x = word.left + word.width / 2 - SPROUT_W / 2;
  const y = word.top - SPROUT_H + 10;
  return { x: Math.min(Math.max(x, 4), Math.max(4, viewport.width - SPROUT_W - 4)), y: Math.min(Math.max(y, 4), Math.max(4, viewport.height - SPROUT_H - 4)) };
}

/** How long a hop between two words takes: short ones are quick, a jump to the next line a little longer, never slower than a word is. */
export function hopMs(from: Pt, to: Pt, wordMs: number): number {
  const d = Math.hypot(to.x - from.x, to.y - from.y);
  const natural = 170 + d * 0.9;
  const byVoice = Math.min(natural, Math.max(150, wordMs * 1.6));
  // however quick the voice is, a long hop (the end of one line to the start of the next) is never faster than about 1.1 px per ms
  return Math.round(Math.min(620, Math.max(150, byVoice, d / 1.1)));
}

/** A little jump from one word to the next: along the line, with a small arc (higher for a longer hop or a new line). */
export function hopPath(from: Pt, to: Pt): (u: number) => Pt {
  const d = Math.hypot(to.x - from.x, to.y - from.y);
  const arc = Math.min(46, 8 + d * 0.16);
  return (u: number) => {
    const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; // eases in and out, so each hop starts and lands softly
    return { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e - Math.sin(Math.PI * u) * arc };
  };
}
