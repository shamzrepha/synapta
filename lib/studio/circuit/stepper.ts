/**
 * 28BYJ-48 + ULN2003 behaviour (numbers from the Kiatronics 28BYJ-48 datasheet and the TI ULN2003A
 * datasheet, see parts/library.ts).
 *
 * The motor has four coils (A–D). The ULN2003 sinks a coil's current while its IN pin is HIGH (a TTL / 5 V
 * input turns it on; the datasheet's worst-case ON-state input voltage is 2.4 V at 200 mA). One coil
 * energised puts the rotor on an even half-step position (0, 2, 4, 6); two neighbouring coils put it
 * in between (1, 3, 5, 7). Stride angle 5.625°/64 with a 1/64 gearbox: 64 half-steps per turn of the
 * motor shaft × 64 = 4096 half-steps per turn of the output shaft (2048 full steps).
 */
export const HALF_STEPS_PER_REV = 4096;
/** A coil input counts as HIGH above this (ULN2003A worst-case VI(on) at 200 mA). */
export const ULN_ON_VOLTS = 2.4;
/** Pattern changes closer together than this are above the 1 kHz out-traction frequency: the rotor cannot follow. */
export const MIN_STEP_INTERVAL_MS = 1;
/** Pin writes closer together than this belong to one logical step (a program sets four pins one after another). */
export const BURST_MS = 0.1;

/** Half-step position (0–7) of a coil pattern, or null when it isn't a valid driving pattern (nothing energised, opposite coils…). */
export function coilPosition(bits: ReadonlyArray<0 | 1 | boolean | number>): number | null {
  const b = bits.map((x) => (x ? 1 : 0));
  if (b.length !== 4) return null;
  const on = b.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  if (on.length === 1) return on[0] * 2;
  if (on.length === 2) {
    const [x, y] = on;
    if (y - x === 1) return x * 2 + 1;
    if (x === 0 && y === 3) return 7; // coils D and A
  }
  return null;
}

/** Signed shortest move (in half-steps) from one position to another, or null if the rotor would not follow (a jump of 3 or 4 half-steps is ambiguous). */
export function stepDelta(from: number, to: number): number | null {
  const d = ((((to - from + 4) % 8) + 8) % 8) - 4; // -4..3
  if (d === 0) return 0;
  return Math.abs(d) <= 2 ? d : null;
}

/** Output shaft angle (degrees, unbounded) after a number of half-steps. */
export function stepperDegrees(halfSteps: number): number {
  return (halfSteps * 360) / HALF_STEPS_PER_REV;
}

export interface StepperState {
  /** half-step position of the last accepted pattern (null until the first valid pattern appears) */
  pos: number | null;
  burstStartMs: number;
  lastWriteMs: number;
  allowed: boolean;
}

export function newStepperState(): StepperState {
  return { pos: null, burstStartMs: -1e9, lastWriteMs: -1e9, allowed: true };
}

/**
 * Feeds the current coil inputs to the stepper model and returns how many half-steps the rotor moved
 * (+ = the IN1→IN2→IN3→IN4 direction). The first valid pattern only sets the reference (the rotor is
 * wherever it was). Patterns the rotor can't follow (too fast, skipping phases) are ignored.
 */
export function stepperUpdate(st: StepperState, bits: ReadonlyArray<0 | 1 | boolean | number>, powered: boolean, nowMs: number): number {
  if (nowMs - st.lastWriteMs >= BURST_MS) {
    st.allowed = nowMs - st.burstStartMs >= MIN_STEP_INTERVAL_MS - 1e-9;
    if (st.allowed) st.burstStartMs = nowMs;
  }
  st.lastWriteMs = nowMs;
  const pos = coilPosition(bits);
  if (pos === null || !powered) return 0;
  if (st.pos === null) {
    st.pos = pos;
    return 0;
  }
  if (!st.allowed) return 0;
  const d = stepDelta(st.pos, pos);
  if (d === null || d === 0) return 0;
  st.pos = pos;
  return d;
}
