import { describe, it, expect } from "vitest";
import { mergeSpecs, mergeText, same } from "./merge";
import { parseSpec } from "./spec";

const box = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: id, shape: "box", size: [10, 10, 10], pos: [0, 0, 0], ...extra });
const base = () => ({
  version: 1,
  kind: "circuit",
  summary: "start",
  params: [{ key: "w", label: "Width", value: 5, min: 0, max: 10, step: 1 }, { key: "h", label: "Height", value: 3, min: 0, max: 10, step: 1 }],
  parts: [box("a"), box("b", { color: "#fff" })],
  circuit: {
    parts: [{ id: "board", type: "board", x: 10, y: 10 }, { id: "led1", type: "led", x: 100, y: 50, props: { color: "red" } }],
    wires: [{ id: "w1", from: "board.D13", to: "led1.anode" }],
  },
  code: "line1\nline2\nline3\nline4\nline5",
  steps: [{ id: "s1", title: "One", detail: "d", check: { kind: "manual" } }],
  tests: [],
});
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

describe("mergeText", () => {
  it("combines edits on different lines and rejects the same line", () => {
    expect(mergeText("a\nb\nc\nd", "A\nb\nc\nd", "a\nb\nc\nD")).toBe("A\nb\nc\nD");
    expect(mergeText("a\nb\nc", "a\nX\nc", "a\nY\nc")).toBeNull();
    expect(mergeText("a\nb\nc", "a\nX\nc", "a\nX\nc")).toBe("a\nX\nc");
  });
  it("merges inserts at different places and identical edits once", () => {
    expect(mergeText("a\nb\nc", "new\na\nb\nc", "a\nb\nc\nend")).toBe("new\na\nb\nc\nend");
  });
  it("handles one side unchanged", () => {
    expect(mergeText("a", "a", "b")).toBe("b");
    expect(mergeText("a", "b", "a")).toBe("b");
  });
});

