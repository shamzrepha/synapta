import { describe, it, expect } from "vitest";
import { evaluate, num } from "./expr";
import { parseSpec, resolveParts, emptySpec } from "./spec";
import { diffSpecs, lineDiff } from "./diff";

describe("studio expressions", () => {
  it("evaluates arithmetic with params, precedence and functions", () => {
    expect(evaluate("width + 2 * wall", { width: 200, wall: 6 })).toBe(212);
    expect(evaluate("-(2 + 3) * 4")).toBe(-20);
    expect(evaluate("2 ^ 3 ^ 2")).toBe(512);
    expect(evaluate("max(3, sqrt(16), 1)")).toBe(4);
    expect(evaluate("pi * r ^ 2", { r: 1 })).toBeCloseTo(Math.PI);
  });

  it("rejects anything that isn't arithmetic", () => {
    expect(() => evaluate("constructor")).toThrow();
    expect(() => evaluate("alert(1)")).toThrow();
    expect(() => evaluate("a.b")).toThrow();
    expect(() => evaluate("1 +")).toThrow();
    expect(() => evaluate("1/0")).toThrow();
    expect(num("oops(", {}, 7)).toBe(7);
  });
});

describe("design spec", () => {
  it("resolves formula sizes from parameters and clamps parameter overrides", () => {
    const spec = parseSpec({
      kind: "assembly",
      params: [{ key: "w", label: "Width", value: 200, min: 100, max: 300 }],
      parts: [{ id: "base", name: "Base", size: ["w", 6, "w"], pos: [0, 3, "w / 2"] }],
    });
    expect(resolveParts(spec)[0].size).toEqual([200, 6, 200]);
    expect(resolveParts(spec, { w: 999 })[0].pos[2]).toBe(150);
  });

  it("gives readable errors for invalid designs", () => {
    expect(() => parseSpec({ kind: "spaceship" })).toThrow(/Invalid design: kind/);
  });

  it("creates usable empty designs of each kind", () => {
    expect(emptySpec("circuit").circuit?.parts[0].type).toBe("board");
    expect(emptySpec("mechanism").mechanism?.stages.length).toBe(1);
  });
});

describe("design diff", () => {
  it("summarises parameter, part, wire, code and gear changes", () => {
    const a = parseSpec({
      kind: "circuit",
      params: [{ key: "w", label: "Width", value: 200, min: 100, max: 300, unit: "mm" }],
      circuit: { parts: [{ id: "board", type: "board", x: 0, y: 0 }], wires: [] },
      code: "a\nb\nc",
    });
    const b = parseSpec({
      ...a,
      params: [{ ...a.params[0], value: 240 }],
      circuit: { parts: [...a.circuit!.parts, { id: "led1", type: "led", x: 10, y: 10 }], wires: [{ id: "w1", from: "board.D13", to: "led1.anode" }] },
      code: "a\nB\nc\nd",
    });
    const d = diffSpecs(a, b);
    expect(d.lines).toContain("~ Width 200 → 240 mm");
    expect(d.lines).toContain("+ component led1");
    expect(d.lines).toContain("+ wire board.D13 → led1.anode");
    expect(d.lines).toContain("~ code +2 −1 lines");
  });

  it("counts line changes", () => {
    expect(lineDiff("a\nb", "a\nb")).toEqual({ added: 0, removed: 0 });
    expect(lineDiff("a\nb\nc", "a\nc")).toEqual({ added: 0, removed: 1 });
  });
});

import { repairSpec } from "./design-ai";
import { SHAPE_FIELDS, defaultSize } from "./spec";

