import { clear } from "./plot";
import {
  G_EARTH, INDICATORS, bestAngleIdeal, bestIndicator, equivalencePH, equivalenceVolume, gasPressure, indicatorColor, isotherm, lengthForPeriod, measurePeriod, pendulumPeriod,
  pendulumPeriodSmall, pistonVolume, projectile, rmsSpeed, simulatePendulum, titrationCurve, titrationPH, type PendulumRun, type Projectile, type TitrationSetup,
} from "./physics";
import type { Computed, Experiment, Values } from "./types";

const round = (x: number, d = 2) => +x.toFixed(d);
const rgb = (c: [number, number, number]) => `rgb(${c[0]},${c[1]},${c[2]})`;
const GRAVITIES = [
  { value: 9.80665, label: "Earth" },
  { value: 3.72, label: "Mars" },
  { value: 1.62, label: "Moon" },
];

// ================================================================== 1. projectile motion

interface ProjData {
  main: Projectile;
  ideal: Projectile;
}

function computeProjectile(v: Values): Computed {
  const main = projectile(v.speed, v.angle, v.height, v.drag, v.g);
  const ideal = v.drag > 0 ? projectile(v.speed, v.angle, v.height, 0, v.g) : main;
  const dur = Math.max(0.5, main.flightTime);
  const at = (t: number): [number, number] => {
    const i = Math.min(main.points.length - 1, Math.round((Math.min(t % (dur + 1), dur) / dur) * (main.points.length - 1)));
    return main.points[i];
  };
  return {
    duration: dur + 1,
    data: { main, ideal } satisfies ProjData,
    outputs: [
      { key: "range", label: "Range", value: main.range, unit: "m", digits: 2 },
      { key: "time", label: "Time in the air", value: main.flightTime, unit: "s", digits: 2 },
      { key: "apex", label: "Highest point", value: main.maxHeight, unit: "m", digits: 2 },
      { key: "impact", label: "Landing speed", value: main.impactSpeed, unit: "m/s", digits: 1 },
      { key: "idealRange", label: "Range with no air", value: ideal.range, unit: "m", digits: 2 },
    ],
    graphs: [
      {
        title: "Path (height against distance)",
        xLabel: "distance (m)",
        yLabel: "height (m)",
        series: [...(v.drag > 0 ? [{ label: "no air", color: "#64748b", points: ideal.points, dashed: true }] : []), { label: "path", color: "#38bdf8", points: main.points }],
        marker: [main.range, 0],
        markerAt: (t) => at(t),
      },
    ],
  };
}

function drawProjectile(ctx: CanvasRenderingContext2D, w: number, h: number, v: Values, c: Computed, t: number) {
  const d = c.data as ProjData;
  clear(ctx, w, h, "#0b1a2e");
  const xmax = Math.max(1, d.main.range, d.ideal.range) * 1.08;
  const ymax = Math.max(1, d.main.maxHeight, d.ideal.maxHeight) * 1.25;
  const m = 26;
  const s = Math.min((w - 2 * m) / xmax, (h - 2 * m) / ymax);
  const X = (x: number) => m + x * s;
  const Y = (y: number) => h - m - y * s;
  ctx.fillStyle = "#14532d";
  ctx.fillRect(0, Y(0), w, h - Y(0));
  ctx.fillStyle = "#475569";
  ctx.fillRect(X(0) - 14, Y(v.height), 14, Math.max(2, h - Y(v.height) - (h - Y(0))));
  const line = (pts: Array<[number, number]>, color: string, dash: number[]) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash(dash);
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))));
    ctx.stroke();
    ctx.setLineDash([]);
  };
  if (v.drag > 0) line(d.ideal.points, "#64748b", [5, 4]);
  line(d.main.points, "#38bdf8", []);
  const dur = Math.max(0.5, d.main.flightTime);
  const i = Math.min(d.main.points.length - 1, Math.round((Math.min(t % (dur + 1), dur) / dur) * (d.main.points.length - 1)));
  const p = d.main.points[i];
  ctx.fillStyle = "#fbbf24";
  ctx.beginPath();
  ctx.arc(X(p[0]), Y(p[1]), 6, 0, Math.PI * 2);
  ctx.fill();
  // launch angle arrow
  const a = (v.angle * Math.PI) / 180;
  ctx.strokeStyle = "#f472b6";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(X(0), Y(v.height));
  ctx.lineTo(X(0) + 40 * Math.cos(a), Y(v.height) - 40 * Math.sin(a));
  ctx.stroke();
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "11px sans-serif";
  ctx.fillText(`${round(v.angle, 0)}°`, X(0) + 46, Y(v.height) - 4);
  ctx.textAlign = "right";
  ctx.fillText(`range ${round(d.main.range, 1)} m`, w - 8, 16);
  ctx.textAlign = "left";
}

