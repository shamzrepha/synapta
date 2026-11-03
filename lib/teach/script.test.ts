import { describe, it, expect } from "vitest";
import { fallbackScript, parseScript } from "./script";
import { fractionFacts, hypotenuse, projectileSummary, sampleFunction, triangleSquares } from "./math";

describe("lesson scripts", () => {
  it("keeps valid scenes and drops bad ones", () => {
    const s = parseScript({
      title: "Pythagoras",
      scenes: [
        { narration: "Look at this triangle.", caption: "Triangle", block: { type: "triangle", a: 3, b: 4 } },
        { narration: "Bad block", block: { type: "script", code: "alert(1)" } },
        { narration: "Bad graph", block: { type: "grapher", expr: "process.exit()", sliders: [] } },
        { narration: "Good graph", block: { type: "grapher", expr: "m*x+1", sliders: [{ key: "m", min: -3, max: 3, value: 9 }] } },
      ],
    });
    expect(s?.scenes.map((x) => x.block.type)).toEqual(["triangle", "grapher"]);
    const g = s!.scenes[1].block as { sliders: Array<{ value: number }> };
    expect(g.sliders[0].value).toBe(3);
  });
  it("rejects a script with nothing usable", () => {
    expect(parseScript({ title: "x", scenes: [{ narration: "n", block: { type: "nope" } }] })).toBeNull();
    expect(parseScript("garbage")).toBeNull();
  });
  it("falls back to the notes themselves", () => {
    const f = fallbackScript("Triangles", "# Triangles\n\n## Right triangles\n- Has a 90° angle\n- Hypotenuse is longest\n\n## Pythagoras\n- a² + b² = c²");
    expect(f.scenes).toHaveLength(2);
    expect(f.scenes[0].block).toMatchObject({ type: "text", heading: "Right triangles" });
    expect(fallbackScript("T", "").scenes).toHaveLength(1);
  });
});

describe("lesson maths", () => {
  it("3-4-5 triangle squares add up", () => {
    expect(hypotenuse(3, 4)).toBe(5);
    expect(triangleSquares(3, 4)).toMatchObject({ a2: 9, b2: 16, c2: 25 });
  });
  it("samples a function and breaks the line where it is undefined", () => {
    const pts = sampleFunction("1/x", {}, -1, 1, 2);
    expect(pts.map((p) => p.y)).toEqual([-1, null, 1]);
    expect(sampleFunction("m*x", { m: 2 }, 0, 2, 2).map((p) => p.y)).toEqual([0, 2, 4]);
  });
  it("projectile range at 45 degrees", () => {
    const s = projectileSummary(20, 45, 9.81);
    expect(Math.round(s.range * 10) / 10).toBe(40.8);
  });
  it("reduces fractions", () => {
    expect(fractionFacts(6, 8)).toEqual({ reduced: "3/4", decimal: 0.75, percent: 75 });
  });
});
