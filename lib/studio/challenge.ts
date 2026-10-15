import { z } from "zod";
import { simulateLift } from "./mech/gears";
import { runBehaviorTest } from "./circuit/runtime";
import { checkCircuit } from "./circuit/checker";
import { getTemplate, templateSolution, templateStart } from "./templates";
import { mechanismSchema, parseSpec, type DesignSpec, type BehaviorTest } from "./spec";

/**
 * Build challenges ("lift this load fastest with this motor", "make the lights pass the test with
 * the fewest parts"). The host fixes the brief; entrants design freely within it; the server
 * re-runs the deterministic simulators to score every entry, so scores can't be faked.
 */
export const buildRulesSchema = z.object({
  designKind: z.enum(["mechanism", "circuit"]),
  templateId: z.string().max(60),
  /** mechanism brief (locked for every entrant) */
  loadMass: z.number().positive().max(10000).optional(),
  liftHeight: z.number().positive().max(100).optional(),
  input: mechanismSchema.shape.input.optional(),
  maxStages: z.number().int().min(1).max(6).default(4),
});
export type BuildRules = z.output<typeof buildRulesSchema>;

export function starterFor(rules: BuildRules): DesignSpec {
  const t = getTemplate(rules.templateId);
  if (!t) throw new Error("Unknown challenge template");
  const spec = templateStart(t, true);
  if (rules.designKind === "mechanism" && spec.mechanism) {
    spec.mechanism = {
      ...spec.mechanism,
      ...(rules.input ? { input: rules.input } : {}),
      load: { mass: rules.loadMass ?? spec.mechanism.load.mass },
      liftHeight: rules.liftHeight ?? spec.mechanism.liftHeight,
      // entrants pick the gears: start from a weak 1:1 so nobody begins with a winning design
      stages: [{ driverTeeth: 20, drivenTeeth: 20 }],
    };
  }
  return parseSpec(spec);
}

/** The judge's tests for circuit challenges come from the template, never from the entry. */
export function judgeTests(rules: BuildRules): BehaviorTest[] {
  const t = getTemplate(rules.templateId);
  return t ? templateSolution(t).tests : [];
}

export interface EntryScore {
  score: number;
  verdict: string;
  valid: boolean;
  details: Record<string, number | string | boolean | null>;
}

export function scoreEntry(spec: DesignSpec, rules: BuildRules): EntryScore {
  if (rules.designKind === "mechanism") {
    if (!spec.mechanism) return { score: 0, verdict: "No mechanism in this design.", valid: false, details: {} };
    if (spec.mechanism.stages.length > rules.maxStages) {
      return { score: 0, verdict: `Too many gear stages (${spec.mechanism.stages.length}); the limit is ${rules.maxStages}.`, valid: false, details: {} };
    }
    // Lock the brief: whatever the entrant changed, the judge uses the challenge's input, load and height
    const starter = starterFor(rules).mechanism!;
    const judged = { ...spec.mechanism, input: starter.input, load: starter.load, liftHeight: starter.liftHeight, efficiencyPerStage: Math.min(spec.mechanism.efficiencyPerStage, 0.95) };
    const r = simulateLift(judged, 120);
    return {
      score: r.score,
      verdict: r.verdict,
      valid: r.reached,
      details: { time: r.timeToLift, ratio: +r.ratio.toFixed(2), holdForce: r.holdForce !== undefined ? +r.holdForce.toFixed(1) : null, topSpeed: +r.maxSpeed.toFixed(3) },
    };
  }
  if (!spec.circuit) return { score: 0, verdict: "No circuit in this design.", valid: false, details: {} };
  const tests = judgeTests(rules);
  const results = tests.map((t) => runBehaviorTest(spec.circuit!, spec.code || "", t));
  const passed = results.filter((r) => r.pass).length;
  const errors = checkCircuit(spec.circuit, spec.code || "").filter((i) => i.severity === "error").length;
  const allPass = tests.length > 0 && passed === tests.length && errors === 0;
  // Correctness first; a tidy build (fewer parts and wires) breaks ties
  const tidy = allPass ? Math.max(0, 300 - 10 * (spec.circuit.parts.length + spec.circuit.wires.length)) : 0;
  const score = Math.round((passed / Math.max(1, tests.length)) * 1000) - errors * 100 + tidy;
  return {
    score: Math.max(0, score),
    verdict: allPass ? `All ${tests.length} judge tests pass with ${spec.circuit.parts.length} parts and ${spec.circuit.wires.length} wires.` : `${passed}/${tests.length} judge tests pass${errors ? `, ${errors} wiring error(s)` : ""}. ${results.find((r) => !r.pass)?.message || ""}`.trim(),
    valid: allPass,
    details: { passed, total: tests.length, errors, parts: spec.circuit.parts.length, wires: spec.circuit.wires.length },
  };
}