export const projectileExperiment: Experiment = {
  id: "projectile",
  title: "Projectile motion",
  blurb: "Launch a ball, change the angle, gravity and air drag, and see how far it flies.",
  emoji: "🏹",
  subject: "Physics",
  params: [
    { key: "speed", label: "Launch speed", unit: "m/s", min: 1, max: 60, step: 1, value: 25 },
    { key: "angle", label: "Launch angle", unit: "°", min: 0, max: 90, step: 1, value: 45 },
    { key: "height", label: "Launch height", unit: "m", min: 0, max: 30, step: 1, value: 0 },
    { key: "g", label: "Gravity", min: 1, max: 10, step: 0.01, value: G_EARTH, options: GRAVITIES },
    { key: "drag", label: "Air drag k (0 = none)", unit: "1/m", min: 0, max: 0.05, step: 0.002, value: 0 },
  ],
  recordKeys: ["speed", "angle", "height", "drag", "range", "time", "apex"],
  compute: computeProjectile,
  draw: drawProjectile,
  tryThis: "Keep the speed fixed and try angles from 10° to 80°. Which one goes farthest? Then switch drag on.",
  questions: [
    {
      kind: "number",
      id: "range",
      prompt: "With your current settings, how far does the ball land from the launch point?",
      unit: "m",
      tol: 0.02,
      expected: (_v, c) => c.outputs.find((o) => o.key === "range")!.value,
      hint: () => "Read the range under the picture (or work it out: horizontal speed × time in the air).",
    },
    {
      kind: "number",
      id: "best-angle",
      prompt: "Set drag to 0. For your launch speed, height and gravity, which launch angle gives the longest range? Type the angle.",
      unit: "°",
      tol: 0,
      absTol: 1.5,
      expected: (v) => bestAngleIdeal(v.speed, v.height, v.g),
      hint: (v) => (v.height > 0 ? "Launching from a height lowers the best angle a little below 45°. Try angles near 40° and compare the ranges." : "Try angles around 45° and watch the range."),
    },
    {
      kind: "choice",
      id: "drag-effect",
      prompt: "Now switch air drag on. Compared with no air, the ball's range is…",
      options: ["longer", "shorter", "the same"],
      expected: () => "shorter",
      hint: () => "Compare the dashed 'no air' path with the solid one: drag takes energy from the ball all the way.",
    },
  ],
};

// ================================================================== 2. simple pendulum

interface PendData {
  run: PendulumRun;
  measured: number | null;
}

const PEND_SECONDS = 12;

