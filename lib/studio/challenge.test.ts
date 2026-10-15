import { describe, it, expect } from "vitest";
import { scoreEntry, starterFor, buildRulesSchema } from "./challenge";
import { TEMPLATES, templateSolution } from "./templates";

describe("build challenges", () => {
  const rules = buildRulesSchema.parse({ designKind: "mechanism", templateId: "gear-lift", loadMass: 3, liftHeight: 1, maxStages: 3 });

  it("starts entrants from a weak 1:1 rig with the locked brief", () => {
    const s = starterFor(rules);
    expect(s.mechanism!.load.mass).toBe(3);
    expect(s.mechanism!.stages).toEqual([{ driverTeeth: 20, drivenTeeth: 20 }]);
    expect(scoreEntry(s, rules).valid).toBe(false);
  });

  it("scores a good gear train and ignores attempts to change the brief", () => {
    const s = starterFor(rules);
    const good = { ...s, mechanism: { ...s.mechanism!, stages: [{ driverTeeth: 12, drivenTeeth: 48 }, { driverTeeth: 12, drivenTeeth: 36 }] } };
    const cheat = { ...good, mechanism: { ...good.mechanism, load: { mass: 0.1 }, input: { ...good.mechanism.input, stallTorque: 50 } } };
    const a = scoreEntry(good, rules);
    expect(a.valid).toBe(true);
    expect(a.score).toBeGreaterThan(0);
    expect(scoreEntry(cheat, rules).score).toBe(a.score);
  });

  it("enforces the stage limit", () => {
    const s = starterFor(rules);
    const many = { ...s, mechanism: { ...s.mechanism!, stages: Array.from({ length: 4 }, () => ({ driverTeeth: 12, drivenTeeth: 24 })) } };
    expect(scoreEntry(many, rules).verdict).toMatch(/Too many/);
  });

  it("judges circuits with the template's own tests", () => {
    const cr = buildRulesSchema.parse({ designKind: "circuit", templateId: "traffic-light" });
    const solved = templateSolution(TEMPLATES.find((t) => t.id === "traffic-light")!);
    const r = scoreEntry(solved, cr);
    expect(r.valid).toBe(true);
    expect(r.score).toBeGreaterThan(1000);
    expect(scoreEntry(starterFor(cr), cr).valid).toBe(false);
  });
});
