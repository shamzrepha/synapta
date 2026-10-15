import { CATALOG_BY_TYPE } from "./circuit/catalog";
import { checkCircuit } from "./circuit/checker";
import { Netlist, scanCode } from "./circuit/netlist";
import { runBehaviorTest, type TestResult } from "./circuit/runtime";
import { simulateLift } from "./mech/gears";
import { simulateDrive } from "./drive/run";
import type { DesignSpec, Step } from "./spec";

/**
 * Checks a guided step against a design. Runs the same engines on the client (instant feedback)
 * and on the server (trusted: XP and challenge scores come only from server checks).
 */
export interface StepResult {
  done: boolean;
  /** true when a machine verified it (not self-reported) */
  verified: boolean;
  message: string;
}

export function verifyStep(spec: DesignSpec, step: Step): StepResult {
  const c = step.check;
  const circuit = spec.circuit;
  const code = spec.code || "";
  switch (c.kind) {
    case "manual":
      return { done: true, verified: false, message: "Marked as done." };
    case "parts": {
      const n = circuit?.parts.filter((p) => p.type === c.type).length || 0;
      const name = CATALOG_BY_TYPE[c.type]?.name || c.type;
      return n >= c.min ? { done: true, verified: true, message: `${n} × ${name} placed.` } : { done: false, verified: true, message: `Place ${c.min - n} more ${name}${c.min - n > 1 ? "s" : ""}.` };
    }
    case "wired": {
      if (!circuit) return { done: false, verified: true, message: "No circuit." };
      return new Netlist(circuit).isWired(c.part) ? { done: true, verified: true, message: "Wired." } : { done: false, verified: true, message: `Wire ${c.part} to the board.` };
    }
    case "noErrors": {
      if (!circuit) return { done: false, verified: true, message: "No circuit." };
      const errs = checkCircuit(circuit, code).filter((i) => i.severity === "error");
      const unwired = circuit.parts.filter((p) => p.type !== "board" && !new Netlist(circuit).isWired(p.id));
      if (errs.length) return { done: false, verified: true, message: errs[0].message };
      if (unwired.length) return { done: false, verified: true, message: `${unwired.length} part(s) still unwired.` };
      return { done: true, verified: true, message: "Wiring checks out." };
    }
    case "code": {
      const s = scanCode(code);
      if (!s.hasSetup || !s.hasLoop) return { done: false, verified: true, message: "Write both setup() and loop()." };
      const missing = Array.from(s.writes).filter((n) => s.modes.get(n) !== "OUTPUT");
      if (s.modes.size === 0) return { done: false, verified: true, message: "Use pinMode(pin, OUTPUT) in setup()." };
      if (missing.length && !/servoWrite|tone/.test(code)) return { done: false, verified: true, message: `Pin ${missing[0]} is written but not set to OUTPUT.` };
      return { done: true, verified: true, message: "setup() and loop() look right." };
    }
    case "test": {
      const t = spec.tests.find((x) => x.id === c.testId);
      if (!t || !circuit) return { done: false, verified: true, message: "Test not found." };
      const r = runBehaviorTest(circuit, code, t);
      return { done: r.pass, verified: true, message: r.message };
    }
    case "lifts": {
      if (!spec.mechanism) return { done: false, verified: true, message: "No mechanism." };
      const r = simulateLift(spec.mechanism);
      return { done: r.reached, verified: true, message: r.verdict };
    }
    case "drive": {
      if (!circuit || !spec.robot || !spec.world) return { done: false, verified: true, message: "This design needs a robot and a track." };
      const r = simulateDrive(spec, c.seconds, 0.02);
      if (r.error) return { done: false, verified: true, message: `Program error — ${r.error}` };
      const pct = Math.round(r.onLineFraction * 100);
      const laps = Math.max(0, r.laps);
      if (laps < c.laps) return { done: false, verified: true, message: `In ${c.seconds} s the robot covered ${Math.round(laps * 100)}% of ${c.laps === 1 ? "a lap" : `${c.laps} laps`}. It stayed on the line ${pct}% of the time — ${pct < 60 ? "it keeps leaving the line: check the sensors, wiring and steering code" : "make it faster without leaving the line"}.` };
      if (r.onLineFraction < c.onLine) return { done: false, verified: true, message: `It finished, but stayed on the line only ${pct}% of the time (needs ${Math.round(c.onLine * 100)}%). Slow down in corners.` };
      return { done: true, verified: true, message: `Finished ${laps.toFixed(1)} lap(s) in ${c.seconds} s, on the line ${pct}% of the time.` };
    }
    case "liftTime": {
      if (!spec.mechanism) return { done: false, verified: true, message: "No mechanism." };
      const r = simulateLift(spec.mechanism);
      const ok = r.reached && (r.timeToLift ?? Infinity) <= c.maxSeconds;
      return { done: ok, verified: true, message: ok ? r.verdict : r.reached ? `${r.timeToLift} s — needs ${c.maxSeconds} s or less.` : r.verdict };
    }
  }
}

/** Runs every behaviour test (for the Tests panel and challenge scoring). */
export function runAllTests(spec: DesignSpec): TestResult[] {
  if (!spec.circuit) return [];
  return spec.tests.map((t) => runBehaviorTest(spec.circuit!, spec.code || "", t));
}
