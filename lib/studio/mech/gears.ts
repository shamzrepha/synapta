import type { Mechanism } from "../spec";

/**
 * Gear-train lifting rig: input (motor or hand crank) → gear stages → winch drum → pulleys → load,
 * simulated with gravity. Teaches the real trade-off: more reduction = more force but less speed,
 * so there is a best ratio for lifting fastest (found below analytically and checked by simulation).
 */

export const G = 9.81;

export interface GearInfo {
  stage: number;
  role: "driver" | "driven";
  teeth: number;
  /** pitch radius in mm (module × teeth / 2) */
  radius: number;
  shaft: number;
  /** position in mm, for drawing */
  x: number;
  z: number;
  /** shaft speed relative to the input (1 = same speed) */
  speedFactor: number;
  direction: 1 | -1;
}

export interface MechAnalysis {
  ratio: number;
  efficiency: number;
  /** input radians per metre of load travel */
  radPerMetre: number;
  /** torque the input must supply just to hold the load (N·m) */
  holdTorque: number;
  /** for a crank: push force needed to hold the load (N) */
  holdForce?: number;
  /** input's maximum (stall) torque */
  inputMaxTorque: number;
  canLift: boolean;
  /** theoretical steady lifting speed (m/s), 0 when it can't lift */
  steadySpeed: number;
  /** total gear ratio that gives the fastest steady lift for this load and input */
  optimalRatio: number;
  mechanicalAdvantage: number;
  gears: GearInfo[];
  warnings: string[];
}

export interface SimSample {
  t: number;
  h: number;
  v: number;
  inputRpm: number;
}

export interface SimResult extends MechAnalysis {
  liftHeight: number;
  reached: boolean;
  timeToLift: number | null;
  maxSpeed: number;
  samples: SimSample[];
  /** challenge score: higher is better (0 when the load isn't lifted) */
  score: number;
  verdict: string;
}

function inputCurve(m: Mechanism) {
  if (m.input.kind === "motor") {
    return { stall: m.input.stallTorque, free: (m.input.freeRpm * 2 * Math.PI) / 60, inertia: 2e-5 };
  }
  // A person keeps most of their push at their comfortable cranking speed; it falls to zero at 2× that
  return { stall: m.input.force * m.input.crankRadius, free: (2 * m.input.crankRpm * 2 * Math.PI) / 60, inertia: 0.02 };
}

/** Gear positions for the 3D viewer: compound shafts, stages offset in depth. */
export function gearLayout(m: Mechanism): GearInfo[] {
  const gears: GearInfo[] = [];
  let x = 0;
  let speed = 1;
  let dir: 1 | -1 = 1;
  m.stages.forEach((s, i) => {
    const rDriver = (m.module * s.driverTeeth) / 2;
    const rDriven = (m.module * s.drivenTeeth) / 2;
    gears.push({ stage: i, role: "driver", teeth: s.driverTeeth, radius: rDriver, shaft: i, x, z: i * 14, speedFactor: speed, direction: dir });
    x += rDriver + rDriven;
    speed *= s.driverTeeth / s.drivenTeeth;
    dir = (dir * -1) as 1 | -1;
    gears.push({ stage: i, role: "driven", teeth: s.drivenTeeth, radius: rDriven, shaft: i + 1, x, z: i * 14, speedFactor: speed, direction: dir });
  });
  return gears;
}

