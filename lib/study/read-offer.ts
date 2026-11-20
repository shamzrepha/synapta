/** Pure rules for Sprout's "Ready to read with me?" offer on a class book page. */

export type ReadPace = 0.85 | 1 | 1.25;
export const READ_PACES: Array<{ label: string; rate: ReadPace }> = [
  { label: "Slow", rate: 0.85 },
  { label: "Normal", rate: 1 },
  { label: "Fast", rate: 1.25 },
];
export const DEFAULT_READ_PACE: ReadPace = 1;
export const parseReadPace = (v: unknown): ReadPace => (READ_PACES.find((p) => p.rate === v)?.rate ?? DEFAULT_READ_PACE);

/** The offer goes away by itself after this long. */
export const OFFER_AUTO_DISMISS_MS = 12_000;
/** Scrolling this far (px) while the offer is up means the learner is reading on their own: it goes away. */
export const OFFER_SCROLL_DISMISS_PX = 48;
/** Away this long (no touch, key or scroll), and the next page opened gets the offer again. */
export const OFFER_PAUSE_MS = 10 * 60_000;

export interface OfferInput {
  /** Sprout is on (not "Off") */
  botEnabled: boolean;
  /** the learner has not said "Don't ask again" */
  offerOn: boolean;
  /** the page in front of the learner has text to read */
  hasReadableText: boolean;
  /** nothing is being read aloud right now */
  voiceIdle: boolean;
  mode: "flip" | "scroll";
  /** scroll mode only: how far down the learner already is (px) */
  scrollY: number;
  now: number;
  /** when an offer was last shown this session (0 = none yet) */
  lastOfferAt: number;
  /** when the learner last touched the page (0 = unknown) */
  lastActiveAt: number;
}

/** True when Sprout should hop in with the offer: first open this session, or again after a long pause. */
export function shouldOfferReadAlong(i: OfferInput): boolean {
  if (!i.botEnabled || !i.offerOn || !i.hasReadableText || !i.voiceIdle) return false;
  // scroll mode: someone already part-way down is mid-reading, not just arriving
  if (i.mode === "scroll" && i.scrollY > 160) return false;
  if (i.lastOfferAt <= 0) return true;
  const idleSince = i.lastActiveAt > 0 ? i.lastActiveAt : i.lastOfferAt;
  return i.now - idleSince >= OFFER_PAUSE_MS;
}
