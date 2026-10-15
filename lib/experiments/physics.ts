/**
 * Pure physics and chemistry for the Sunroot experiments. No DOM, no randomness: every function is
 * deterministic so the UI, the auto-checked questions and the tests all use the same numbers.
 * Units: metres, seconds, kilograms, kelvin, pascals, mol/L unless the name says otherwise.
 */

export const G_EARTH = 9.80665; // standard gravity, m/s²
export const R_GAS = 8.314462618; // J/(mol·K)
export const KW = 1e-14; // water's ion product at 25 °C

const rad = (deg: number) => (deg * Math.PI) / 180;

// ------------------------------------------------------------------ 1. projectile motion

export interface Projectile {
  /** sampled path [x, y] in metres, from launch to landing */
  points: Array<[number, number]>;
  flightTime: number;
  range: number;
  maxHeight: number;
  /** speed at landing, m/s */
  impactSpeed: number;
}

/**
 * Closed-form flight with no air: x = v cosθ t, y = h + v sinθ t − ½ g t².
 */
export function projectileIdeal(v0: number, angleDeg: number, h0: number, g = G_EARTH) {
  const vx = v0 * Math.cos(rad(angleDeg));
  const vy = v0 * Math.sin(rad(angleDeg));
  const flightTime = (vy + Math.sqrt(vy * vy + 2 * g * h0)) / g;
  const maxHeight = h0 + (vy > 0 ? (vy * vy) / (2 * g) : 0);
  return { flightTime, range: vx * flightTime, maxHeight, vx, vy };
}

/**
 * Flight with quadratic air drag: acceleration = −k·|v|·v (k in 1/m, = ½ρ·Cd·A/m). k = 0 is the ideal case.
 * Integrated with classic RK4 and a fixed step, stopping when the projectile crosses y = 0.
 */
export function projectile(v0: number, angleDeg: number, h0: number, k = 0, g = G_EARTH, dt = 0.005, samples = 160): Projectile {
  if (k <= 0) {
    const id = projectileIdeal(v0, angleDeg, h0, g);
    const points: Array<[number, number]> = [];
    for (let i = 0; i <= samples; i++) {
      const t = (id.flightTime * i) / samples;
      points.push([id.vx * t, Math.max(0, h0 + id.vy * t - 0.5 * g * t * t)]);
    }
    return { points, flightTime: id.flightTime, range: id.range, maxHeight: id.maxHeight, impactSpeed: Math.hypot(id.vx, id.vy - g * id.flightTime) };
  }
  type S = [number, number, number, number]; // x, y, vx, vy
  const f = (s: S): S => {
    const sp = Math.hypot(s[2], s[3]);
    return [s[2], s[3], -k * sp * s[2], -g - k * sp * s[3]];
  };
  const add = (s: S, d: S, h: number): S => [s[0] + d[0] * h, s[1] + d[1] * h, s[2] + d[2] * h, s[3] + d[3] * h];
  let s: S = [0, h0, v0 * Math.cos(rad(angleDeg)), v0 * Math.sin(rad(angleDeg))];
  let t = 0;
  const path: Array<[number, number, number]> = [[0, h0, 0]];
  let maxHeight = h0;
  let landed: { x: number; t: number; v: number } | null = null;
  for (let i = 0; i < 400000 && !landed; i++) {
    const k1 = f(s);
    const k2 = f(add(s, k1, dt / 2));
    const k3 = f(add(s, k2, dt / 2));
    const k4 = f(add(s, k3, dt));
    const n: S = [0, 0, 0, 0];
    for (let j = 0; j < 4; j++) n[j] = s[j] + (dt / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]);
    if (n[1] <= 0) {
      const a = s[1] / (s[1] - n[1]); // linear interpolation to the ground crossing
      landed = { x: s[0] + a * (n[0] - s[0]), t: t + a * dt, v: Math.hypot(s[2] + a * (n[2] - s[2]), s[3] + a * (n[3] - s[3])) };
      break;
    }
    s = n;
    t += dt;
    maxHeight = Math.max(maxHeight, s[1]);
    path.push([s[0], s[1], t]);
  }
  const end = landed ?? { x: s[0], t, v: Math.hypot(s[2], s[3]) };
  const points: Array<[number, number]> = [];
  for (let i = 0; i <= samples; i++) {
    const target = (end.t * i) / samples;
    let j = Math.min(path.length - 1, Math.max(0, Math.floor(target / dt)));
    while (j < path.length - 1 && path[j + 1][2] <= target) j++;
    points.push([path[j][0], path[j][1]]);
  }
  points[points.length - 1] = [end.x, 0];
  return { points, flightTime: end.t, range: end.x, maxHeight, impactSpeed: end.v };
}

