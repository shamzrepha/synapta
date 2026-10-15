import { describe, it, expect } from "vitest";
import { TEMPLATES, templateStart, templateSolution } from "./templates";
import { runBehaviorTest } from "./circuit/runtime";
import { checkCircuit } from "./circuit/checker";
import { simulateLift } from "./mech/gears";
import { resolveParts } from "./spec";

describe("pre-saved templates", () => {
  for (const t of TEMPLATES) {
    it(`${t.id}: valid, and its solution passes its own checks`, () => {
      const start = templateStart(t);
      const sol = templateSolution(t);
      expect(start.kind).toBe(t.kind);
      if (sol.circuit) {
        expect(checkCircuit(sol.circuit, sol.code || "").filter((i) => i.severity === "error")).toEqual([]);
        for (const test of sol.tests) expect(runBehaviorTest(sol.circuit, sol.code || "", test).pass, `${t.id}/${test.id}`).toBe(true);
      }
      if (sol.mechanism) expect(simulateLift(sol.mechanism).reached).toBe(true);
      if (sol.parts.length) expect(resolveParts(sol).every((p) => p.size.every((n) => n > 0))).toBe(true);
    });
  }

  it("the guided traffic light starts unfinished, so its test fails until the learner builds it", () => {
    const t = TEMPLATES.find((x) => x.id === "traffic-light")!;
    const start = templateStart(t);
    expect(runBehaviorTest(start.circuit!, start.code || "", start.tests[0]).pass).toBe(false);
  });
});
