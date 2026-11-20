import type { Pt } from "./swing";
import { hopMs } from "./read-hop";

/** The one place to tune how Sprout keeps up with the voice (all in real milliseconds). */
export const READ_SYNC = {
  /** how far ahead of the voice Sprout stands, at normal speed */
  leadMs: 260,
  /** extra lead per 1.0 of playback speed above 1 (a faster voice needs Sprout to start earlier) */
  leadPerRate: 0.7,
  /** a hop is always done this long before its word starts */
  landMarginMs: 40,
  minHopMs: 70,
  /** a hop to the next word on the same line */
  sameLineMaxMs: 130,
} as const;

const rateOf = (rate: number) => (Number.isFinite(rate) ? Math.min(2, Math.max(0.5, rate)) : 1);

/** Real time Sprout stands ahead of the voice. */
export function realLeadMs(rate: number): number {
  const r = rateOf(rate);
  return Math.round(READ_SYNC.leadMs * (1 + Math.max(0, r - 1) * READ_SYNC.leadPerRate));
}

/** The lead in clip time (what `wordAt` is asked about): real time times the playback speed. */
export function leadClipMs(rate: number): number {
  return Math.round(realLeadMs(rate) * rateOf(rate));
}

/** How long (real ms) the hop to a word takes: it finishes before the word starts, and is shorter on the same line. */
export function hopDuration(o: { from: Pt; to: Pt; wordMs: number; rate: number; sameLine: boolean }): number {
  const r = rateOf(o.rate);
  const d = Math.hypot(o.to.x - o.from.x, o.to.y - o.from.y);
  const cap = Math.max(READ_SYNC.minHopMs, realLeadMs(r) - READ_SYNC.landMarginMs);
  const natural = hopMs(o.from, o.to, Math.max(120, o.wordMs)) / r;
  const base = o.sameLine ? Math.min(natural, 60 + d * 0.45, READ_SYNC.sameLineMaxMs) : natural;
  return Math.round(Math.min(cap, Math.max(READ_SYNC.minHopMs, base)));
}
