import { PALETTES, type PetMood } from "@/lib/pet/mood";

/** Events the favicon reacts to, sent as window CustomEvent "sunroot:favicon" with detail {kind}. */
export type FaviconEvent = "correct" | "streak" | "levelup" | "sleepy";
export type FaviconBadge = "none" | "flame" | "z" | "spark" | "star";
export type FaviconEyes = "open" | "closed" | "happy";

export interface FaviconFrame {
  eyes: FaviconEyes;
  /** vertical hop in sprite units (0 = standing) */
  lift: number;
  /** tint ring colour around the face, or null for none */
  ring: string | null;
  badge: FaviconBadge;
  body: string;
  shade: string;
  arm: string;
}

export const FAVICON_EVENT_NAME = "sunroot:favicon";
export const BURST_FRAMES = 8;
export const BURST_FPS = 6;
export const BLINK_MIN_MS = 6000;
export const BLINK_MAX_MS = 10000;
export const IDLE_SLEEPY_MS = 5 * 60_000;
export const HIDDEN_PAUSE_MS = 2 * 60_000;
export const MIN_DRAW_GAP_MS = 150;

export const MOOD_RING: Record<PetMood, string | null> = {
  sleepy: null,
  calm: null,
  happy: "#5eead4",
  fired: "#fbbf24",
  genius: "#c4b5fd",
};

const EVENT_RING: Record<FaviconEvent, string> = {
  correct: "#f59e0b",
  streak: "#fb923c",
  levelup: "#f59e0b",
  sleepy: "#94a3b8",
};

export function isFaviconEvent(v: unknown): v is FaviconEvent {
  return v === "correct" || v === "streak" || v === "levelup" || v === "sleepy";
}

/** The resting badge for a mood. */
export function moodBadge(mood: PetMood): FaviconBadge {
  if (mood === "fired") return "flame";
  if (mood === "sleepy") return "z";
  if (mood === "genius") return "star";
  return "none";
}

/** The still frame for a mood. `blink` closes the eyes for one frame. */
export function staticFrame(mood: PetMood, blink = false): FaviconFrame {
  const p = PALETTES[mood];
  return {
    eyes: blink || mood === "sleepy" ? "closed" : "open",
    lift: 0,
    ring: MOOD_RING[mood],
    badge: moodBadge(mood),
    body: p.body,
    shade: p.shade,
    arm: p.arm,
  };
}

/**
 * Frame `tick` (0-based) of a burst. Returns null once the burst is over (tick >= BURST_FRAMES),
 * which is the signal to stop animating and fall back to staticFrame(mood).
 */
export function burstFrame(mood: PetMood, event: FaviconEvent, tick: number): FaviconFrame | null {
  if (!Number.isFinite(tick) || tick < 0 || tick >= BURST_FRAMES) return null;
  const base = staticFrame(mood);
  const up = tick % 2 === 1;
  switch (event) {
    case "correct":
      return { ...base, eyes: "happy", lift: up ? 6 : 0, ring: EVENT_RING.correct, badge: tick < 6 ? "spark" : base.badge };
    case "streak":
      return { ...base, eyes: "happy", lift: up ? 4 : 0, ring: EVENT_RING.streak, badge: "flame" };
    case "levelup":
      return { ...base, eyes: "happy", lift: tick < 6 ? (up ? 9 : 2) : 0, ring: EVENT_RING.levelup, badge: tick % 3 === 2 ? "spark" : "star" };
    case "sleepy": {
      const s = staticFrame("sleepy");
      return { ...s, ring: EVENT_RING.sleepy, badge: "z", eyes: tick < 3 ? "open" : "closed" };
    }
  }
}

/** Random blink delay in [BLINK_MIN_MS, BLINK_MAX_MS]; `rand` is injectable (0..1). */
export function nextBlinkDelay(rand: number = Math.random()): number {
  const r = Math.min(1, Math.max(0, rand));
  return Math.round(BLINK_MIN_MS + r * (BLINK_MAX_MS - BLINK_MIN_MS));
}

/** True when a draw at `now` would break the 150 ms floor. */
export function tooSoon(now: number, lastDraw: number): boolean {
  return now - lastDraw < MIN_DRAW_GAP_MS;
}