function computePendulum(v: Values): Computed {
  const run = simulatePendulum(v.length, v.amp, v.g, PEND_SECONDS, 0.005);
  const measured = measurePeriod(run);
  const T = pendulumPeriod(v.length, v.amp, v.g);
  const T0 = pendulumPeriodSmall(v.length, v.g);
  const thetaDeg = (t: number) => (run.theta[Math.min(run.theta.length - 1, Math.round(t / run.dt))] * 180) / Math.PI;
  const swing: Array<[number, number]> = [];
  for (let i = 0; i < run.theta.length; i += 12) swing.push([i * run.dt, (run.theta[i] * 180) / Math.PI]);
  const lens: number[] = [];
  for (let L = 0.1; L <= 3.0001; L += 0.1) lens.push(L);
  return {
    duration: PEND_SECONDS,
    data: { run, measured } satisfies PendData,
    outputs: [
      { key: "period", label: "Period (exact)", value: T, unit: "s", digits: 3 },
      { key: "periodSmall", label: "Period if the swing were tiny", value: T0, unit: "s", digits: 3 },
      { key: "periodMeasured", label: "Period measured in the simulation", value: measured ?? NaN, unit: "s", digits: 3 },
      { key: "ratio", label: "Large-swing period ÷ tiny-swing period", value: T / T0, digits: 3 },
    ],
    graphs: [
      { title: "Angle against time", xLabel: "time (s)", yLabel: "angle (°)", series: [{ label: "θ", color: "#38bdf8", points: swing }], markerAt: (t) => [t % PEND_SECONDS, thetaDeg(t % PEND_SECONDS)], xRange: [0, PEND_SECONDS] },
      {
        title: "Period against length",
        xLabel: "length (m)",
        yLabel: "period (s)",
        series: [
          { label: "tiny swing", color: "#64748b", dashed: true, points: lens.map((L) => [L, pendulumPeriodSmall(L, v.g)] as [number, number]) },
          { label: "your swing", color: "#34d399", points: lens.map((L) => [L, pendulumPeriod(L, v.amp, v.g)] as [number, number]) },
        ],
        marker: [v.length, T],
        xRange: [0, 3],
      },
    ],
  };
}

function drawPendulum(ctx: CanvasRenderingContext2D, w: number, h: number, v: Values, c: Computed, t: number) {
  const d = c.data as PendData;
  clear(ctx, w, h, "#0b1a2e");
  const idx = Math.min(d.run.theta.length - 1, Math.round((t % PEND_SECONDS) / d.run.dt));
  const th = d.run.theta[idx];
  const px = w / 2;
  const py = 22;
  const len = (h - 60) * (0.25 + 0.75 * (v.length / 3));
  const bx = px + len * Math.sin(th);
  const by = py + len * Math.cos(th);
  // amplitude ghost
  const a = (v.amp * Math.PI) / 180;
  ctx.strokeStyle = "#334155";
  ctx.setLineDash([4, 4]);
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + len * Math.sin(s * a), py + len * Math.cos(a));
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.strokeStyle = "#94a3b8";
  ctx.beginPath();
  ctx.moveTo(px - 30, py);
  ctx.lineTo(px + 30, py);
  ctx.stroke();
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(bx, by);
  ctx.stroke();
  ctx.fillStyle = "#fbbf24";
  ctx.beginPath();
  ctx.arc(bx, by, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "11px sans-serif";
  ctx.fillText(`L = ${round(v.length, 2)} m   swing ±${round(v.amp, 0)}°`, 8, h - 8);
}