describe("mergeSpecs", () => {
  it("returns the incoming spec's change when only they changed it", () => {
    const b = base();
    const t = clone(b);
    t.summary = "theirs";
    const r = mergeSpecs(b, clone(b), t);
    expect(r.conflicts).toEqual([]);
    expect(r.spec.summary).toBe("theirs");
    expect(r.merged).toBe(1);
  });

  it("merges edits to different top-level keys from both sides", () => {
    const b = base();
    const o = clone(b);
    o.summary = "ours";
    const t = clone(b);
    t.code = "line1\nline2\nline3\nline4\nline5\nline6";
    const r = mergeSpecs(b, o, t);
    expect(r.conflicts).toEqual([]);
    expect(r.spec.summary).toBe("ours");
    expect(r.spec.code).toContain("line6");
  });

  it("merges different fields of the same 3D part, and different parts", () => {
    const b = base();
    const o = clone(b);
    (o.parts[0] as Record<string, unknown>).pos = [5, 0, 0];
    (o.parts[1] as Record<string, unknown>).color = "#000";
    const t = clone(b);
    (t.parts[0] as Record<string, unknown>).size = [20, 10, 10];
    const r = mergeSpecs(b, o, t);
    expect(r.conflicts).toEqual([]);
    const a = r.spec.parts.find((p: { id: string }) => p.id === "a") as Record<string, unknown>;
    expect(a.pos).toEqual([5, 0, 0]);
    expect(a.size).toEqual([20, 10, 10]);
    expect((r.spec.parts.find((p: { id: string }) => p.id === "b") as Record<string, unknown>).color).toBe("#000");
  });

  it("keeps parts added by both sides and parts one side removed", () => {
    const b = base();
    const o = clone(b);
    o.parts.push(box("ours") as never);
    const t = clone(b);
    t.parts.push(box("theirs") as never);
    t.parts = t.parts.filter((p: { id: string }) => p.id !== "b");
    const r = mergeSpecs(b, o, t);
    expect(r.conflicts).toEqual([]);
    expect(r.spec.parts.map((p: { id: string }) => p.id)).toEqual(["a", "ours", "theirs"]);
  });

  it("reports a conflict only when both changed the same field differently; the head value stays", () => {
    const b = base();
    const o = clone(b);
    (o.parts[0] as Record<string, unknown>).pos = [1, 1, 1];
    const t = clone(b);
    (t.parts[0] as Record<string, unknown>).pos = [2, 2, 2];
    const r = mergeSpecs(b, o, t);
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0].path).toBe("parts[a].pos");
    expect((r.spec.parts[0] as Record<string, unknown>).pos).toEqual([1, 1, 1]);
  });

  it("both making the same change is not a conflict", () => {
    const b = base();
    const o = clone(b);
    const t = clone(b);
    o.summary = "same";
    t.summary = "same";
    const r = mergeSpecs(b, o, t);
    expect(r.conflicts).toEqual([]);
    expect(r.merged).toBe(0);
  });

  it("removing a part the other side edited is a conflict (the edit is kept)", () => {
    const b = base();
    const o = clone(b);
    (o.parts[1] as Record<string, unknown>).color = "#123";
    const t = clone(b);
    t.parts = t.parts.filter((p: { id: string }) => p.id !== "b");
    const r = mergeSpecs(b, o, t);
    expect(r.conflicts.map((c) => c.path)).toEqual(["parts[b]"]);
    expect(r.spec.parts.map((p: { id: string }) => p.id)).toContain("b");
  });

  it("merges circuit parts, props and wires by id", () => {
    const b = base();
    const o = clone(b);
    o.circuit.parts[1].x = 300; // we moved the LED
    o.circuit.parts.push({ id: "r1", type: "resistor", x: 5, y: 5 } as never);
    const t = clone(b);
    t.circuit.parts[1].props = { color: "green" }; // they recoloured it
    t.circuit.wires.push({ id: "w2", from: "board.D12", to: "led1.cathode" });
    const r = mergeSpecs(b, o, t);
    expect(r.conflicts).toEqual([]);
    const c = r.spec.circuit as typeof b.circuit;
    const led = c.parts.find((p) => p.id === "led1")!;
    expect(led.x).toBe(300);
    expect(led.props).toEqual({ color: "green" });
    expect(c.parts.map((p) => p.id)).toContain("r1");
    expect(c.wires.map((w) => w.id)).toEqual(["w1", "w2"]);
  });

  it("merges props by key: different keys combine, the same key conflicts", () => {
    const b = base();
    b.circuit.parts[1].props = { color: "red", extra: 1 } as never;
    const o = clone(b);
    (o.circuit.parts[1].props as Record<string, unknown>).extra = 2;
    const t = clone(b);
    (t.circuit.parts[1].props as Record<string, unknown>).color = "blue";
    expect(mergeSpecs(b, o, t).conflicts).toEqual([]);
    const t2 = clone(b);
    (t2.circuit.parts[1].props as Record<string, unknown>).extra = 3;
    expect(mergeSpecs(b, o, t2).conflicts.map((c) => c.path)).toEqual(["circuit.parts[led1].props.extra"]);
  });

  it("a wire to a part that the other side removed is dropped", () => {
    const b = base();
    const o = clone(b);
    o.circuit.parts = o.circuit.parts.filter((p) => p.id !== "led1");
    o.circuit.wires = [];
    const t = clone(b);
    t.circuit.wires.push({ id: "w9", from: "board.D2", to: "led1.cathode" });
    const r = mergeSpecs(b, o, t);
    expect((r.spec.circuit as typeof b.circuit).wires).toEqual([]);
  });

  it("merges parameters by key, and steps by id", () => {
    const b = base();
    const o = clone(b);
    o.params[0].value = 8;
    const t = clone(b);
    t.params[1].max = 20;
    t.params.push({ key: "d", label: "Depth", value: 1, min: 0, max: 5, step: 1 });
    t.steps.push({ id: "s2", title: "Two", detail: "d", check: { kind: "manual" } });
    const r = mergeSpecs(b, o, t);
    expect(r.conflicts).toEqual([]);
    expect(r.spec.params.map((p: { key: string }) => p.key)).toEqual(["w", "h", "d"]);
    expect(r.spec.params[0].value).toBe(8);
    expect(r.spec.params[1].max).toBe(20);
    expect(r.spec.steps).toHaveLength(2);
  });

  it("merges program edits on different lines, conflicts on the same line", () => {
    const b = base();
    const o = clone(b);
    o.code = "LINE1\nline2\nline3\nline4\nline5";
    const t = clone(b);
    t.code = "line1\nline2\nline3\nline4\nLINE5";
    expect(mergeSpecs(b, o, t).spec.code).toBe("LINE1\nline2\nline3\nline4\nLINE5");
    const t2 = clone(b);
    t2.code = "other\nline2\nline3\nline4\nline5";
    const r = mergeSpecs(b, o, t2);
    expect(r.conflicts.map((c) => c.path)).toEqual(["code"]);
  });

  it("the merged result is a valid design and does not mutate its inputs", () => {
    const b = base();
    const o = clone(b);
    o.summary = "ours";
    const t = clone(b);
    t.parts.push(box("c") as never);
    const snap = JSON.stringify([b, o, t]);
    const r = mergeSpecs(parseSpec(b), parseSpec(o), parseSpec(t));
    expect(JSON.stringify([b, o, t])).toBe(snap);
    expect(() => parseSpec(r.spec)).not.toThrow();
    expect(r.applied.length).toBeGreaterThan(0);
  });

  it("works without a base (two independent histories): everything that differs is a conflict", () => {
    const o = base();
    const t = clone(o);
    t.summary = "x";
    const r = mergeSpecs(null, o, t);
    expect(r.conflicts.map((c) => c.path)).toContain("summary");
  });

  it("same() ignores key order", () => {
    expect(same({ a: 1, b: [1, { c: 2, d: 3 }] }, { b: [1, { d: 3, c: 2 }], a: 1 })).toBe(true);
  });
});
