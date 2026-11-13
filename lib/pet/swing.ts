/**
 * The geometry of Sprout's rope swing (Spider-Man style), kept pure so it can be tested.
 *
 * Sprout fires a rope up to a hook, climbs it to a hanging spot, hauls the pop-up up with a second rope, then lets go
 * of the hook mid-swing and lands on the pop-up's top border. The swing is a real pendulum arc: the hand that holds the
 * rope stays exactly one rope length from the hook the whole way, so the rope never stretches or snaps.
 */
export interface Pt {
  x: number;
  y: number;
}

/** Sprout's size on screen and where its two raised hands are, as shares of that size (the SVG is 100 x 112). */
export const SPROUT_W = 72;
export const SPROUT_H = 81;
export const ANCHOR_HAND = { x: 0.28, y: 0.42 };
export const HAUL_HAND = { x: 0.8, y: 0.43 };

export const easeInOutSine = (u: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, u)));
export const smoothstep = (u: number) => {
  const x = Math.min(1, Math.max(0, u));
  return x * x * (3 - 2 * x);
};

export interface SwingPlan {
  /** where the rope is fixed (the top of the screen, or just above it) */
  hook: Pt;
  /** where Sprout hangs after climbing the rope, up and to one side, higher than where it started */
  hang: Pt;
  /** the rope length at the start of the swing and at the landing (Sprout reels the rope a little as it swings) */
  radiusFrom: number;
  radiusTo: number;
  /** angles from straight down, in radians; positive is to the right of the hook */
  from: number;
  to: number;
  /** where the rope hand is at progress 0..1 (eased like a pendulum: slow at both ends, fast at the bottom) */
  handAt: (u: number) => Pt;
}

export interface SwingInput {
  /** where the rope hand is when Sprout starts (at the tapped word) */
  start: Pt;
  /** where the rope hand should be when Sprout lands */
  land: Pt;
  viewportWidth: number;
  /** the hand may not leave this band (keeps all of Sprout on screen) */
  minHandX: number;
  maxHandX: number;
  /** the rope hook, normally the top edge */
  hookY?: number;
  /** the widest swing, in degrees */
  maxAngleDeg?: number;
}

const rad = (d: number) => (d * Math.PI) / 180;
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

export function planSwing(input: SwingInput): SwingPlan {
  const hookY = input.hookY ?? 2;
  // swing in from the side with more room, landing just left or right of the bottom of the arc
  const side = input.land.x < input.viewportWidth / 2 ? 1 : -1; // +1: Sprout comes in from the right
  const to = -side * rad(6);
  const radiusTo = Math.max(150, (input.land.y - hookY) / Math.cos(to));
  // a very high landing still gets a real rope: the hook sits above the screen edge
  const hook: Pt = { x: input.land.x - radiusTo * Math.sin(to), y: input.land.y - radiusTo * Math.cos(to) };

  // the hanging spot: straight up the rope from where Sprout started, at least 60 px higher, so the climb is plainly a climb
  const reach = Math.hypot(hook.x - input.start.x, hook.y - input.start.y) || 1;
  const rise = Math.max(1, input.start.y - hook.y);
  const f = Math.min(0.8, Math.max(0.5, 60 / rise));
  let hang: Pt = { x: input.start.x + (hook.x - input.start.x) * f, y: input.start.y + (hook.y - input.start.y) * f };
  hang = { x: Math.min(input.maxHandX, Math.max(input.minHandX, hang.x)), y: hang.y };
  void reach;
  const radiusFrom = Math.max(60, Math.hypot(hang.x - hook.x, hang.y - hook.y));
  const from = Math.atan2(hang.x - hook.x, hang.y - hook.y);
  const handAt = (u: number): Pt => {
    const e = easeInOutSine(u);
    const a = lerp(from, to, e);
    const r = lerp(radiusFrom, radiusTo, e);
    return { x: hook.x + r * Math.sin(a), y: hook.y + r * Math.cos(a) };
  };
  return { hook, hang: handAt(0), radiusFrom, radiusTo, from, to, handAt };
}

/** Samples a path into evenly spaced points (for a Web Animations keyframe list). */
export function samplePath(at: (u: number) => Pt, count: number): Pt[] {
  const n = Math.max(2, Math.round(count));
  return Array.from({ length: n + 1 }, (_, i) => at(i / n));
}

/** How long the climb up the first rope takes: a short climb is quick, a long one is capped so it never drags. */
export function climbMs(distancePx: number): number {
  const d = Number.isFinite(distancePx) ? Math.max(0, distancePx) : 0;
  return Math.round(Math.min(1500, Math.max(900, 760 + d * 1.1)));
}
