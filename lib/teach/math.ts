import { evaluate } from "@/lib/studio/expr";

/** Pure maths behind the interactive blocks, so the animations are deterministic and testable (no AI-written code runs). */

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));
export const round = (v: number, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp;

export function hypotenuse(a: number, b: number) {
  return Math.sqrt(a * a + b * b);
}

/** Areas of the three squares on a right triangle: a² + b² = c². */
export function triangleSquares(a: number, b: number) {
  const c = hypotenuse(a, b);
  return { a2: round(a * a), b2: round(b * b), c, c2: round(a * a + b * b) };
}

export interface Pt {
  x: number;
  y: number | null;
}

/** Samples y = f(x) with a safe expression; points where it is undefined (1/0, sqrt of a negative) are null, so the line breaks. */
export function sampleFunction(expr: string, vars: Record<string, number>, xMin: number, xMax: number, n = 160): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const x = xMin + ((xMax - xMin) * i) / n;
    let y: number | null = null;
    try {
      const v = evaluate(expr, { ...vars, x });
      y = Number.isFinite(v) ? v : null;
    } catch {
      y = null;
    }
    out.push({ x, y });
  }
  return out;
}

export function isValidExpression(expr: string, names: string[] = []): boolean {
  try {
    const vars = Object.fromEntries(["x", ...names].map((k) => [k, 1]));
    evaluate(expr, vars);
    return true;
  } catch {
    return false;
  }
}

/** Position of a projectile `t` seconds after launch (angle in degrees, no air resistance). */
export function projectileAt(v0: number, angleDeg: number, g: number, t: number) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: v0 * Math.cos(a) * t, y: v0 * Math.sin(a) * t - 0.5 * g * t * t };
}

export function projectileSummary(v0: number, angleDeg: number, g: number) {
  const a = (angleDeg * Math.PI) / 180;
  const flight = g > 0 ? (2 * v0 * Math.sin(a)) / g : 0;
  return { flight, range: v0 * Math.cos(a) * flight, peak: g > 0 ? (v0 * Math.sin(a)) ** 2 / (2 * g) : 0 };
}

/** A fraction as a reduced fraction and a decimal. */
export function fractionFacts(num: number, den: number) {
  const gcd = (x: number, y: number): number => (y === 0 ? Math.abs(x) : gcd(y, x % y));
  const d = gcd(num, den) || 1;
  return { reduced: `${num / d}/${den / d}`, decimal: den === 0 ? 0 : round(num / den, 3), percent: den === 0 ? 0 : round((num / den) * 100, 1) };
}