/** Launch angle (degrees) that gives the longest range with no drag, for a launch height h0 (45° when h0 = 0). */
export function bestAngleIdeal(v0: number, h0: number, g = G_EARTH): number {
  // analytic: tan θ = v / sqrt(v² + 2 g h0)
  return (Math.atan(v0 / Math.sqrt(v0 * v0 + 2 * g * h0)) * 180) / Math.PI;
}

// ------------------------------------------------------------------ 2. simple pendulum

/** Period for small swings: T = 2π√(L/g). */
export function pendulumPeriodSmall(L: number, g = G_EARTH): number {
  return 2 * Math.PI * Math.sqrt(L / g);
}

/** Complete elliptic integral of the first kind K(k) by the arithmetic–geometric mean. */
export function ellipticK(k: number): number {
  let a = 1;
  let b = Math.sqrt(1 - k * k);
  for (let i = 0; i < 40 && Math.abs(a - b) > 1e-15; i++) [a, b] = [(a + b) / 2, Math.sqrt(a * b)];
  return Math.PI / (2 * a);
}

/** Exact period for any amplitude below 180°: T = 4√(L/g)·K(sin(θ0/2)). */
export function pendulumPeriod(L: number, amplitudeDeg: number, g = G_EARTH): number {
  const th = Math.min(179.9, Math.max(0, amplitudeDeg));
  return 4 * Math.sqrt(L / g) * ellipticK(Math.sin(rad(th) / 2));
}

export interface PendulumRun {
  dt: number;
  /** angle in radians at every step */
  theta: number[];
}

/** Integrates θ'' = −(g/L) sin θ from rest at the amplitude (RK4). */
export function simulatePendulum(L: number, amplitudeDeg: number, g = G_EARTH, seconds = 12, dt = 0.004): PendulumRun {
  const w2 = g / L;
  let th = rad(amplitudeDeg);
  let om = 0;
  const theta: number[] = [th];
  const acc = (x: number) => -w2 * Math.sin(x);
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    const k1t = om;
    const k1o = acc(th);
    const k2t = om + (dt / 2) * k1o;
    const k2o = acc(th + (dt / 2) * k1t);
    const k3t = om + (dt / 2) * k2o;
    const k3o = acc(th + (dt / 2) * k2t);
    const k4t = om + dt * k3o;
    const k4o = acc(th + dt * k3t);
    th += (dt / 6) * (k1t + 2 * k2t + 2 * k3t + k4t);
    om += (dt / 6) * (k1o + 2 * k2o + 2 * k3o + k4o);
    theta.push(th);
  }
  return { dt, theta };
}

/** Period measured from a simulation: time between the first two upward zero crossings (interpolated). */
export function measurePeriod(run: PendulumRun): number | null {
  const crossings: number[] = [];
  for (let i = 1; i < run.theta.length; i++) {
    const a = run.theta[i - 1];
    const b = run.theta[i];
    if (a < 0 && b >= 0) crossings.push((i - 1 + -a / (b - a)) * run.dt);
  }
  return crossings.length >= 2 ? crossings[1] - crossings[0] : null;
}

/** Length that gives a wanted small-angle period. */
export function lengthForPeriod(T: number, g = G_EARTH): number {
  return (g * T * T) / (4 * Math.PI * Math.PI);
}

// ------------------------------------------------------------------ 3. acid–base titration

export interface TitrationSetup {
  /** acid concentration, mol/L */
  acidC: number;
  /** acid volume in the flask, mL */
  acidV: number;
  /** base (strong, e.g. NaOH) concentration, mol/L */
  baseC: number;
  /** null = strong acid; otherwise the weak acid's Ka (monoprotic) */
  Ka: number | null;
}