export const pendulumExperiment: Experiment = {
  id: "pendulum",
  title: "Simple pendulum",
  blurb: "Find how the period depends on length and swing size, and where the textbook formula breaks down.",
  emoji: "⏱️",
  subject: "Physics",
  params: [
    { key: "length", label: "String length", unit: "m", min: 0.1, max: 3, step: 0.05, value: 1 },
    { key: "amp", label: "Swing angle", unit: "°", min: 1, max: 170, step: 1, value: 20 },
    { key: "g", label: "Gravity", min: 1, max: 10, step: 0.01, value: G_EARTH, options: GRAVITIES },
  ],
  recordKeys: ["length", "amp", "g", "period", "periodSmall", "periodMeasured"],
  compute: computePendulum,
  draw: drawPendulum,
  tryThis: "Record the period at lengths 0.25, 0.5, 1 and 2 m. Then raise the swing angle to 120° and compare with the tiny-swing period.",
  questions: [
    {
      kind: "number",
      id: "period",
      prompt: "What is the period (time for one full swing back and forth) with your current settings?",
      unit: "s",
      tol: 0.02,
      expected: (_v, c) => c.outputs.find((o) => o.key === "period")!.value,
      hint: () => "Read the exact period in the results. For small swings it is 2π√(L/g).",
    },
    {
      kind: "number",
      id: "length-for-2s",
      prompt: "On this planet (your gravity setting), what string length gives a period of 2 s for small swings?",
      unit: "m",
      tol: 0.03,
      expected: (v) => lengthForPeriod(2, v.g),
      hint: () => "Rearrange T = 2π√(L/g) to L = g·T²/(4π²), or set the swing to a small angle and slide the length until the period reads 2 s.",
    },
    {
      kind: "choice",
      id: "big-swing",
      prompt: "Compared with a tiny swing, a 150° swing has a period that is…",
      options: ["longer", "shorter", "the same"],
      expected: () => "longer",
      hint: () => "Set the swing to 150° and compare 'Period (exact)' with 'Period if the swing were tiny'.",
    },
    {
      kind: "choice",
      id: "mass",
      prompt: "If you hang a heavier ball on the same string, the period…",
      options: ["gets longer", "gets shorter", "stays the same"],
      expected: () => "stays the same",
      hint: () => "Look at the formula: does the mass appear in it? Gravity pulls harder on a heavy ball, but it also has more mass to move.",
    },
  ],
};

// ================================================================== 3. acid–base titration

function setupOf(v: Values): TitrationSetup {
  return { acidC: v.acidC, acidV: v.acidV, baseC: v.baseC, Ka: v.weak === 1 ? Math.pow(10, -v.pKa) : null };
}

interface TitrData {
  setup: TitrationSetup;
  pH: number;
  indicatorId: string;
  veq: number;
}

function computeTitration(v: Values): Computed {
  const s = setupOf(v);
  const veq = equivalenceVolume(s);
  const pH = titrationPH(s, v.vb);
  const peq = equivalencePH(s);
  const curve = titrationCurve(s, 100, 250);
  const ind = INDICATORS[Math.max(0, Math.min(INDICATORS.length - 1, Math.round(v.indicator)))];
  return {
    duration: 0,
    data: { setup: s, pH, indicatorId: ind.id, veq } satisfies TitrData,
    outputs: [
      { key: "vb", label: "Base added", value: v.vb, unit: "mL", digits: 1 },
      { key: "pH", label: "pH now", value: pH, digits: 2 },
      { key: "veq", label: "Equivalence volume", value: veq, unit: "mL", digits: 1 },
      { key: "peq", label: "pH at equivalence", value: peq, digits: 2 },
    ],
    graphs: [
      {
        title: "Titration curve",
        xLabel: "base added (mL)",
        yLabel: "pH",
        series: [{ label: "pH", color: "#34d399", points: curve }, { label: "equivalence", color: "#64748b", dashed: true, points: [[veq, 0], [veq, 14]] }],
        marker: [v.vb, pH],
        xRange: [0, 100],
        yRange: [0, 14],
      },
    ],
  };
}

