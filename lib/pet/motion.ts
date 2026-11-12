/**
 * How long Sprout takes to lower itself a given distance down its rope. A short drop is quick, a long one is not
 * instant, and the time is capped so a tall pop-up never makes it feel slow.
 */
export function rappelMs(distancePx: number): number {
  const d = Number.isFinite(distancePx) ? Math.max(0, distancePx) : 0;
  return Math.round(Math.min(720, Math.max(380, 330 + d * 2.6)));
}

/**
 * Whether a move ever goes against its direction of travel (up before down, or back after overshooting). A rope descent must
 * not: it is a straight lowering, so this is used to prove it.
 */
export function isMonotonic(values: number[], direction: "down" | "up", tolerance = 0): boolean {
  for (let i = 1; i < values.length; i++) {
    const delta = values[i] - values[i - 1];
    if (direction === "down" ? delta < -tolerance : delta > tolerance) return false;
  }
  return true;
}