export function analyzeMechanism(m: Mechanism): MechAnalysis {
  const ratio = m.stages.reduce((r, s) => r * (s.drivenTeeth / s.driverTeeth), 1);
  const efficiency = Math.pow(m.efficiencyPerStage, m.stages.length) * (m.pulleyAdvantage > 1 ? Math.pow(0.97, m.pulleyAdvantage - 1) : 1);
  const k = (ratio * m.pulleyAdvantage) / m.drumRadius;
  const { stall, free } = inputCurve(m);
  const weight = m.load.mass * G;
  const holdTorque = weight / (k * efficiency);
  const canLift = stall > holdTorque * 1.0001;
  // Steady state: stall·(1 − kv/ω_free)·k·η = mg
  const steadySpeed = canLift ? Math.max(0, (1 - holdTorque / stall) * (free / k)) : 0;
  // Fastest steady lift at k* = 2mg/(τ_stall·η)  →  ratio* = k*·r_drum / pulleys
  const optimalRatio = ((2 * weight) / (stall * efficiency)) * (m.drumRadius / m.pulleyAdvantage);
  const warnings: string[] = [];
  m.stages.forEach((s, i) => {
    const r = s.drivenTeeth / s.driverTeeth;
    if (r > 7 || r < 1 / 7) warnings.push(`Stage ${i + 1} ratio ${r.toFixed(1)}:1 is very large for one gear pair — split it into two stages.`);
    if (Math.min(s.driverTeeth, s.drivenTeeth) < 12) warnings.push(`Stage ${i + 1}: gears under 12 teeth get "undercut" and wear fast.`);
  });
  if (!canLift) warnings.push(`The input can give ${stall.toFixed(2)} N·m but needs ${holdTorque.toFixed(2)} N·m to hold the load. Add reduction or a stronger input.`);
  return {
    ratio,
    efficiency,
    radPerMetre: k,
    holdTorque,
    holdForce: m.input.kind === "crank" ? holdTorque / m.input.crankRadius : undefined,
    inputMaxTorque: stall,
    canLift,
    steadySpeed,
    optimalRatio,
    mechanicalAdvantage: (k * efficiency * (m.input.kind === "crank" ? m.input.crankRadius : 1)) || 0,
    gears: gearLayout(m),
    warnings,
  };
}

/**
 * Time-steps the lift with gravity: m_eff·a = τ_in(ω)·k·η − m·g, ω = k·v.
 * A ratchet stops the load sliding back down. Deterministic, so it can score challenges server-side.
 */
export function simulateLift(m: Mechanism, maxSeconds = 120): SimResult {
  const a = analyzeMechanism(m);
  const { stall, free, inertia } = inputCurve(m);
  const k = a.radPerMetre;
  const eta = a.efficiency;
  const mass = m.load.mass;
  const mEff = mass + inertia * k * k;
  let t = 0;
  let h = 0;
  let v = 0;
  let maxSpeed = 0;
  const dt = Math.min(0.01, Math.max(0.0005, m.liftHeight / 2000));
  const samples: SimSample[] = [{ t: 0, h: 0, v: 0, inputRpm: 0 }];
  const sampleEvery = Math.max(dt, maxSeconds / 600);
  let nextSample = sampleEvery;
  let reached = false;
  while (t < maxSeconds) {
    const omega = k * v;
    const tau = Math.max(0, stall * (1 - omega / free));
    const acc = (tau * k * eta - mass * G) / mEff;
    v += acc * dt;
    if (v < 0 && m.ratchet) v = 0;
    h += v * dt;
    if (h < 0) {
      h = 0;
      v = Math.max(0, v);
    }
    t += dt;
    maxSpeed = Math.max(maxSpeed, v);
    if (t >= nextSample) {
      samples.push({ t: +t.toFixed(3), h: +h.toFixed(4), v: +v.toFixed(4), inputRpm: Math.round((k * v * 60) / (2 * Math.PI)) });
      nextSample += sampleEvery;
    }
    if (h >= m.liftHeight) {
      reached = true;
      samples.push({ t: +t.toFixed(3), h: m.liftHeight, v: +v.toFixed(4), inputRpm: Math.round((k * v * 60) / (2 * Math.PI)) });
      break;
    }
    if (!a.canLift && t > 1) break;
  }
  const timeToLift = reached ? +t.toFixed(2) : null;
  const score = reached && timeToLift ? Math.round(10_000 / Math.max(0.05, timeToLift)) : 0;
  const verdict = reached
    ? `Lifted ${mass} kg by ${m.liftHeight} m in ${timeToLift} s (top speed ${maxSpeed.toFixed(2)} m/s).`
    : a.canLift
      ? `Too slow — only ${h.toFixed(2)} m in ${maxSeconds} s. Less reduction would be faster.`
      : `Can't lift: needs ${a.holdTorque.toFixed(2)} N·m at the input, but it only gives ${stall.toFixed(2)} N·m.`;
  return { ...a, liftHeight: m.liftHeight, reached, timeToLift, maxSpeed, samples, score, verdict };
}
