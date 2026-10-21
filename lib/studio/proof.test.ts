import { describe, expect, it } from "vitest";
import { parseSpec } from "./spec";
import { getTemplate, TEMPLATES } from "./templates";
import { canProve, proofSpec, shoppingList } from "./proof";
import { verifyStep } from "./verify";

const ref = () => parseSpec(getTemplate("traffic-light")!.spec);

describe("Prove it (rebuild from an empty bench)", () => {
  it("lists what the reference is made of, grouped by type, without the board", () => {
    const list = shoppingList(ref());
    expect(list.find((i) => i.type === "led")?.count).toBe(3);
    expect(list.find((i) => i.type === "resistor")?.count).toBe(3);
    expect(list.some((i) => i.type === "board")).toBe(false);
  });

  it("starts empty: no parts, no wires, no code, no reference tests leaking", () => {
    const spec = proofSpec(ref())!;
    expect(spec.circuit!.parts.map((p) => p.type)).toEqual(["board"]);
    expect(spec.circuit!.wires).toEqual([]);
    expect(spec.parts).toEqual([]);
    expect(spec.tests).toEqual([]);
    expect(spec.code).not.toMatch(/digitalWrite/);
    expect(spec.codeMode).toBe("blocks");
  });

  it("every step is machine-checkable except the last 'run it' step, and none passes on the empty bench", () => {
    const spec = proofSpec(ref())!;
    const checked = spec.steps.filter((s) => s.check.kind !== "manual");
    expect(checked.length).toBeGreaterThanOrEqual(3);
    for (const s of checked) expect(verifyStep(spec, s).done, s.title).toBe(false);
  });

  it("the reference build itself satisfies the proof's parts and wiring steps", () => {
    const reference = ref();
    const proof = proofSpec(reference)!;
    for (const s of proof.steps.filter((x) => x.check.kind === "parts" || x.check.kind === "built")) expect(verifyStep(reference, s).done, s.title).toBe(true);
  });

  it("wiring only counts once the right parts are placed and everything is connected", () => {
    const reference = ref();
    const proof = proofSpec(reference)!;
    const built = proof.steps.find((s) => s.check.kind === "built")!;
    // parts placed but not wired: not done
    const placedOnly = { ...proof, circuit: { parts: reference.circuit!.parts, wires: [] } };
    expect(verifyStep(placedOnly, built).done).toBe(false);
    // one resistor short: not done even though the rest is wired
    const short = { ...reference, circuit: { ...reference.circuit!, parts: reference.circuit!.parts.filter((p) => p.id !== "r1") } };
    expect(verifyStep(short, built).done).toBe(false);
  });

  it("only circuit labs can be rebuilt", () => {
    const kinds = new Set<string>();
    for (const t of TEMPLATES) {
      const spec = parseSpec(t.spec);
      kinds.add(spec.kind);
      expect(canProve(spec) && proofSpec(spec) !== null || (!canProve(spec) && proofSpec(spec) === null)).toBe(true);
      if (spec.kind !== "circuit") expect(proofSpec(spec)).toBeNull();
    }
    expect(kinds.size).toBeGreaterThan(1);
  });
});
