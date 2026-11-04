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
    { narration: "fig", block: { type: "figure", query: "Arduino Uno board", caption: "The board", parts: [{ name: "USB port", detail: "power" }], src: { url: "https://upload.wikimedia.org/a.jpg", page: "https://commons.wikimedia.org/wiki/File:A.jpg", author: "Jane", license: "CC BY" } } },
    { narration: "bad fig url", block: { type: "figure", query: "x", src: { url: "https://evil.example/a.jpg", page: "p", author: "a", license: "l" } } },
    { narration: "chk", block: { type: "check", question: "2+2?", options: ["3", "4"], answer: 1, explain: "Four." } },
    { narration: "bad chk", block: { type: "check", question: "q", options: ["a", "b"], answer: 3 } },
    { narration: "flow", block: { type: "flow", steps: [{ label: "Collect", detail: "d" }, { label: "Sort", detail: "" }] } },
    { narration: "bal", block: { type: "balance", reactants: [{ formula: "H2", coef: 2 }, { formula: "O2", coef: 1 }], products: [{ formula: "H2O", coef: 2 }] } },
    { narration: "bad bal", block: { type: "balance", reactants: [{ formula: "zz", coef: 1 }], products: [{ formula: "H2O", coef: 1 }] } },
    { narration: "c", block: { type: "compare", left: { title: "A", points: ["a"] }, right: { title: "B", points: ["b"] } } },
  ],
});

describe("lesson blocks", () => {
  it("parses every sample scene", () => {
    expect(script?.scenes).toHaveLength(14);
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

describe("figure safety", () => {
  it("drops a picture that is not from Wikimedia and shows the licence line for one that is", () => {
    const figs = script!.scenes.filter((x) => x.block.type === "figure");
    expect((figs[1].block as { src?: unknown }).src).toBeUndefined();
    const html = renderToString(<BlockView block={figs[0].block} ms={1000} />);
    expect(html).toContain("Wikimedia Commons");
    expect(html).toContain("Jane");
    expect(html).toContain("upload.wikimedia.org");
  });
});