describe("3D shapes", () => {
  it("accepts every shape and every shape has default sizes matching its fields", () => {
    for (const shape of Object.keys(SHAPE_FIELDS) as Array<keyof typeof SHAPE_FIELDS>) {
      expect(defaultSize(shape)).toHaveLength(SHAPE_FIELDS[shape].length);
    }
    const spec = parseSpec({
      kind: "assembly",
      parts: [
        { id: "g", name: "Gear", shape: "gear", teeth: 24, size: [30, 8], pos: [0, 4, 0] },
        { id: "t", name: "Pipe", shape: "tube", size: [20, 50, 14], pos: [0, 25, 0] },
        { id: "r", name: "Ring", shape: "torus", size: [30, 6], pos: [0, 3, 0] },
      ],
    });
    expect(resolveParts(spec).map((p) => p.shape)).toEqual(["gear", "tube", "torus"]);
    expect(resolveParts(spec)[0].teeth).toBe(24);
  });

  it("repairs messy AI parts: unknown shapes, missing sizes, bad positions", () => {
    const fixed = parseSpec(
      repairSpec({
        kind: "assembly",
        parts: [
          { id: "a b", name: "Weird", shape: "pyramid", size: [10], pos: [1] },
          { id: "g", shape: "gear", size: [30, 8], pos: [0, 0, 0] },
          { id: "t", shape: "tube", size: [20], pos: [0, 0, 0] },
        ],
      })
    );
    expect(fixed.parts[0].shape).toBe("box");
    expect(fixed.parts[0].size).toHaveLength(3);
    expect(fixed.parts[0].pos).toHaveLength(3);
    expect(fixed.parts[1].teeth).toBe(20);
    expect(fixed.parts[2].size).toHaveLength(3);
  });
});

import { TEMPLATES } from "./templates";
describe("3D templates", () => {
  it("every template parses and 3D ones resolve to finite numbers", () => {
    for (const t of TEMPLATES) {
      const s = parseSpec(t.spec);
      for (const p of resolveParts(s)) {
        expect([...p.size, ...p.pos, ...(p.rot || [])].every(Number.isFinite)).toBe(true);
      }
    }
  });
});

import { getTemplate } from "./templates";
import { runBehaviorTest } from "./circuit/runtime";
import { checkCircuit } from "./circuit/checker";

describe("RC car template", () => {
  it("has 3D parts, a clean circuit and passing code", () => {
    const t = parseSpec(getTemplate("rc-car")!.spec);
    expect(t.parts.some((p) => p.spinWith === "mL")).toBe(true);
    expect(checkCircuit(t.circuit!, t.code || "").filter((i) => i.severity === "error")).toEqual([]);
    expect(runBehaviorTest(t.circuit!, t.code || "", t.tests[0]).pass).toBe(true);
  });
});

import { applyPatch } from "./design-ai";
describe("AI edit patches", () => {
  it("adds, updates and removes 3D parts without rewriting the rest", () => {
    const spec = parseSpec({ kind: "assembly", parts: [{ id: "a", name: "A", size: [10, 10, 10], pos: [0, 5, 0] }, { id: "b", name: "B", size: [5, 5, 5], pos: [0, 15, 0] }] });
    const merged = parseSpec(repairSpec(applyPatch(spec, { updateParts: [{ id: "a", color: "#ff0000" }], removePartIds: ["b"], addParts: [{ id: "a", name: "Handle", shape: "capsule", size: [4, 30], pos: [0, 30, 0] }] })));
    expect(merged.parts.map((p) => p.id)).toEqual(["a", "a_2"]);
    expect(merged.parts[0].color).toBe("#ff0000");
    expect(merged.parts[1].shape).toBe("capsule");
  });
});

import { sceneParts } from "./circuit/to3d";
describe("one world: circuit, code and 3D", () => {
  it("every template parses; switch-gears runs and its gears are bound to the motor", () => {
    for (const t of TEMPLATES) parseSpec(t.spec);
    const t = parseSpec(getTemplate("switch-gears")!.spec);
    expect(runBehaviorTest(t.circuit!, t.code || "", t.tests[0]).pass).toBe(true);
    const scene = sceneParts(t);
    // the switch, board and driver get generated 3D models; the motor does not (the gears stand for it)
    expect(scene.some((p) => p.id.startsWith("auto_sw1") && p.bind === "sw1")).toBe(true);
    expect(scene.some((p) => p.id.startsWith("auto_board"))).toBe(true);
    expect(scene.filter((p) => p.bind === "m1").length).toBeGreaterThanOrEqual(3);
    expect(scene.find((p) => p.id === "gear2")!.spinRatio).toBeCloseTo(-0.5);
    expect(scene.every((p) => p.size.every(Number.isFinite) && p.pos.every(Number.isFinite))).toBe(true);
  });
  it("any circuit appears in 3D with no help", () => {
    const t = parseSpec(getTemplate("traffic-light")!.spec);
    const scene = sceneParts(t);
    expect(scene.filter((p) => p.bind).length).toBeGreaterThanOrEqual(3);
  });
});