function drawTitration(ctx: CanvasRenderingContext2D, w: number, h: number, v: Values, c: Computed) {
  const d = c.data as TitrData;
  clear(ctx, w, h, "#0b1a2e");
  const ind = INDICATORS.find((i) => i.id === d.indicatorId)!;
  const col = rgb(indicatorColor(ind, d.pH));
  const cx = w / 2;
  // burette
  const bt = 14;
  const bh = h * 0.36;
  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 2;
  ctx.strokeRect(cx - 9, bt, 18, bh);
  const frac = 1 - Math.min(1, v.vb / 100);
  ctx.fillStyle = "#93c5fd";
  ctx.fillRect(cx - 7, bt + bh * (1 - frac) + 2, 14, bh * frac - 3);
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "10px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`${round(v.vb, 1)} mL added`, cx + 16, bt + 12);
  // tap + drop
  ctx.fillStyle = "#94a3b8";
  ctx.fillRect(cx - 2, bt + bh, 4, 12);
  if (v.vb > 0) {
    ctx.fillStyle = "#93c5fd";
    ctx.beginPath();
    ctx.arc(cx, bt + bh + 20, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // flask
  const top = bt + bh + 30;
  const bottom = h - 16;
  const neck = 16;
  const base = Math.min(70, w * 0.3);
  ctx.beginPath();
  ctx.moveTo(cx - neck, top);
  ctx.lineTo(cx - neck, top + (bottom - top) * 0.3);
  ctx.lineTo(cx - base, bottom);
  ctx.lineTo(cx + base, bottom);
  ctx.lineTo(cx + neck, top + (bottom - top) * 0.3);
  ctx.lineTo(cx + neck, top);
  ctx.closePath();
  ctx.fillStyle = col;
  ctx.globalAlpha = 0.9;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "#e2e8f0";
  ctx.stroke();
  ctx.fillStyle = "#0b1220";
  ctx.font = "bold 13px sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "#f8fafc";
  ctx.fillText(`pH ${round(d.pH, 2)}`, cx, bottom - 12);
  ctx.font = "10px sans-serif";
  ctx.fillText(ind.name, cx, top - 4);
  ctx.textAlign = "left";
}

export const titrationExperiment: Experiment = {
  id: "titration",
  title: "Acid–base titration",
  blurb: "Add base to an acid drop by drop, watch the pH curve and the indicator colour, and find the equivalence point.",
  emoji: "🧪",
  subject: "Chemistry",
  params: [
    { key: "weak", label: "Acid", min: 0, max: 1, step: 1, value: 0, options: [{ value: 0, label: "Strong (like HCl)" }, { value: 1, label: "Weak (like ethanoic)" }] },
    { key: "pKa", label: "Weak acid pKa", min: 3, max: 7, step: 0.01, value: 4.74 },
    { key: "acidC", label: "Acid concentration", unit: "mol/L", min: 0.02, max: 0.2, step: 0.01, value: 0.1 },
    { key: "acidV", label: "Acid volume", unit: "mL", min: 10, max: 40, step: 1, value: 25 },
    { key: "baseC", label: "Base (NaOH) concentration", unit: "mol/L", min: 0.1, max: 0.5, step: 0.01, value: 0.1 },
    { key: "indicator", label: "Indicator", min: 0, max: 2, step: 1, value: 2, options: INDICATORS.map((i, k) => ({ value: k, label: i.name })) },
    { key: "vb", label: "Base added", unit: "mL", min: 0, max: 100, step: 0.1, value: 0 },
  ],
  recordKeys: ["weak", "acidC", "acidV", "baseC", "vb", "pH", "veq"],
  compute: computeTitration,
  draw: drawTitration,
  tryThis: "Slide the base volume slowly. Watch where the curve is steepest and where the indicator changes colour. Then switch to the weak acid.",
  questions: [
    {
      kind: "number",
      id: "veq",
      prompt: "How much base (mL) is needed to exactly neutralise the acid in the flask?",
      unit: "mL",
      tol: 0.015,
      expected: (_v, c) => c.outputs.find((o) => o.key === "veq")!.value,
      hint: () => "At equivalence, moles of base = moles of acid: C(base)·V(base) = C(acid)·V(acid).",
    },
    {
      kind: "number",
      id: "peq",
      prompt: "What is the pH at the equivalence point for your acid?",
      tol: 0,
      absTol: 0.25,
      expected: (_v, c) => c.outputs.find((o) => o.key === "peq")!.value,
      hint: (v) => (v.weak === 1 ? "A weak acid's salt (its conjugate base) is basic, so the pH is above 7." : "A strong acid and a strong base make a neutral salt."),
    },
    {
      kind: "choice",
      id: "indicator",
      prompt: "Which indicator changes colour closest to the equivalence point of your titration?",
      options: INDICATORS.map((i) => i.name),
      expected: (_v, c) => bestIndicator(c.outputs.find((o) => o.key === "peq")!.value).name,
      hint: () => "Pick the indicator whose colour-change range (shown when you select it) contains the pH at equivalence.",
    },
  ],
};

// ================================================================== 4. ideal gas in a piston

const AREA = 0.005; // m² (50 cm²)

interface GasData {
  P: number;
  V: number;
}

function computeGas(v: Values): Computed {
  const V = pistonVolume(AREA, v.x / 100);
  const P = gasPressure(v.n, v.T, V);
  const Vl = V * 1000;
  const temps: Array<[number, number]> = [];
  for (let T = 200; T <= 600; T += 10) temps.push([T, gasPressure(v.n, T, V) / 1000]);
  return {
    duration: -1,
    data: { P, V } satisfies GasData,
    outputs: [
      { key: "V", label: "Volume", value: Vl, unit: "L", digits: 3 },
      { key: "P", label: "Pressure", value: P / 1000, unit: "kPa", digits: 1 },
      { key: "PV", label: "P × V", value: P * V, unit: "J", digits: 1 },
      { key: "PVnT", label: "P·V ÷ (n·T)", value: (P * V) / (v.n * v.T), unit: "J/(mol·K)", digits: 3 },
      { key: "speed", label: "Typical molecule speed (N₂)", value: rmsSpeed(v.T), unit: "m/s", digits: 0 },
    ],
    graphs: [
      { title: "Pressure against volume (this T)", xLabel: "volume (L)", yLabel: "pressure (kPa)", series: [{ label: "isotherm", color: "#38bdf8", points: isotherm(v.n, v.T, 0.25, 2.0) }], marker: [Vl, P / 1000], xRange: [0, 2], yRange: [0, Math.max(400, Math.min(2000, (P / 1000) * 1.3))] },
      { title: "Pressure against temperature (this V)", xLabel: "temperature (K)", yLabel: "pressure (kPa)", series: [{ label: "fixed V", color: "#f472b6", points: temps }], marker: [v.T, P / 1000], xRange: [200, 600] },
    ],
  };
}

function drawGas(ctx: CanvasRenderingContext2D, w: number, h: number, v: Values, c: Computed, t: number) {
  const d = c.data as GasData;
  clear(ctx, w, h, "#0b1a2e");
  const left = w * 0.25;
  const right = w * 0.75;
  const bottom = h - 14;
  const topMax = 30;
  const full = bottom - topMax;
  const pistonY = bottom - full * (v.x / 40);
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(left, topMax - 6);
  ctx.lineTo(left, bottom);
  ctx.lineTo(right, bottom);
  ctx.lineTo(right, topMax - 6);
  ctx.stroke();
  // piston and rod
  ctx.fillStyle = "#64748b";
  ctx.fillRect(left + 2, pistonY - 8, right - left - 4, 8);
  ctx.fillRect((left + right) / 2 - 3, 6, 6, pistonY - 12);
  ctx.fillStyle = "#e2e8f0";
  ctx.fillRect((left + right) / 2 - 14, 2, 28, 6);
  // molecules: deterministic bouncing, faster when hotter
  const count = Math.round(8 + v.n * 220);
  const speed = Math.sqrt(v.T / 300) * 0.9;
  const tri = (x: number) => {
    const m = ((x % 2) + 2) % 2;
    return m < 1 ? m : 2 - m;
  };
  ctx.fillStyle = `hsl(${Math.round(210 - ((v.T - 200) / 400) * 190)}, 85%, 62%)`;
  for (let i = 0; i < count; i++) {
    const a = ((i * 7919) % 1000) / 1000;
    const b = ((i * 104729) % 1000) / 1000;
    const dir = ((i * 1299709) % 628) / 100;
    const fx = tri(a + Math.cos(dir) * speed * t * 0.35);
    const fy = tri(b + Math.sin(dir) * speed * t * 0.35);
    const x = left + 6 + fx * (right - left - 12);
    const y = pistonY + 6 + fy * Math.max(4, bottom - pistonY - 12);
    ctx.beginPath();
    ctx.arc(x, y, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`${round(d.V * 1000, 2)} L`, right + 8, (pistonY + bottom) / 2);
  ctx.fillText(`${round(d.P / 1000, 1)} kPa`, 8, 20);
  ctx.fillText(`${round(v.T, 0)} K`, 8, 36);
}

export const gasExperiment: Experiment = {
  id: "gas",
  title: "Ideal gas in a piston",
  blurb: "Squeeze and heat a gas and watch pressure follow PV = nRT.",
  emoji: "🎈",
  subject: "Chemistry",
  params: [
    { key: "n", label: "Amount of gas", unit: "mol", min: 0.01, max: 0.2, step: 0.005, value: 0.05 },
    { key: "T", label: "Temperature", unit: "K", min: 200, max: 600, step: 5, value: 300 },
    { key: "x", label: "Piston height", unit: "cm", min: 5, max: 40, step: 0.5, value: 20 },
  ],
  recordKeys: ["n", "T", "x", "V", "P", "PVnT"],
  compute: computeGas,
  draw: drawGas,
  tryThis: "Record pressure at piston heights 10, 20 and 40 cm with the temperature fixed. What happens to P × V?",
  questions: [
    {
      kind: "number",
      id: "pressure",
      prompt: "What is the pressure (kPa) of the gas with your current settings?",
      unit: "kPa",
      tol: 0.02,
      expected: (_v, c) => c.outputs.find((o) => o.key === "P")!.value,
      hint: () => "P = nRT/V, with V in m³ (1 L = 0.001 m³). The cylinder is 50 cm² wide. Or read it from the results.",
    },
    {
      kind: "choice",
      id: "boyle",
      prompt: "You halve the volume by pushing the piston down, keeping temperature and amount of gas the same. The pressure…",
      options: ["halves", "doubles", "stays the same", "quadruples"],
      expected: () => "doubles",
      hint: () => "Try it: record the pressure at 20 cm, then at 10 cm. What is P × V each time?",
    },
    {
      kind: "number",
      id: "temp-for-200",
      prompt: "At your current amount of gas and piston height, what temperature (K) makes the pressure exactly 200 kPa?",
      unit: "K",
      tol: 0.02,
      expected: (v) => (200_000 * pistonVolume(AREA, v.x / 100)) / (v.n * 8.314462618),
      hint: () => "Rearrange PV = nRT to T = PV/(nR), with P in pascals (200 kPa = 200 000 Pa) and V in m³.",
    },
  ],
};

export const EXPERIMENTS: Experiment[] = [projectileExperiment, pendulumExperiment, titrationExperiment, gasExperiment];

export function experimentById(id: string): Experiment | undefined {
  return EXPERIMENTS.find((e) => e.id === id);
}

export function defaultValues(e: Experiment): Values {
  return Object.fromEntries(e.params.map((p) => [p.key, p.value]));
}

/** One data-table row: the chosen columns taken from the parameters and the computed outputs. */
export function recordRow(e: Experiment, v: Values, c: Computed): Record<string, number> {
  const row: Record<string, number> = {};
  for (const k of e.recordKeys) {
    const out = c.outputs.find((o) => o.key === k);
    const val = out ? out.value : v[k];
    if (typeof val === "number" && Number.isFinite(val)) row[k] = +val.toPrecision(6);
  }
  return row;
}

export function columnLabel(e: Experiment, key: string): string {
  const p = e.params.find((x) => x.key === key);
  if (p) return `${p.label}${p.unit ? ` (${p.unit})` : ""}`;
  const o = e.compute(defaultValues(e)).outputs.find((x) => x.key === key);
  return o ? `${o.label}${o.unit ? ` (${o.unit})` : ""}` : key;
}
