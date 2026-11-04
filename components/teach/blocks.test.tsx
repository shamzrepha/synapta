import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import React from "react";
import { BlockView } from "./blocks";
import { parseScript } from "@/lib/teach/script";

const script = parseScript({
  title: "All blocks",
  scenes: [
    { narration: "t", block: { type: "text", heading: "Hello", bullets: ["one", "two"] } },
    { narration: "e", block: { type: "equation_steps", steps: [{ expr: "a^2+b^2=c^2", note: "start" }, { expr: "c=5", note: "" }] } },
    { narration: "p", block: { type: "triangle", a: 3, b: 4 } },
    { narration: "g", block: { type: "grapher", expr: "m*x + c", sliders: [{ key: "m", min: -5, max: 5, value: 2 }, { key: "c", min: -5, max: 5, value: 1 }] } },
    { narration: "g2", block: { type: "grapher", expr: "1/x", xMin: -5, xMax: 5, sliders: [] } },
    { narration: "m", block: { type: "motion", v0: 20, angle: 45, g: 9.81 } },
    { narration: "f", block: { type: "fraction", num: 3, den: 4 } },
    { narration: "l", block: { type: "timeline", items: [{ label: "1884", detail: "x" }, { label: "1960", detail: "y" }] } },
    { narration: "c", block: { type: "compare", left: { title: "A", points: ["a"] }, right: { title: "B", points: ["b"] } } },
  ],
});

describe("lesson blocks", () => {
  it("parses every sample scene", () => {
    expect(script?.scenes).toHaveLength(9);
  });
  it("draws every block without crashing", () => {
    for (const s of script!.scenes) {
      const html = renderToString(<BlockView block={s.block} ms={1000} />);
      expect(html.length, s.block.type).toBeGreaterThan(20);
    }
  });
  it("the triangle shows 9 + 16 = 25", () => {
    const html = renderToString(<BlockView block={script!.scenes[2].block} ms={1000} />);
    expect(html).toContain("9");
    expect(html).toContain("25");
  });
});
