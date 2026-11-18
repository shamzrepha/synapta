import { describe, it, expect } from "vitest";
import { parseScript } from "./script";
import { sampleFunction, fractionFacts, isValidExpression } from "./math";

const wrap = (block: unknown) => ({ title: "T", scenes: [{ narration: "n", caption: "c", block }] });
const wrapMany = (...blocks: unknown[]) => ({ title: "T", scenes: blocks.map((block) => ({ narration: "n", caption: "c", block })) });

describe("lesson script safety", () => {
  it("strips $ from equation steps so a step cannot break out of the KaTeX math block into markdown", () => {
    const s = parseScript(wrap({ type: "equation_steps", steps: [{ expr: "x = 2$$ [click](https://evil.example) $$y", note: "n" }] }));
    const step = (s!.scenes[0].block as { steps: Array<{ expr: string }> }).steps[0];
    expect(step.expr).not.toContain("$");
  });
  it("drops 3D readouts whose formula cannot be evaluated", () => {
    const s = parseScript(
      wrap({
        type: "artifact3d",
        preset: "pendulum",
        sliders: [{ key: "L", min: 1, max: 5, value: 2 }],
        readouts: [
          { label: "Good", expr: "2*pi*sqrt(L/9.81)", unit: "s" },
          { label: "Bad", expr: "process.exit(1)", unit: "" },
          { label: "Unknown", expr: "zzz + 1", unit: "" },
        ],
      })
    );
    const labels = (s!.scenes[0].block as { readouts: Array<{ label: string }> }).readouts.map((r) => r.label);
    expect(labels).toEqual(["Good"]);
  });
  it("drops a balance block whose equation is not actually balanced", () => {
    const bad = parseScript(wrapMany({ type: "balance", reactants: [{ formula: "H2", coef: 1 }, { formula: "O2", coef: 1 }], products: [{ formula: "H2O", coef: 1 }] }, { type: "text", heading: "keep", bullets: [] }));
    expect(bad!.scenes.map((x) => x.block.type)).toEqual(["text"]);
    const good = parseScript(wrap({ type: "balance", reactants: [{ formula: "H2", coef: 2 }, { formula: "O2", coef: 1 }], products: [{ formula: "H2O", coef: 2 }] }));
    expect(good!.scenes[0].block.type).toBe("balance");
  });
  it("never evaluates code: injection-style expressions are rejected or undefined", () => {
    expect(isValidExpression("constructor.constructor('return 1')()")).toBe(false);
    expect(isValidExpression("alert(1)")).toBe(false);
    expect(isValidExpression("x; process.exit()")).toBe(false);
    expect(sampleFunction("globalThis.x", {}, -1, 1).every((p) => p.y === null)).toBe(true);
  });
  it("graph points that are undefined become null (line breaks) rather than NaN/Infinity", () => {
    const pts = sampleFunction("1/x", {}, -1, 1, 2);
    expect(pts[1].y).toBeNull();
  });
  it("fractions keep a positive denominator", () => {
    expect(fractionFacts(2, -4).reduced).toBe("-1/2");
    expect(fractionFacts(6, 8).reduced).toBe("3/4");
  });
});