/** pH after adding `baseMl` of strong base. Solves the charge balance [H⁺] + [Na⁺] = [A⁻] + [OH⁻] exactly. */
export function titrationPH(s: TitrationSetup, baseMl: number): number {
  const total = s.acidV + baseMl;
  const ct = (s.acidC * s.acidV) / total;
  const na = (s.baseC * baseMl) / total;
  const f = (lh: number) => {
    const h = Math.pow(10, lh);
    const aminus = s.Ka === null ? ct : (ct * s.Ka) / (s.Ka + h);
    return h + na - aminus - KW / h;
  };
  let lo = -15;
  let hi = 2;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) hi = mid;
    else lo = mid;
  }
  return -(lo + hi) / 2;
}

/** Volume of base (mL) that exactly neutralises the acid. */
export function equivalenceVolume(s: TitrationSetup): number {
  return (s.acidC * s.acidV) / s.baseC;
}

/** pH at the equivalence point. */
export function equivalencePH(s: TitrationSetup): number {
  return titrationPH(s, equivalenceVolume(s));
}

export function titrationCurve(s: TitrationSetup, maxMl: number, n = 200): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= n; i++) {
    const v = (maxMl * i) / n;
    pts.push([v, titrationPH(s, v)]);
  }
  return pts;
}

export interface Indicator {
  id: string;
  name: string;
  /** pH range of the colour change */
  low: number;
  high: number;
  acidColor: [number, number, number];
  baseColor: [number, number, number];
}

export const INDICATORS: Indicator[] = [
  { id: "methyl-orange", name: "Methyl orange", low: 3.1, high: 4.4, acidColor: [220, 40, 40], baseColor: [250, 200, 50] },
  { id: "bromothymol-blue", name: "Bromothymol blue", low: 6.0, high: 7.6, acidColor: [250, 220, 50], baseColor: [50, 90, 220] },
  { id: "phenolphthalein", name: "Phenolphthalein", low: 8.2, high: 10.0, acidColor: [235, 240, 245], baseColor: [220, 40, 150] },
];

/** The solution's colour (rgb) with this indicator at this pH: a smooth blend across the transition range. */
export function indicatorColor(ind: Indicator, pH: number): [number, number, number] {
  const t = Math.min(1, Math.max(0, (pH - ind.low) / (ind.high - ind.low)));
  return [0, 1, 2].map((i) => Math.round(ind.acidColor[i] + (ind.baseColor[i] - ind.acidColor[i]) * t)) as [number, number, number];
}

/** The indicator whose range contains the equivalence pH (the closest range centre when none does). */
export function bestIndicator(equivalencePh: number): Indicator {
  const inside = INDICATORS.find((i) => equivalencePh >= i.low && equivalencePh <= i.high);
  if (inside) return inside;
  return [...INDICATORS].sort((a, b) => Math.abs((a.low + a.high) / 2 - equivalencePh) - Math.abs((b.low + b.high) / 2 - equivalencePh))[0];
}

// ------------------------------------------------------------------ 4. ideal gas in a piston

/** P = nRT/V. n mol, T K, V m³ → Pa. */
export function gasPressure(n: number, T: number, V: number): number {
  return (n * R_GAS * T) / V;
}
export function gasVolume(n: number, T: number, P: number): number {
  return (n * R_GAS * T) / P;
}
export function gasTemperature(n: number, V: number, P: number): number {
  return (P * V) / (n * R_GAS);
}
export function gasMoles(P: number, V: number, T: number): number {
  return (P * V) / (R_GAS * T);
}

/** Volume (m³) of a cylinder of cross-section areaM2 with the piston at height xM. */
export function pistonVolume(areaM2: number, xM: number): number {
  return areaM2 * xM;
}

/** Root-mean-square speed of molecules with molar mass M (kg/mol) at T: √(3RT/M). */
export function rmsSpeed(T: number, molarMass = 0.028): number {
  return Math.sqrt((3 * R_GAS * T) / molarMass);
}

/** Pressure–volume points of an isotherm, volumes in litres, pressure in kPa. */
export function isotherm(n: number, T: number, vMinL: number, vMaxL: number, steps = 80): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const vL = vMinL + ((vMaxL - vMinL) * i) / steps;
    pts.push([vL, gasPressure(n, T, vL / 1000) / 1000]);
  }
  return pts;
}
